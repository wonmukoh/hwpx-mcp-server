/**
 * **조판이 만든 문서를 한글이 열고, 눈으로 봐도 맞나.**
 *
 * 삼중 검증의 세 겹을 한 번에 돈다:
 *   1. 규격  — 우리 검사에 안 걸리나
 *   2. 왕복  — 한글이 열고 다시 저장했을 때 우리 것이 살아 있나
 *   3. 시각  — PDF 로 굽고 **자로 재서** 어긋난 것이 없나
 *
 * 세 번째가 없으면 놓친다. 실제로:
 *   - 표 본문이 통째로 남색이 됐다 (조각이 들고 온 테두리 번호가 딴 것을 가리켰다)
 *   - 상자가 줄마다 네모로 갈라져 표처럼 보였다
 * 둘 다 XML 은 맞고 검사도 통과했다. **렌더를 보고서야 알았다.**
 *
 *   node 검증/조판수용시험.mjs
 *
 * 한글과 python(pymupdf)이 있어야 한다. 없으면 그렇다고 말하고 건너뛴다.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const B = (p) => pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', p, 'src', 'index.js')).href;

const { 문서, 표 } = await import(B('doc'));
const { 조판 } = await import(B('compose'));
const { parseXml, findAll, firstChildNamed, getAttr } = await import(B('owpml'));
const { HwpxContainer, 부품 } = await import(B('hwpx'));

// 경로에 한글(글자)을 넣지 않는다 — PowerShell 이 깨뜨린다
const 무대 = path.join(os.tmpdir(), 'hwpx-composed');
fs.rmSync(무대, { recursive: true, force: true });
fs.mkdirSync(무대, { recursive: true });

// 그림은 기준 파일에서 꺼내 쓴다 (저장소에 딸린 것만 쓴다)
const 원본그림 = HwpxContainer.open(fs.readFileSync(path.join(뿌리, '자료', '기준파일', 'ref-image.hwpx')));
const 그림파일 = path.join(무대, 'pic.png');
fs.writeFileSync(그림파일, 원본그림.read('BinData/image1.png'));

const 블록들 = [
  { kind: 'title', text: '2026년 주요업무 추진계획', date: '2026. 3.', org: '교 육 부' },
  { kind: 'band', text: 'Ⅰ. 추진 배경' },
  { kind: 'outline', emphasize: ['조기 개입'], items: [
    { level: 1, text: '학생 한 명도 놓치지 않는 책임교육' },
    { level: 2, text: '기초학력 미달 비율이 3년째 늘고 있어 조기 개입이 필요하다' },
    { level: 3, text: '2023년 4.2% → 2025년 6.1%' },
  ] },
  { kind: 'box', title: '< 핵심 추진과제 >', items: ['기초학력 책임지도', '맞춤형 학습 지원', '학교-가정 연계'] },
  { kind: 'page_break' },
  { kind: 'band', text: 'Ⅱ. 투자 계획', background: '#1F4E9C' },
  { kind: 'table', headers: ['구분', '2025년', '2026년'], rows: [
    ['기초학력', '1,240', '1,580'],
    ['맞춤지원', '860', '1,120'],
  ] },
  { kind: 'text', text: '※ 단위: 억 원', size: 9, align: 'right' },
  { kind: 'image', path: 그림파일, width: 120, caption: '〈그림 1〉 시험 그림' },
];

const 탈 = [];
const 본것 = {};

// ── 1. 규격 ───────────────────────────────────────────────────────────────
const d = 문서.새로();
d.ID매기기();
const 조판결과 = 조판(d, 블록들, { title_font: '맑은 고딕', body_font: '함초롬바탕' });
if (!조판결과.ok) {
  console.error('조판이 실패했다:', 조판결과.이유, '\n→', 조판결과.어떻게);
  process.exit(1);
}
본것.블록 = 조판결과.value.만든것.length;
본것.요소 = 조판결과.value.문단수;

const 검사탈 = d.검사();
if (검사탈.length) 탈.push(`저장 전 검사에 걸림: ${검사탈.slice(0, 3).join(' / ')}`);
if (d.실패기록.length) 탈.push(`연산 ${d.실패기록.length}건이 실패로 기록됐다`);

const 우리것 = path.join(무대, 'composed.hwpx');
fs.writeFileSync(우리것, d.저장());
본것.바이트 = fs.statSync(우리것).size;

// ── 2. 한글 왕복 ──────────────────────────────────────────────────────────
const 한글것 = path.join(무대, 'from-hwp.hwpx');
const pdf = path.join(무대, 'composed.pdf');
const ps = [
  "$ErrorActionPreference='Continue'",
  '$hwp = New-Object -ComObject HWPFrame.HwpObject',
  'try { $hwp.RegisterModule("FilePathCheckDLL","FilePathCheckerModule") | Out-Null } catch {}',
  'try {',
  `  if (-not $hwp.Open('${우리것}', "", "forceopen:true")) { throw "open fail" }`,
  '  Write-Output ("PAGES ||| " + $hwp.PageCount)',
  `  $hwp.SaveAs('${한글것}', "HWPX", "") | Out-Null`,
  `  $hwp.SaveAs('${pdf}', "PDF", "") | Out-Null`,
  '  Write-Output "OK"',
  '} catch { Write-Output ("THROW ||| " + $_.Exception.Message) }',
  'finally { try { $hwp.Clear(1) | Out-Null } catch {}; try { $hwp.Quit() | Out-Null } catch {} }',
].join('\n');

let 한글말 = '';
try {
  한글말 = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
    { encoding: 'buffer', timeout: 600_000 }).toString('utf8');
} catch (e) {
  탈.push(`한글을 못 돌렸다: ${e.message.split('\n')[0]}`);
}
본것.쪽수 = Number(/PAGES \|\|\| (\d+)/.exec(한글말)?.[1] ?? 0);

if (!fs.existsSync(한글것)) {
  탈.push('한글이 우리 파일을 안 받았다');
} else {
  const 뒤 = 문서.열기(fs.readFileSync(한글것));
  const s = 뒤.구역들[0];
  const 글 = s.모든문단들.map((p) => p.글).filter(Boolean);
  본것.글줄 = 글.length;

  for (const 있어야할것 of ['2026년 주요업무 추진계획', '교 육 부', 'Ⅰ. 추진 배경',
    '□ 학생 한 명도 놓치지 않는 책임교육', '< 핵심 추진과제 >', '기초학력', '1,240', '※ 단위: 억 원']) {
    if (!글.some((x) => x.includes(있어야할것))) 탈.push(`한글이 뱉은 것에 '${있어야할것}' 이 없다`);
  }

  // 그림이 살아남았나 — BinData 와 manifest 가 **둘 다** 있어야 한다
  const 그림들 = findAll(s.root, 'hp:pic');
  본것.그림 = 그림들.length;
  if (그림들.length !== 1) 탈.push(`그림이 ${그림들.length}개다 (1개여야 한다)`);
  if (뒤.컨테이너.binDataNames().length !== 1) {
    탈.push(`BinData 가 ${뒤.컨테이너.binDataNames().length}개다`);
  } else {
    const 부품이름 = 뒤.컨테이너.binDataNames()[0];
    if (!뒤.컨테이너.readText(부품.manifest).includes(부품이름)) {
      탈.push(`${부품이름} 이 manifest 에 없다 — 한글이 그림을 못 찾는다`);
    }
  }

  본것.표 = s.표들.length;
  if (s.표들.length !== 1) 탈.push(`표가 ${s.표들.length}개다 (1개여야 한다)`);
  else {
    const t = new 표(s.표들[0]);
    if (t.줄수 !== 3 || t.칸수 !== 3) 탈.push(`표가 ${t.줄수}줄 ${t.칸수}칸이다 (3x3 여야 한다)`);
    if (!t.머리행반복) 탈.push('머리행 반복이 꺼졌다');
    if (t.탈만.length) 탈.push(`표 기하가 어긋났다: ${t.탈만[0]}`);

    // 표 본문 셀이 배경색을 물지 않았나 (실제로 겪은 버그)
    const 머리 = parseXml(뒤.머리.toXml()).root;
    const 몸셀 = t.셀(1, 0);
    const bf = findAll(머리, 'hh:borderFill').find((x) => getAttr(x, 'id') === 몸셀?.테두리);
    const 붓 = bf && findAll(bf, 'hc:winBrush')[0];
    const 채움 = 붓 ? getAttr(붓, 'faceColor') : 'none';
    본것.표본문채움 = 채움;
    if (채움 && 채움 !== 'none') 탈.push(`표 본문 셀에 배경색이 물었다 (${채움})`);
  }
}

// ── 3. 시각 ───────────────────────────────────────────────────────────────
if (!fs.existsSync(pdf)) {
  탈.push('PDF 가 안 나왔다 — 눈으로 볼 수 없다');
} else {
  const 파이썬 = 파이썬찾기();
  if (!파이썬) {
    console.log('※ python(pymupdf)이 없어 시각 검증은 건너뛴다');
  } else {
    const r = spawnSync(파이썬, [path.join(여기, '눈으로보기.py'), pdf], { encoding: 'utf8' });
    const 말 = (r.stdout ?? '') + (r.stderr ?? '');
    본것.시각 = 말.trim().split('\n').filter((l) => l.includes('쪽 ')).map((l) => l.trim());
    if (r.status !== 0) 탈.push(`눈으로 보니 어긋난 것이 있다:\n${말.trim()}`);

    const 잰것경로 = path.join(path.dirname(pdf), '본것', '잰것.json');
    if (fs.existsSync(잰것경로)) {
      const 잰것 = JSON.parse(fs.readFileSync(잰것경로, 'utf8'));
      본것.쪽 = 잰것.쪽수;
      if (잰것.쪽수 !== 2) 탈.push(`${잰것.쪽수}쪽이 나왔다 (쪽나눔이 있으니 2쪽이어야 한다)`);
      // 띠는 칠한 자리가, 표·상자는 선이 있어야 한다
      const p1 = 잰것.쪽[0], p2 = 잰것.쪽[1];
      if (p1 && p1.칠한것수 < 1) 탈.push('1쪽에 띠 배경색이 안 칠해졌다');
      if (p1 && p1.선수 < 4) 탈.push(`1쪽에 상자 테두리가 안 그려졌다 (선 ${p1.선수}개)`);
      if (p2 && p2.선수 < 4) 탈.push(`2쪽에 표 테두리가 안 그려졌다 (선 ${p2.선수}개)`);
      본것.낸그림 = path.join(path.dirname(pdf), '본것');
    }
  }
}

function 파이썬찾기() {
  const 후보 = [
    path.join(os.homedir(), 'AppData', 'Local', 'Python', 'bin', 'python.exe'),
    'python3', 'python',
  ];
  for (const p of 후보) {
    const r = spawnSync(p, ['-c', 'import pymupdf'], { encoding: 'utf8' });
    if (r.status === 0) return p;
  }
  return null;
}

// ── 알림 ──────────────────────────────────────────────────────────────────
console.log(`조판 수용 시험 — 블록 ${블록들.length}개로 문서 한 편`);
for (const [k, v] of Object.entries(본것)) {
  console.log(`  ${k.padEnd(10)} ${Array.isArray(v) ? '' : v}`);
  if (Array.isArray(v)) for (const l of v) console.log(`     ${l}`);
}
console.log(탈.length ? `\n탈 ${탈.length}건` : '\n탈 없음');
for (const t of 탈) console.log(`  ✗ ${t}`);
process.exit(탈.length ? 1 : 0);
