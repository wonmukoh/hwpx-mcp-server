/**
 * **4단계 합격 기준** — 교육부 업무계획 6쪽을 `compose` 한 번으로 재현한다.
 *
 * 한 바퀴를 다 돈다:
 *   1. 원본에서 6쪽 문단을 읽어 **우리 표시법**(`**굵게**` `[[강조]]`)으로 되뽑는다
 *   2. 되뽑은 것을 다시 풀어 원본 글과 같은지 본다  ← 표시법이 이 문서를 담나
 *   3. 블록 목록으로 `compose` 를 **한 번** 부른다
 *   4. 한글로 열어 PDF 로 굽는다
 *   5. 원본 6쪽과 **자로 대 본다**
 *
 * 3줄쯤 다르게 끊기는 것은 우리 탈이 아니다 —
 * 원본은 어구마다 자간을 손으로 달리 줬다 (-7 / -6 / -4 / 0 이 섞여 있고 12pt 런도 있다).
 * 우리는 고르게 준다. 글자·자리·줄간격이 맞으면 된 것으로 본다.
 *
 *   node 검증/교육부6쪽.mjs
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const B = (p) => pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', p, 'src', 'index.js')).href;

const { 문서 } = await import(B('doc'));
const { 조판, 꾸밈풀기 } = await import(B('compose'));
const { parseXml, findAll, childrenNamed, firstChildNamed, getAttr, textOf } = await import(B('owpml'));

const 원본파일 = path.join(뿌리, '자료', '표본', '공개', '교육부-2026업무계획.hwpx');
if (!fs.existsSync(원본파일)) {
  console.log('※ 교육부-2026업무계획.hwpx 가 없어 건너뛴다');
  process.exit(0);
}

// 경로에 한글(글자)을 넣지 않는다 — PowerShell 이 깨뜨린다
const 무대 = path.join(os.tmpdir(), 'hwpx-moe6');
fs.rmSync(무대, { recursive: true, force: true });
fs.mkdirSync(무대, { recursive: true });
const 원본사본 = path.join(무대, 'moe.hwpx');
fs.copyFileSync(원본파일, 원본사본);

const 탈 = [];
const 본것 = {};

// ── 1. 원본 6쪽을 표시법으로 되뽑는다 ─────────────────────────────────────
const 원본 = 문서.열기(fs.readFileSync(원본파일));
const 머리doc = parseXml(원본.머리.toXml());
const charPr표 = new Map();
for (const cp of findAll(머리doc.root, 'hh:charPr')) {
  charPr표.set(getAttr(cp, 'id'), {
    색: getAttr(cp, 'textColor') ?? '#000000',
    굵게: !!firstChildNamed(cp, 'hh:bold'),
  });
}

/** 역슬래시. 표시 글자를 막을 때 쓴다 */
const BS = String.fromCharCode(92);

function 표시로(p) {
  let 나온것 = '';
  let 굵게 = false, 색 = '#000000';
  for (const r of p.런들) {
    if (childrenNamed(r, 'hp:t').length === 0) continue;
    const c = charPr표.get(getAttr(r, 'charPrIDRef')) ?? { 굵게: false, 색: '#000000' };
    // 표시 글자를 **한 글자씩** 막는다.
    //
    // '**' 를 통째로 찾아 바꾸면 새는 자리가 있다 — 원본에서 별표 둘이
    // **런 두 개에 나뉘어** 있으면 어느 런에도 통짜 `**` 가 없어 그냥 지나간다.
    // 이어 붙이고 나서야 `**` 가 되어 짝이 안 맞는 표시가 만들어진다.
    // 실제로 교육부 문서 각주(`** 국가환경교육센터…`)에서 그 일이 났다.
    const 날글 = childrenNamed(r, 'hp:t').map(textOf).join('');
    let 글 = '';
    for (const 자 of 날글) 글 += "*[]".includes(자) || 자 === BS ? BS + 자 : 자;
    if (글.length === 0) continue;
    if (색 !== c.색 && 색 !== '#000000') 나온것 += ']]';
    if (굵게 !== c.굵게) { 나온것 += '**'; 굵게 = c.굵게; }
    if (색 !== c.색) { if (c.색 !== '#000000') 나온것 += '[['; 색 = c.색; }
    나온것 += 글;
  }
  if (색 !== '#000000') 나온것 += ']]';
  if (굵게) 나온것 += '**';
  return 나온것;
}

const 문단들 = 원본.구역들[0].문단들;
const 시작 = 문단들.findIndex((p) => p.글.includes('대학 진학상담 고도화'));
if (시작 === -1) {
  console.error('원본에서 6쪽 첫 문단을 못 찾았다 — 문서가 바뀌었나');
  process.exit(1);
}
const 여섯쪽 = 문단들.slice(시작, 시작 + 11);

const 블록들 = [];
for (const p of 여섯쪽) {
  const 표시 = 표시로(p);
  const 맨글 = p.글.trim();
  if (맨글.length === 0) { 블록들.push({ kind: 'text', text: '' }); continue; }

  // 되뽑은 표시를 다시 풀어 원본 글과 같은지 본다
  const 푼것 = 꾸밈풀기(표시);
  if (!푼것.ok) 탈.push(`표시법으로 못 담는 문단이 있다: ${푼것.이유}`);
  else if (푼것.value.map((x) => x.글).join('') !== p.글) {
    탈.push(`되뽑은 글이 원본과 다르다: «${맨글.slice(0, 30)}»`);
  }

  if (/^\s*\(\d+\)/.test(p.글)) 블록들.push({ kind: 'heading', text: 표시.trim() });
  else if (/^\s*[※*]/.test(p.글)) 블록들.push({ kind: 'note', text: 표시.trim() });
  else 블록들.push({ kind: 'body', text: 표시.trim() });
}
본것.블록 = 블록들.length;

// ── 2. compose 를 **한 번** 부른다 ───────────────────────────────────────
const d = 문서.새로();
d.ID매기기();
const r = 조판(d, 블록들, {
  body_font: '함초롬바탕', title_font: '함초롬돋움',
  // 원본 실측: 좌우 5669 HWPUNIT(=56.69pt) / 위 4500(=45pt) / 아래 4251(=42.51pt)
  page: { margin_left: 56.69, margin_right: 56.69, margin_top: 45, margin_bottom: 42.51 },
  page_number: 'bottom-center',
  // 원본 실측: 줄간격 157%, 자간 -6
  line_spacing: 157,
  letter_spacing: -6,
});
if (!r.ok) {
  console.error('조판이 실패했다:', r.이유, '\n→', r.어떻게);
  process.exit(1);
}
본것.요소 = r.value.문단수;

const 검사탈 = d.검사();
if (검사탈.length) 탈.push(`저장 전 검사에 걸림: ${검사탈.slice(0, 2).join(' / ')}`);
if (d.실패기록.length) 탈.push(`연산 ${d.실패기록.length}건이 실패로 기록됐다`);

const 우리것 = path.join(무대, 'repro.hwpx');
fs.writeFileSync(우리것, d.저장());

// ── 3. 한글로 열어 PDF 두 개를 굽는다 ────────────────────────────────────
const 원본pdf = path.join(무대, 'moe.pdf');
const 우리pdf = path.join(무대, 'repro.pdf');
const ps = [
  "$ErrorActionPreference='Continue'",
  '$hwp = New-Object -ComObject HWPFrame.HwpObject',
  'try { $hwp.RegisterModule("FilePathCheckDLL","FilePathCheckerModule") | Out-Null } catch {}',
  'try {',
  `  if ($hwp.Open('${원본사본}', "", "forceopen:true")) { $hwp.SaveAs('${원본pdf}', "PDF", "") | Out-Null }`,
  '  try { $hwp.Clear(1) | Out-Null } catch {}',
  `  if ($hwp.Open('${우리것}', "", "forceopen:true")) {`,
  '    Write-Output ("PAGES ||| " + $hwp.PageCount)',
  `    $hwp.SaveAs('${우리pdf}', "PDF", "") | Out-Null`,
  '  }',
  '  Write-Output "OK"',
  '} catch { Write-Output ("THROW ||| " + $_.Exception.Message) }',
  'finally { try { $hwp.Clear(1) | Out-Null } catch {}; try { $hwp.Quit() | Out-Null } catch {} }',
].join('\n');

let 한글말 = '';
try {
  한글말 = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
    { encoding: 'buffer', timeout: 900_000 }).toString('utf8');
} catch (e) {
  탈.push(`한글을 못 돌렸다: ${e.message.split('\n')[0]}`);
}
본것.쪽수 = Number(/PAGES \|\|\| (\d+)/.exec(한글말)?.[1] ?? 0);
if (본것.쪽수 !== 1) 탈.push(`${본것.쪽수}쪽이 나왔다 (1쪽이어야 한다)`);
if (!fs.existsSync(우리pdf)) 탈.push('한글이 우리 파일을 안 받았다');

// ── 4. 자로 대 본다 ──────────────────────────────────────────────────────
function 파이썬찾기() {
  for (const p of [path.join(os.homedir(), 'AppData', 'Local', 'Python', 'bin', 'python.exe'), 'python3', 'python']) {
    if (spawnSync(p, ['-c', 'import pymupdf'], { encoding: 'utf8' }).status === 0) return p;
  }
  return null;
}
const 파이썬 = 파이썬찾기();

if (!파이썬) {
  console.log('※ python(pymupdf)이 없어 자로 대는 것은 건너뛴다');
} else if (fs.existsSync(원본pdf) && fs.existsSync(우리pdf)) {
  const out = spawnSync(파이썬, [path.join(여기, '대조하기.py'), 원본pdf, '6', 우리pdf, '1'],
    { encoding: 'utf8' });
  const 말 = (out.stdout ?? '') + (out.stderr ?? '');
  본것.대조 = 말.trim().split('\n').filter((l) => l.trim());

  const 숫자 = (이름) => {
    const m = new RegExp(`${이름}[^\\n]*차이 (-?[\\d.]+)pt`).exec(말);
    return m ? Math.abs(Number(m[1])) : null;
  };
  const 왼쪽차 = 숫자('글 왼쪽');
  const 너비차 = 숫자('글 너비');
  if (왼쪽차 === null || 왼쪽차 > 2) 탈.push(`글 왼쪽 자리가 ${왼쪽차}pt 어긋났다 (2pt 안이어야 한다)`);
  if (너비차 === null || 너비차 > 5) 탈.push(`글 너비가 ${너비차}pt 어긋났다 (5pt 안이어야 한다)`);

  const 간격 = /줄 간격[^\n]*원본 ([\d.]+)pt\s+재현 ([\d.]+)pt/.exec(말);
  if (!간격) 탈.push('줄 간격을 못 쟀다');
  else if (Math.abs(Number(간격[1]) - Number(간격[2])) > 0.6) {
    탈.push(`줄 간격이 다르다 (원본 ${간격[1]} / 재현 ${간격[2]})`);
  }

  // 글자 — 쪽 번호만 빼고 같아야 한다
  const 글자 = /글자\s+(○|✗)[^\n]*\(원본 (\d+)자 \/ 재현 (\d+)자\)/.exec(말);
  if (글자) {
    본것.글자수 = `원본 ${글자[2]} / 재현 ${글자[3]}`;
    if (글자[2] !== 글자[3]) {
      탈.push(`글자 수가 다르다 (원본 ${글자[2]} / 재현 ${글자[3]})`);
    }
  } else if (!말.includes('○ 똑같다')) {
    탈.push('글자를 대 보지 못했다');
  }
} else {
  탈.push('PDF 가 안 나왔다 — 눈으로 볼 수 없다');
}

// ── 알림 ─────────────────────────────────────────────────────────────────
console.log('교육부 2026 업무계획 6쪽 — compose 한 번으로 재현');
for (const [k, v] of Object.entries(본것)) {
  if (Array.isArray(v)) { console.log('  대조:'); for (const l of v) console.log(`    ${l}`); }
  else console.log(`  ${k.padEnd(8)} ${v}`);
}
console.log(`  낸 것   ${무대}`);
console.log(탈.length ? `\n탈 ${탈.length}건` : '\n탈 없음');
for (const t of 탈) console.log(`  ✗ ${t}`);
process.exit(탈.length ? 1 : 0);
