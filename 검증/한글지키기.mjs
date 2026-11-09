/**
 * **검증이 띄운 한글이 사용자의 한글을 막지 못하게 한다.**
 *
 * 2026-11-06 에 실제로 겪었다 (`자료/실측.md` 40항). 숨은 한글이 파일 하나를 여는 데서 멈추자
 * 사용자가 켜는 한글까지 시작 화면에서 멎었다. 한 시간 넘게 아무도 몰랐다. 구멍은 셋이었다:
 *
 *   - **시간 제한이 powershell 만 끊는다.** COM 이 띄운 Hwp 는 svchost 의 자식이라 안 끊긴다.
 *   - **멈춘 Hwp 를 볼 사람이 없다.** 숨은 창이고, 시간 제한은 길게는 50분이다.
 *   - **멈춘 것을 모른 채 다음 갈래가 또 띄운다.** 갈래가 줄줄이 COM 오류로 끝난다.
 *
 * 그래서 `execFileSync('powershell', …)` 대신 `한글돌리기` 를 부른다. **제가 띄운 PID 만** 닫는다.
 * 사용자가 켠 한글(explorer 의 자식)과, 시작 전부터 있던 한글은 건드리지 않는다.
 *
 *   node 검증/한글지키기.mjs              지금 한글을 띄워도 되나 본다
 *   node 검증/한글지키기.mjs --대역시험    한글을 안 띄우고 닫는 길을 본다 (한글을 쓰는 중에도 된다)
 *   node 검증/한글지키기.mjs --자기시험    숨은 빈 한글을 띄워 닫히는지 본다 (한글을 안 쓸 때)
 */
import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 이만큼 CPU 를 쉬지 않고 붙들면 멈춘 것으로 본다. 파일 하나 여는 일은 몇 초다 */
const 파수꾼기본초 = 300;
/** 시간 제한을 안 준 호출의 몫. 안 주면 영원히 기다린다 */
const 기본제한 = 1_800_000;

/**
 * `$hwp = New-Object …` 대신 쓰는 PowerShell 줄. **띄우기 전후를 견줘** 제 PID 를 적는다.
 * 부모가 svchost 인 것만 적는다 — 그 몇 초 사이에 사용자가 켠 한글을 제 것으로 치지 않는다.
 * `-Command` 로도 넘어가도록 큰따옴표를 안 쓴다. `-File` 로도 넘어가도록 ASCII 만 쓴다.
 */
export const 한글띄우기 = [
  '$hwpBefore = @(Get-Process Hwp -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })',
  '$hwp = New-Object -ComObject HWPFrame.HwpObject',
  "if ($env:HWPX_HWP_PIDFILE) { Get-CimInstance Win32_Process -Filter 'Name=''Hwp.exe''' | Where-Object { ($hwpBefore -notcontains $_.ProcessId) -and ((Get-Process -Id $_.ParentProcessId -ErrorAction SilentlyContinue).ProcessName -eq 'svchost') } | ForEach-Object { Add-Content -LiteralPath $env:HWPX_HWP_PIDFILE -Value $_.ProcessId -Encoding Ascii } }",
].join('\n');

/**
 * 파수꾼 — 따로 떠서 지켜본다 (`.ps1` 로 쓰므로 ASCII 만). 할 일 둘:
 *   - 제 Hwp 가 CPU 를 쉬지 않고 붙들면 닫는다 (Open 안에서 도는 꼴. 시간 제한을 기다리지 않는다)
 *   - 부른 node 가 죽으면 제 Hwp 를 닫는다 (뒤처리를 못 하고 죽는 일이 실제로 있었다 — 종료 코드 4)
 */
const 파수꾼글 = `
$f = $env:HWPX_WATCH_FILE; $parent = [int]$env:HWPX_WATCH_PARENT; $limit = [int]$env:HWPX_WATCH_LIMIT
$run = @{}; $last = @{}
while (Test-Path -LiteralPath $f) {
  Start-Sleep -Seconds 10
  $ids = @(Get-Content -LiteralPath $f -ErrorAction SilentlyContinue | Where-Object { $_ -match '^[0-9]+$' })
  $alive = [bool](Get-Process -Id $parent -ErrorAction SilentlyContinue)
  foreach ($id in $ids) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if (-not $p -or $p.ProcessName -ne 'Hwp') { continue }
    if (-not $alive) { Stop-Process -Id $id -Force; continue }
    $c = $p.TotalProcessorTime.TotalSeconds
    if ($last.ContainsKey($id) -and (($c - $last[$id]) -ge 7)) { $run[$id] = [int]$run[$id] + 10 } else { $run[$id] = 0 }
    $last[$id] = $c
    if ($run[$id] -ge $limit) { Add-Content -LiteralPath ($f + '.killed') -Value $id -Encoding Ascii; Stop-Process -Id $id -Force }
  }
  if (-not $alive) { Remove-Item -LiteralPath $f -ErrorAction SilentlyContinue; break }
}
Remove-Item -LiteralPath ($f + '.ps1') -ErrorAction SilentlyContinue
`;

const 잠깐 = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** 살아 있는 한글이면 참. PID 는 다시 쓰이므로 이름까지 본다 */
function 한글인가(id) {
  try {
    return /hwp\.exe/i.test(execFileSync('tasklist', ['/FI', `PID eq ${id}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' }));
  } catch { return false; }
}

function 적은것(파일) {
  try { return fs.readFileSync(파일, 'ascii').split(/\r?\n/).filter((x) => /^\d+$/.test(x)); } catch { return []; }
}

/**
 * `execFileSync` 와 똑같이 부른다. 끝나면(시간 초과·오류여도) 제가 띄운 한글이 안 닫혔으면 닫는다.
 * 스크립트에서 `$hwp = New-Object …` 대신 `한글띄우기` 를 써야 PID 가 적힌다.
 *
 * @param {{ 파수꾼초?: number }} [설정] 나머지는 execFileSync 설정 그대로
 */
export function 한글돌리기(명령, 인자, 설정 = {}) {
  const { 파수꾼초 = 파수꾼기본초, ...실행설정 } = 설정;
  const 자리 = path.join(os.tmpdir(), `hwpx-hangul-${process.pid}-${Date.now()}.pid`);
  fs.writeFileSync(자리, '');
  // **한 번 건너 띄운다.** node 가 바로 띄우면 node 와 같이 죽어 뒤처리를 못 하고(대역 시험 5번),
  // detached 를 주면 powershell 이 아무 말 없이 끝나 아예 안 돈다. 둘 다 대역 시험이 잡았다.
  fs.writeFileSync(`${자리}.ps1`, 파수꾼글);
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    "Start-Process powershell -WindowStyle Hidden -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File ' + [char]34 + $env:HWPX_WATCH_FILE + '.ps1' + [char]34)",
  ], {
    stdio: 'ignore', windowsHide: true, timeout: 60_000,
    env: { ...process.env, HWPX_WATCH_FILE: 자리, HWPX_WATCH_PARENT: String(process.pid), HWPX_WATCH_LIMIT: String(파수꾼초) },
  });
  try {
    return execFileSync(명령, 인자, {
      timeout: 기본제한, ...실행설정, env: { ...process.env, ...실행설정.env, HWPX_HWP_PIDFILE: 자리 },
    });
  } finally {
    for (const id of 적은것(자리)) {
      // Quit 은 곧바로 안 끝난다 — 조금 기다려 주고, 그래도 있으면 닫는다
      for (let i = 0; i < 10 && 한글인가(id); i++) 잠깐(1000);
      if (한글인가(id)) {
        try {
          execFileSync('taskkill', ['/PID', id, '/F'], { stdio: 'ignore' });
          console.error(`※ 검증이 띄운 한글 PID ${id} 이 안 닫혀 닫았다`);
        } catch { console.error(`※ 검증이 띄운 한글 PID ${id} 을 못 닫았다 — 새 한글이 막힐 수 있다`); }
      }
    }
    for (const id of 적은것(`${자리}.killed`)) {
      console.error(`※ 검증이 띄운 한글 PID ${id} 이 CPU 를 ${파수꾼초}초 넘게 붙들고 있어 닫았다 — 어떤 파일에서 멈췄는지 봐야 한다`);
    }
    fs.rmSync(자리, { force: true });
    fs.rmSync(`${자리}.killed`, { force: true });
    fs.rmSync(`${자리}.ps1`, { force: true });
  }
}

/** 지금 떠 있는 한글을 가른다. **자동화** 는 COM 이 띄운 것(svchost 의 자식), 나머지는 **사용자** 것으로 친다 */
export function 한글살피기() {
  const ps = [
    "$r = @(Get-CimInstance Win32_Process -Filter 'Name=''Hwp.exe''' | ForEach-Object {",
    '  $parent = (Get-Process -Id $_.ParentProcessId -ErrorAction SilentlyContinue).ProcessName',
    '  $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue',
    "  '{0} {1} {2:n0}' -f $_.ProcessId, $(if ($parent -eq 'svchost') { 'A' } else { 'U' }), $p.TotalProcessorTime.TotalSeconds",
    '})',
    '$r',
  ].join('\n');
  const 말 = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', timeout: 60_000 });
  const 줄들 = 말.split(/\r?\n/).map((x) => x.trim().split(' ')).filter((x) => x.length >= 3);
  const 고름 = (갈래) => 줄들.filter((x) => x[1] === 갈래).map((x) => ({ pid: Number(x[0]), cpu초: x[2] }));
  return { 자동화: 고름('A'), 사용자: 고름('U') };
}

/** 한글 갈래를 시작해도 되나. 안 되면 까닭을 준다. **아무것도 닫지 않는다** — 누구 것인지 모른다 */
export function 한글띄워도되나({ 켜둔한글괜찮음 = false } = {}) {
  const { 자동화, 사용자 } = 한글살피기();
  if (자동화.length > 0) {
    return `남아 있는 자동화 한글이 있다 (${자동화.map((x) => `PID ${x.pid}, CPU ${x.cpu초}초`).join(' / ')}). `
      + '멈춘 것이면 새 한글이 다 막힌다. 누가 띄운 것인지 보고 닫은 뒤 다시 돌려라';
  }
  if (사용자.length > 0 && !켜둔한글괜찮음) {
    return `사용자가 쓰는 한글이 떠 있다 (${사용자.map((x) => `PID ${x.pid}`).join(', ')}). `
      + '한글 작업이 끝난 뒤 돌리거나, 괜찮으면 --켜둔한글괜찮음 을 붙여라';
  }
  return undefined;
}

// ── 자기 시험 ─────────────────────────────────────────────────────────────
function 숨은한글스크립트(뒤) {
  return [
    "$ErrorActionPreference = 'Stop'",
    한글띄우기,
    'try { $hwp.XHwpWindows.Item(0).Visible = $false } catch {}',
    뒤,
  ].join('\n');
}
const 파워쉘인자 = (글) => ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 글];

/** 시험 안에서 새로 뜬 자동화 한글들 */
const 새자동화 = (전) => 한글살피기().자동화.filter((x) => !전.includes(x.pid)).map((x) => x.pid);

function 자기시험() {
  const 막힘 = 한글띄워도되나({ 켜둔한글괜찮음: process.argv.includes('--켜둔한글괜찮음') });
  if (막힘) { console.error(`✗ ${막힘}`); process.exit(2); }
  const 처음 = 한글살피기();
  const 전 = [];
  const 탈 = [];
  const 보기 = (말, 됐나) => { console.log(`  ${됐나 ? '○' : '✗'} ${말}`); if (!됐나) 탈.push(말); };

  // 1) 멀쩡히 Quit 하면 조용히 끝난다
  한글돌리기('powershell', 파워쉘인자(숨은한글스크립트('$hwp.Clear(1) | Out-Null; $hwp.Quit()')), { timeout: 120_000, stdio: 'pipe' });
  보기('Quit 한 한글은 남지 않는다', 새자동화(전).length === 0);

  // 2) Quit 안 하고 끝나면 닫는다 — 스크립트가 도중에 죽는 꼴
  한글돌리기('powershell', 파워쉘인자(숨은한글스크립트('# Quit 안 함')), { timeout: 120_000, stdio: 'pipe' });
  보기('Quit 없이 끝난 한글을 닫는다', 새자동화(전).length === 0);

  // 3) 시간 제한에 걸려도 닫는다 — powershell 만 끊기고 Hwp 가 남던 꼴
  let 끊겼나 = false;
  try {
    한글돌리기('powershell', 파워쉘인자(숨은한글스크립트('Start-Sleep -Seconds 300')), { timeout: 40_000, stdio: 'pipe' });
  } catch { 끊겼나 = true; }
  보기('시간 제한에 걸린 스크립트가 띄운 한글을 닫는다', 끊겼나 && 새자동화(전).length === 0);

  // 4) 파수꾼이 닫는다 — 시간 제한을 기다리지 않는다
  const 시작 = Date.now();
  try {
    한글돌리기('powershell', 파워쉘인자(숨은한글스크립트('Start-Sleep -Seconds 40; $hwp.Visible')), { timeout: 90_000, stdio: 'pipe', 파수꾼초: 0 });
  } catch { /* 닫힌 한글을 부르다 나는 오류는 상관없다 */ }
  보기(`파수꾼이 한글을 닫는다 (${Math.round((Date.now() - 시작) / 1000)}초)`, 새자동화(전).length === 0);

  // 5) 부른 node 가 죽어도 닫는다
  const 자식 = spawn(process.execPath, [fileURLToPath(import.meta.url), '--자식'], { stdio: 'ignore' });
  for (let i = 0; i < 40 && 새자동화(전).length === 0; i++) 잠깐(1000);
  const 뜬것 = 새자동화(전);
  자식.kill();
  for (let i = 0; i < 40 && 새자동화(전).length > 0; i++) 잠깐(1000);
  보기(`부른 node 가 죽으면 한글(${뜬것.join(',')})을 닫는다`, 뜬것.length > 0 && 새자동화(전).length === 0);

  // 6) 사용자 한글은 그대로다
  const 끝 = 한글살피기();
  보기(`사용자 한글을 안 건드렸다 (${처음.사용자.map((x) => x.pid).join(',') || '없었음'})`,
    처음.사용자.every((x) => 끝.사용자.some((y) => y.pid === x.pid)));

  console.log(탈.length ? `✗ ${탈.length}개 탈` : '○ 다 됐다');
  process.exit(탈.length ? 1 : 0);
}

// ── 대역 시험 — 진짜 한글을 안 띄운다 ──────────────────────────────────────
//
// node.exe 를 `Hwp.exe` 라는 이름으로 베껴 한글 자리에 세운다. 사용자가 한글을 쓰는 중에도 돌릴 수
// 있고, 닫는 길을 전부 지난다. 못 보는 것은 하나 — COM 이 띄운 PID 를 적는 `한글띄우기` 줄이다.
// 그것은 `--자기시험` 이 본다.
const 도는대역 = 'while(true){}';
const 쉬는대역 = 'setInterval(function(){},1000)';
const 대역세우기 = (코드) => `$p = Start-Process -FilePath $env:HWPX_STANDIN -ArgumentList '-e','${코드}' -PassThru -WindowStyle Hidden; Add-Content -LiteralPath $env:HWPX_HWP_PIDFILE -Value $p.Id -Encoding Ascii`;

function 대역들() {
  const 말 = execFileSync('powershell', 파워쉘인자(
    // Get-Process 는 한글이 하나도 없으면 powershell 종료 코드가 1 이 된다 — 한글이 켜져 있을 때만 통과하는 시험이었다
    "Get-CimInstance Win32_Process -Filter 'Name=''Hwp.exe''' | Where-Object { $_.ExecutablePath -eq $env:HWPX_STANDIN } | ForEach-Object { $_.ProcessId }",
  ), { encoding: 'utf8', timeout: 60_000 });
  return 말.split(/\r?\n/).map((x) => x.trim()).filter((x) => /^\d+$/.test(x));
}

function 대역시험() {
  const 자리 = fs.mkdtempSync(path.join(os.tmpdir(), 'hwpx-standin-'));
  process.env.HWPX_STANDIN = path.join(자리, 'Hwp.exe');
  fs.copyFileSync(process.execPath, process.env.HWPX_STANDIN);
  const 처음 = 한글살피기();
  const 탈 = [];
  const 보기 = (말, 됐나) => { console.log(`  ${됐나 ? '○' : '✗'} ${말}`); if (!됐나) 탈.push(말); };
  const 돌리기 = (글, 설정) => 한글돌리기('powershell', 파워쉘인자(글), { encoding: 'utf8', stdio: 'pipe', ...설정 });

  try {
    // 1) 스크립트가 안 닫고 끝났다
    돌리기(대역세우기(쉬는대역), { timeout: 60_000 });
    보기('안 닫고 끝난 것을 닫는다', 대역들().length === 0);

    // 2) 시간 제한에 걸렸다 — powershell 만 끊기고 Hwp 가 남던 꼴. 이번 사고의 첫 구멍
    let 끊겼나 = false;
    try { 돌리기(`${대역세우기(쉬는대역)}; Start-Sleep -Seconds 300`, { timeout: 8_000 }); } catch { 끊겼나 = true; }
    보기('시간 제한에 걸린 스크립트가 세운 것을 닫는다', 끊겼나 && 대역들().length === 0);

    // 3) CPU 를 붙들고 안 돌아온다 — 이번 사고의 꼴. 시간 제한(100초)보다 **먼저** 닫혀야 한다
    const 시작 = Date.now();
    돌리기(`${대역세우기(도는대역)}; Wait-Process -Id $p.Id`, { timeout: 100_000, 파수꾼초: 20 });
    const 걸린초 = Math.round((Date.now() - 시작) / 1000);
    보기(`CPU 를 붙든 것을 파수꾼이 닫는다 (${걸린초}초)`, 걸린초 < 90 && 대역들().length === 0);

    // 4) 쉬고 있는 것은 파수꾼이 안 닫는다 — 오래 걸리는 정상 작업을 죽이면 안 된다
    const 말 = 돌리기(`${대역세우기(쉬는대역)}; Start-Sleep -Seconds 45; if (Get-Process -Id $p.Id -ErrorAction SilentlyContinue) { 'alive' }`, { timeout: 100_000, 파수꾼초: 20 });
    보기('쉬고 있는 것은 파수꾼이 안 닫는다', /alive/.test(말) && 대역들().length === 0);

    // 5) 부른 node 가 뒤처리 없이 죽었다 (hangul3 의 종료 코드 4)
    const 자식 = spawn(process.execPath, [fileURLToPath(import.meta.url), '--대역자식'], { stdio: 'ignore', env: process.env });
    for (let i = 0; i < 30 && 대역들().length === 0; i++) 잠깐(1000);
    const 뜬것 = 대역들();
    자식.kill();
    for (let i = 0; i < 40 && 대역들().length > 0; i++) 잠깐(1000);
    보기(`부른 node 가 죽으면 닫는다 (${뜬것.join(',')})`, 뜬것.length > 0 && 대역들().length === 0);

    // 6) 사용자 한글은 그대로다
    const 끝 = 한글살피기();
    보기(`사용자 한글을 안 건드렸다 (${처음.사용자.map((x) => x.pid).join(',') || '없었음'})`,
      처음.사용자.every((x) => 끝.사용자.some((y) => y.pid === x.pid)));
  } finally {
    for (const id of 대역들()) { try { execFileSync('taskkill', ['/PID', id, '/F'], { stdio: 'ignore' }); } catch { /* 이미 닫힘 */ } }
    fs.rmSync(자리, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
  console.log(탈.length ? `✗ ${탈.length}개 탈` : '○ 다 됐다');
  process.exit(탈.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--대역시험')) {
    대역시험();
  } else if (process.argv.includes('--대역자식')) {
    한글돌리기('powershell', 파워쉘인자(`${대역세우기(쉬는대역)}; Start-Sleep -Seconds 30`), { timeout: 60_000, stdio: 'ignore' });
  } else if (process.argv.includes('--자식')) {
    한글돌리기('powershell', 파워쉘인자(숨은한글스크립트('Start-Sleep -Seconds 120')), { timeout: 200_000, stdio: 'ignore' });
  } else if (process.argv.includes('--자기시험')) {
    자기시험();
  } else {
    const 말 = 한글띄워도되나({ 켜둔한글괜찮음: process.argv.includes('--켜둔한글괜찮음') });
    if (말) { console.error(`✗ ${말}`); process.exit(1); }
    console.log('○ 한글을 띄워도 된다');
  }
}
