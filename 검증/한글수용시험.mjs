/**
 * 우리가 써 낸 파일을 **한글이 받아들이는가.** 2단계의 마지막 합격 기준이다.
 *
 * 바이트가 같은 것만으로는 모자란다. 손대지 않은 부품은 원본을 그대로 뱉으니
 * 그 시험은 다시 쓰는 길을 한 번도 밟지 않는다.
 * 그 틈으로 `name=""` 을 `name` 으로 쓰는 버그가 빠져나가 한글이 파일을 거부했다.
 *
 * 그래서 여기서는 **모든 노드를 고친 것으로 표시하고** 처음부터 다시 쓴다.
 * 문서의 모든 요소가 손으로 다시 쓰는 길을 지난다. 한글이 심판을 본다.
 *
 * 보는 것:
 *   가) 한글이 연다
 *   나) 한글이 다시 저장한 것에 우리가 넣은 표시가 남아 있다
 *   다) 그림이 줄지 않았다
 *
 * 한글은 한 번만 띄운다 (23번 띄우면 몇 분이 걸린다).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);

const { HwpxContainer } = await import(
  pathToFileURL(path.join(뿌리, '검증', '.빌드hwpx', 'index.js')).href
);
const { parseXml, serializeXml, findAll, setText, textOf } = await import(
  pathToFileURL(path.join(뿌리, '검증', '.빌드', 'index.js')).href
);

// 한글은 OneDrive 경로에서 보안 대화상자를 띄운다. 로컬 임시 폴더에서 다룬다.
const 무대 = path.join(os.tmpdir(), 'hwpx-수용시험');
const 앞마당 = path.join(무대, '우리가쓴것');
const 뒷마당 = path.join(무대, '한글이뱉은것');
for (const d of [앞마당, 뒷마당]) {
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
}

const 표시 = 'HWPXMCP2단계표시';

function 전부더럽히기(node) {
  node.dirty = true;
  if (node.kind === 'element') for (const c of node.children) 전부더럽히기(c);
}

function 본문글자(c) {
  return c.sectionNames().map((n) => {
    const doc = parseXml(c.readText(n));
    return findAll(doc.root, 'hp:t').map((t) => textOf(t)).join('');
  }).join('\n');
}

// ── 1. 전부 다시 써서 내놓는다 ────────────────────────────────────────────
const 기준파일 = path.join(뿌리, '자료', '기준파일');
const 목록 = fs.readdirSync(기준파일).filter((f) => f.toLowerCase().endsWith('.hwpx')).sort();
const 정보 = new Map();
const 준비실패 = [];

for (const 이름 of 목록) {
  try {
    const c = HwpxContainer.open(fs.readFileSync(path.join(기준파일, 이름)));
    let 표시넣음 = false;

    for (const 구역 of c.sectionNames()) {
      const doc = parseXml(c.readText(구역));
      // 모든 노드를 고친 것으로 표시한다 — 다시 쓰는 길을 전부 밟게 한다
      for (const ch of doc.children) 전부더럽히기(ch);
      if (!표시넣음) {
        const 글자들 = findAll(doc.root, 'hp:t');
        if (글자들.length) { setText(글자들[0], 표시); 표시넣음 = true; }
      }
      c.writeText(구역, serializeXml(doc));
    }
    // 머리글(글자·문단 모양)도 다시 쓴다
    const h = parseXml(c.readText('Contents/header.xml'));
    for (const ch of h.children) 전부더럽히기(ch);
    c.writeText('Contents/header.xml', serializeXml(h));

    fs.writeFileSync(path.join(앞마당, 이름), c.save());
    정보.set(이름, { 그림: c.binDataNames().length, 표시넣음 });
  } catch (e) {
    준비실패.push([이름, e.message.split('\n')[0]]);
  }
}

// ── 2. 한글 한 번 띄워서 전부 열어 본다 ───────────────────────────────────
const ps = `
$ErrorActionPreference = 'Continue'
$hwp = New-Object -ComObject HWPFrame.HwpObject
try { $hwp.RegisterModule("FilePathCheckDLL","FilePathCheckerModule") | Out-Null } catch {}
try {
  foreach ($f in Get-ChildItem -Path '${앞마당.replace(/'/g, "''")}' -Filter *.hwpx) {
    $out = Join-Path '${뒷마당.replace(/'/g, "''")}' $f.Name
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

// ── 3. 한글이 뱉은 것을 확인한다 ──────────────────────────────────────────
let 통과 = 0;
const 실패 = [...준비실패];

for (const 이름 of 목록) {
  if (!정보.has(이름)) continue;
  const { 그림, 표시넣음 } = 정보.get(이름);
  const 판정 = 한글판정.get(이름);

  if (!판정) { 실패.push([이름, '한글이 아무 말도 안 했다']); continue; }
  if (판정.상태 !== 'OK') { 실패.push([이름, `한글: ${판정.상태}${판정.덧 ? ' — ' + 판정.덧 : ''}`]); continue; }

  try {
    const 뒤 = HwpxContainer.open(fs.readFileSync(path.join(뒷마당, 이름)));
    const 문제 = [];
    if (표시넣음 && !본문글자(뒤).includes(표시)) 문제.push('우리가 넣은 글자가 사라졌다');
    const 그림뒤 = 뒤.binDataNames().length;
    if (그림뒤 < 그림) 문제.push(`그림이 ${그림} → ${그림뒤} 로 줄었다`);
    if (문제.length) 실패.push([이름, 문제.join(' / ')]);
    else 통과++;
  } catch (e) {
    실패.push([이름, `한글이 뱉은 걸 우리가 못 읽는다: ${e.message.split('\n')[0]}`]);
  }
}

// 이 검사가 실제로 무엇을 봤는지 숫자로 남긴다. 안 그러면 헛도는 걸 모른다.
const 표시들어간것 = [...정보.values()].filter((v) => v.표시넣음).length;
const 그림있는것 = [...정보.values()].filter((v) => v.그림 > 0).length;
console.log(`기준 파일 ${목록.length}편을 **전부 다시 써서** 한글에 먹였다`);
console.log(`  글자 표시를 심은 문서 ${표시들어간것}편 / 그림이 든 문서 ${그림있는것}편`);
console.log(`통과 ${통과} / 실패 ${실패.length}`);
for (const [이름, 왜] of 실패) console.log(`  ✗ ${이름}: ${왜}`);
process.exit(실패.length ? 1 : 0);
