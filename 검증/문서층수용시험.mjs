/**
 * **문서 계층이 고친 문서를 한글이 받아들이는가.**
 *
 * 3단계의 관문이다. 시험이 다 통과해도 한글이 안 받으면 아무 뜻이 없다.
 *
 * 기준 파일마다:
 *   1. 글을 바꾸고
 *   2. 글자 서식을 주고 (charPr 복제·지문)
 *   3. 문단 여백·정렬을 주고 (hp:case / hp:default)
 *   4. 어구를 강조하고 (런 쪼개기)
 *   5. 표가 있으면 열 폭·셀 여백·머리행 반복을 주고
 *   6. 저장한 뒤 한글에 먹인다
 *
 * 그리고 한글이 뱉은 것에서 **우리가 준 값이 살아 있는지** 확인한다.
 * 여는 것만 보면 모자라다 — 한글이 열고도 우리 것을 버릴 수 있다.
 *
 * 한글은 한 번만 띄운다. 경로에 한글(글자)을 넣지 않는다.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const B = (p) => pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', p, 'src', 'index.js')).href;

const { 문서, 표 } = await import(B('doc'));
const { parseXml, findAll, findFirst, firstChildNamed, getAttr } = await import(B('owpml'));
const { HwpxContainer, 부품 } = await import(B('hwpx'));

const 무대 = path.join(os.tmpdir(), 'hwpx-doclayer');
const 앞마당 = path.join(무대, 'ours');
const 뒷마당 = path.join(무대, 'hwp');
for (const d of [앞마당, 뒷마당]) {
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
}

const 표시 = 'DOC3단계표시';
const 강조할것 = '표시';           // 위 글 안의 조각
const 왼쪽여백 = 2000;
const 셀여백 = 1700;

const 기준파일 = path.join(뿌리, '자료', '기준파일');
const 목록 = fs.readdirSync(기준파일).filter((f) => f.toLowerCase().endsWith('.hwpx')).sort();

const 한것 = new Map();
const 준비실패 = [];

// ── 1. 문서 계층으로 고쳐 내놓는다 ────────────────────────────────────────
for (const 이름 of 목록) {
  try {
    const d = 문서.열기(fs.readFileSync(path.join(기준파일, 이름)));
    d.ID매기기();

    const s = d.구역들[0];
    const 문단들 = s.문단들.filter((p) => !p.비었나);
    const 쓸문단 = 문단들[0] ?? s.문단들[0];
    if (!쓸문단) { 준비실패.push([이름, '문단이 없다']); continue; }
    const pid = d.이름표.아이디(쓸문단.el);

    const 한일 = { 글: false, 글자서식: false, 문단서식: false, 강조: false, 표: false };

    const r1 = d.글바꾸기(pid, 표시);
    한일.글 = r1.ok;

    const r2 = d.글자서식주기(pid, { 크기: 13, 굵게: true });
    한일.글자서식 = r2.ok;

    const r3 = d.문단서식주기(pid, { 왼쪽여백, 정렬: 'CENTER' });
    한일.문단서식 = r3.ok;
    const paraPrId = r3.ok ? r3.value.paraPrId : null;

    const r4 = d.강조하기(pid, 강조할것, { 색: '#C00000' });
    한일.강조 = r4.ok;
    // **거절은 실패가 아니다.** 표·그림과 같은 런에 든 글은 쪼개면 안 되니 거절한다.
    // 그 까닭을 모아 두고 끝에 보여 준다 — 안 보여 주면 거절이 조용해진다.
    const 거절 = r4.ok ? null : r4.이유;

    // 표가 있으면 만져 본다
    let 표잰것 = null;
    const 표들 = s.표들;
    if (표들.length) {
      const t = new 표(표들[0]);
      const 폭들 = new Array(t.칸수).fill(0).map(() => Math.floor(40000 / t.칸수));
      const w = t.열폭주기(폭들);
      const c = t.셀(0, 0);
      if (c) c.안여백주기({ left: 셀여백, right: 셀여백 });
      t.머리행반복주기(true);
      한일.표 = w.ok;
      표잰것 = { 폭: 폭들[0], 셀여백 };
    }

    const 탈 = d.검사();
    if (탈.length) { 준비실패.push([이름, `저장 전 검사에 걸림: ${탈.slice(0, 2).join(' / ')}`]); continue; }

    fs.writeFileSync(path.join(앞마당, 이름), d.저장());
    한것.set(이름, { 한일, paraPrId, 표잰것, 거절, 꼭돼야하는것: { 글: r1.ok, 글자서식: r2.ok, 문단서식: r3.ok } });
  } catch (e) {
    준비실패.push([이름, e.message.split('\n')[0]]);
  }
}

// ── 2. 한글 한 번 띄워 전부 열어 본다 ─────────────────────────────────────
const ps = `
$ErrorActionPreference = 'Continue'
$hwp = New-Object -ComObject HWPFrame.HwpObject
try { $hwp.RegisterModule("FilePathCheckDLL","FilePathCheckerModule") | Out-Null } catch {}
try {
  foreach ($f in Get-ChildItem -Path '${앞마당}' -Filter *.hwpx) {
    $out = Join-Path '${뒷마당}' $f.Name
    try {
      if ($hwp.Open($f.FullName, "", "forceopen:true")) {
        if ($hwp.SaveAs($out, "HWPX", "")) { Write-Output ("OK ||| " + $f.Name) }
        else { Write-Output ("SAVEFAIL ||| " + $f.Name) }
      } else { Write-Output ("OPENFAIL ||| " + $f.Name) }
    } catch { Write-Output ("THROW ||| " + $f.Name + " ||| " + $_.Exception.Message) }
    try { $hwp.Clear(1) | Out-Null } catch {}
  }
} finally { try { $hwp.Quit() | Out-Null } catch {} }
`;
const 결과 = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
  encoding: 'buffer', timeout: 900_000, maxBuffer: 1 << 24,
}).toString('utf8');

const 한글판정 = new Map();
for (const 줄 of 결과.split(/\r?\n/)) {
  const [상태, 이름, 덧] = 줄.split(' ||| ');
  if (이름) 한글판정.set(이름.trim(), { 상태, 덧 });
}

// ── 3. 한글이 뱉은 것에서 우리 값이 살아 있나 ─────────────────────────────
let 통과 = 0;
const 실패 = [...준비실패];
const 확인한것 = { 글: 0, 굵게: 0, 여백: 0, 정렬: 0, 강조: 0, 셀여백: 0, 머리행: 0 };

for (const 이름 of 목록) {
  const 낸것 = 한것.get(이름);
  if (!낸것) continue;
  const 판정 = 한글판정.get(이름);
  if (!판정) { 실패.push([이름, '한글이 아무 말도 안 했다']); continue; }
  if (판정.상태 !== 'OK') { 실패.push([이름, `한글: ${판정.상태}${판정.덧 ? ' — ' + 판정.덧 : ''}`]); continue; }

  try {
    const c = HwpxContainer.open(fs.readFileSync(path.join(뒷마당, 이름)));
    const 구역 = parseXml(c.readText(c.sectionNames()[0]));
    const 머리 = parseXml(c.readText(부품.header));
    const 문제 = [];

    // 글
    const 온글 = findAll(구역.root, 'hp:t').map((t) => (t.children[0]?.raw ?? '')).join('');
    if (낸것.한일.글) {
      if (!온글.includes(표시)) 문제.push('우리가 넣은 글이 사라졌다');
      else 확인한것.글++;
    }

    // 굵게 — 우리가 준 문단의 런이 가리키는 charPr 에 hh:bold 가 있나
    if (낸것.한일.글자서식) {
      const 굵은게있나 = findAll(머리.root, 'hh:charPr')
        .some((cp) => firstChildNamed(cp, 'hh:bold') && getAttr(cp, 'height') === '1300');
      if (!굵은게있나) 문제.push('13pt 굵은 글자모양이 사라졌다');
      else 확인한것.굵게++;
    }

    // 문단 여백·정렬
    if (낸것.한일.문단서식) {
      const 여백맞는게있나 = findAll(머리.root, 'hh:paraPr').some((pp) => {
        const sw = firstChildNamed(pp, 'hp:switch');
        if (!sw) return false;
        const kase = firstChildNamed(sw, 'hp:case');
        const m = kase && firstChildNamed(kase, 'hh:margin');
        const left = m && firstChildNamed(m, 'hc:left');
        return left && Number(getAttr(left, 'value')) === Math.floor(왼쪽여백 / 2);
      });
      if (!여백맞는게있나) 문제.push(`왼쪽 여백 ${왼쪽여백} 이 안 살아남았다`);
      else 확인한것.여백++;

      const 가운데정렬있나 = findAll(머리.root, 'hh:paraPr')
        .some((pp) => getAttr(firstChildNamed(pp, 'hh:align') ?? {}, 'horizontal') === 'CENTER');
      if (!가운데정렬있나) 문제.push('가운데 정렬이 사라졌다');
      else 확인한것.정렬++;
    }

    // 강조 — 빨간 글자모양
    if (낸것.한일.강조) {
      const 빨간게있나 = findAll(머리.root, 'hh:charPr').some((cp) => getAttr(cp, 'textColor') === '#C00000');
      if (!빨간게있나) 문제.push('강조한 빨간 글자모양이 사라졌다');
      else 확인한것.강조++;
    }

    // 표
    if (낸것.한일.표) {
      const t = findFirst(구역.root, 'hp:tbl');
      if (t) {
        const 첫셀 = findAll(t, 'hp:tc')[0];
        const cm = 첫셀 && firstChildNamed(첫셀, 'hp:cellMargin');
        if (getAttr(첫셀, 'hasMargin') !== '1') 문제.push('셀 여백 표시(hasMargin)가 꺼졌다');
        else if (Number(getAttr(cm, 'left')) !== 셀여백) 문제.push('셀 여백 값이 안 살아남았다');
        else 확인한것.셀여백++;

        if (getAttr(t, 'repeatHeader') !== '1') 문제.push('머리행 반복이 꺼졌다');
        else 확인한것.머리행++;
      }
    }

    // 꼭 돼야 하는 것: 글 바꾸기·글자 서식·문단 서식.
    // 강조는 거절해도 된다 (표·그림과 같은 런이면 쪼개면 안 된다).
    for (const [무엇, 됐나] of Object.entries(낸것.꼭돼야하는것)) {
      if (!됐나) 문제.push(`${무엇} 가 안 됐다`);
    }

    if (문제.length) 실패.push([이름, 문제.join(' / ')]);
    else 통과++;
  } catch (e) {
    실패.push([이름, `한글이 뱉은 걸 우리가 못 읽는다: ${e.message.split('\n')[0]}`]);
  }
}

console.log(`기준 파일 ${목록.length}편을 **문서 계층으로 고쳐** 한글에 먹였다`);
console.log('  한글이 뱉은 것에서 확인한 것:');
for (const [k, v] of Object.entries(확인한것)) console.log(`    ${k.padEnd(8)} ${v}편`);
const 거절들 = [...한것].filter(([, v]) => v.거절);
if (거절들.length) {
  console.log(`  강조를 거절한 문서 ${거절들.length}편 (거절은 실패가 아니다):`);
  const 까닭 = new Map();
  for (const [, v] of 거절들) 까닭.set(v.거절, (까닭.get(v.거절) ?? 0) + 1);
  for (const [k, n] of 까닭) console.log(`    ${n}편 — ${k}`);
}
console.log(`통과 ${통과} / 실패 ${실패.length}`);
for (const [이름, 왜] of 실패) console.log(`  ✗ ${이름}: ${왜}`);
process.exit(실패.length ? 1 : 0);
