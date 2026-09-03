/**
 * **HTML 로 엮은 것이 원본과 얼마나 닮았나.**
 *
 * `render_html` 은 「됐다」 를 말하기 쉬운 도구다 — HTML 은 어지간하면 나온다.
 * 나온 것이 **쓸 만한가**는 다른 물음이라, 여기서 자로 잰다.
 *
 *     원본 .hwpx ──한글──▶ 원본.pdf   ┐
 *                                     ├─▶ 견준다
 *     원본 .hwpx ──엮기──▶ .html ──브라우저──▶ 재현.pdf   ┘
 *
 * ## 무엇을 재나
 *
 *   글       원본 PDF 의 글이 재현 PDF 에도 다 있나 — **이게 제일 중요하다.**
 *            서식은 좀 틀려도 되지만 글이 사라지면 못 쓴다.
 *   쪽수     몇 장짜리가 되나. 한글과 브라우저는 줄 끊는 규칙이 달라 **다를 수 있다.**
 *   디자인   `디자인닮음.py` — 글자 크기 갈래·굵기·색·가로 자리·선.
 *            세로로 밀리는 것에는 무디고 서식이 빠지는 것에는 예민하다.
 *
 * ## 쪽수가 다른 것은 흠이 아니다
 *
 * 브라우저가 한글과 똑같이 쪽을 가를 수는 없다. 그래서 **쪽수는 적기만 하고
 * 갈래를 깨뜨리지 않는다.** 깨뜨리는 것은 **글이 사라졌을 때**다.
 *
 *     node 검증/HTML닮음.mjs [문서이름조각]
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { 파이썬찾기 } from './쪽가르기.mjs';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const B = (p) => pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', p, 'src', 'index.js')).href;

const { 문서 } = await import(B('doc'));
const { 엮기 } = await import(B('render'));

const 파이썬 = 파이썬찾기();
if (!파이썬) { console.error('python(pymupdf)이 없어 잴 수 없다'); process.exit(1); }

/** 크로미움 계열이면 무엇이든 된다. Edge 는 윈도우에 늘 있다 */
function 브라우저찾기() {
  const 후보 = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  return 후보.find((p) => fs.existsSync(p)) ?? null;
}

const 브라우저 = 브라우저찾기();
if (!브라우저) { console.error('크로미움(Edge/Chrome)이 없어 HTML 을 PDF 로 못 굽는다'); process.exit(1); }

// 경로에 한글을 넣지 않는다 — PowerShell 이 깨뜨린다
const 무대 = path.join(os.tmpdir(), 'hwpx-html');
fs.rmSync(무대, { recursive: true, force: true });
fs.mkdirSync(무대, { recursive: true });

const 거르개 = process.argv[2];

/** 표본 문서들 */
const 것들 = [];
for (const 갈래 of ['공개', '로컬']) {
  const 곳 = path.join(뿌리, '자료', '표본', 갈래);
  if (!fs.existsSync(곳)) continue;
  for (const n of fs.readdirSync(곳)) {
    if (!n.endsWith('.hwpx')) continue;
    if (거르개 && !n.includes(거르개)) continue;
    것들.push({ 이름: path.basename(n, '.hwpx'), 길: path.join(곳, n) });
  }
}
if (것들.length === 0) { console.error('잴 문서가 없다'); process.exit(2); }

// ── 1. 엮어서 HTML 로 ──────────────────────────────────────────────────────
const 판들 = [];
for (const [i, 것] of 것들.entries()) {
  const 표 = `d${i}`;
  const r = 엮기(문서.열기(fs.readFileSync(것.길)));
  const html길 = path.join(무대, `${표}.html`);
  fs.writeFileSync(html길, r.html, 'utf8');
  fs.copyFileSync(것.길, path.join(무대, `${표}.hwpx`));
  판들.push({
    ...것, 표, 엮은것: r, html길,
    원본pdf: path.join(무대, `${표}-orig.pdf`),
    재현pdf: path.join(무대, `${표}-html.pdf`),
  });
}

// ── 2. 한글로 원본을 굽는다 (한 번만 띄운다) ───────────────────────────────
function 한글로굽기(짝들) {
  const NL = String.fromCharCode(10);
  const 줄 = ["$ErrorActionPreference='Continue'",
    '$hwp = New-Object -ComObject HWPFrame.HwpObject',
    'try { $hwp.RegisterModule("FilePathCheckDLL","FilePathCheckerModule") | Out-Null } catch {}',
    'try {'];
  for (const [입력, 출력, 표] of 짝들) {
    줄.push('  try {');
    줄.push(`    if ($hwp.Open('${입력}', "", "forceopen:true")) {`);
    줄.push(`      $hwp.SaveAs('${출력}', "PDF", "") | Out-Null`);
    줄.push(`    } else { Write-Output ("OPENFAIL ||| ${표}") }`);
    줄.push(`  } catch { Write-Output ("THROW ||| ${표} ||| " + $_.Exception.Message) }`);
    줄.push('  try { $hwp.Clear(1) | Out-Null } catch {}');
  }
  줄.push('} finally { try { $hwp.Quit() | Out-Null } catch {} }');
  // PowerShell 5.1 은 .ps1 을 **ANSI 로 읽는다** — BOM 을 붙여야 UTF-8 로 읽는다
  const 스크립트 = path.join(무대, 'bake.ps1');
  fs.writeFileSync(스크립트, '\uFEFF' + 줄.join(NL), 'utf8');
  return execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 스크립트],
    { encoding: 'buffer', timeout: 3_000_000, maxBuffer: 1 << 26 }).toString('utf8');
}

console.log(`문서 ${판들.length}편 — 한글로 원본을 굽는다…`);
const 한글말 = 한글로굽기(판들.map((p) => [path.join(무대, `${p.표}.hwpx`), p.원본pdf, p.표]));
const 못연것 = new Set(
  한글말.split(/\r?\n/).filter((l) => l.startsWith('OPENFAIL') || l.startsWith('THROW'))
    .map((l) => l.split('|||')[1]?.trim()),
);

// ── 3. 브라우저로 HTML 을 굽는다 ───────────────────────────────────────────
console.log('브라우저로 HTML 을 굽는다…');
for (const p of 판들) {
  const r = spawnSync(브라우저, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
    `--print-to-pdf=${p.재현pdf}`,
    pathToFileURL(p.html길).href,
  ], { encoding: 'utf8', timeout: 300_000 });
  if (!fs.existsSync(p.재현pdf)) {
    p.구운탈 = (r.stderr ?? '').slice(-200) || '까닭을 모르겠다';
  }
}

// ── 4. 잰다 ────────────────────────────────────────────────────────────────
function 글뽑기(pdf) {
  const 낼곳 = path.join(무대, 'text.json');
  const 짜기 = path.join(무대, 'text.py');
  fs.writeFileSync(짜기,
    'import sys, json, re, pymupdf\n'
    + 'd = pymupdf.open(sys.argv[1])\n'
    + "t = ''.join(p.get_text() for p in d)\n"
    // **날글도 같이 낸다.** 공백을 지운 글에서 낱말을 뽑으면 문단이 통째로
    // 붙어 「쪽 하나짜리 낱말」이 되어, 쪽이 밀리기만 해도 못 찾는다.
    + "json.dump({'쪽수': len(d), '글': re.sub(r'\\s+', '', t), '날글': t},"
    + " open(sys.argv[2], 'w', encoding='utf-8'))\n",
    'utf8');
  const r = spawnSync(파이썬, [짜기, pdf, 낼곳], { encoding: 'utf8', timeout: 600_000 });
  if (r.status !== 0) throw new Error(`글을 못 뽑았다: ${(r.stderr ?? '').slice(0, 200)}`);
  return JSON.parse(fs.readFileSync(낼곳, 'utf8'));
}

function 디자인닮음(가, 가쪽, 나, 나쪽) {
  const 낼곳 = path.join(무대, 'sim.json');
  const r = spawnSync(파이썬, [path.join(여기, '디자인닮음.py'), 가, String(가쪽), 나, String(나쪽), 낼곳],
    { encoding: 'utf8', timeout: 600_000 });
  if (r.status !== 0) return null;
  return JSON.parse(fs.readFileSync(낼곳, 'utf8'));
}

/**
 * 원본 글이 재현에 얼마나 남았나 — **낱말로 센다.**
 *
 * 처음엔 여덟 글자씩 토막 내어 셌다. 그랬더니 목차 점선(`········`)이나
 * 쪽번호(`-2-`) 하나가 토막을 통째로 깨뜨려, **글은 다 있는데 87%** 가 나왔다.
 * 잣대가 무엇을 재는지 모르면 그 수는 아무 말도 안 해 준다.
 *
 * 이제 **네 글자 이상 이어지는 한글·영숫자 덩이**만 본다.
 * 점선·쪽번호·괄호는 애초에 낱말이 아니라 안 걸린다.
 * 차례가 바뀌어도(쪽이 밀려도) 어디든 있으면 있는 것이다.
 */
function 글살았나(원, 재) {
  const 낱말 = (s) => (s.match(/[가-힣A-Za-z0-9]{4,}/g) ?? []);
  const 것들 = [...new Set(낱말(원))];
  if (것들.length === 0) return { 비율: 1, 잃은수: 0, 전체: 0, 보기: [] };
  const 잃은 = 것들.filter((t) => !재.includes(t));
  return {
    비율: 1 - 잃은.length / 것들.length,
    잃은수: 잃은.length,
    전체: 것들.length,
    보기: 잃은.slice(0, 3),
  };
}

console.log('');
console.log('문서'.padEnd(34) + '쪽수(한글/HTML)  글남음   닮음   못옮긴것');
console.log('─'.repeat(96));

let 실패 = 0;
const 줄들 = [];
const 닮음들 = [];
for (const p of 판들) {
  const 앞 = p.이름.slice(0, 32).padEnd(34);
  if (못연것.has(p.표) || !fs.existsSync(p.원본pdf)) {
    console.log(`${앞}— 한글이 원본을 못 열었다. 이 문서는 건너뛴다`);
    continue;
  }
  if (!fs.existsSync(p.재현pdf)) {
    console.log(`${앞}✗ **HTML 을 PDF 로 못 구웠다** — ${p.구운탈}`);
    실패++;
    continue;
  }

  const 원 = 글뽑기(p.원본pdf);
  const 재 = 글뽑기(p.재현pdf);
  const 글 = 글살았나(원.날글, 재.글);

  // 쪽 하나씩 대 본다. 쪽수가 다르면 겹치는 데까지만.
  const 잴쪽 = Math.min(원.쪽수, 재.쪽수, 6);
  const 점수들 = [];
  for (let i = 0; i < 잴쪽; i++) {
    const s = 디자인닮음(p.원본pdf, i, p.재현pdf, i);
    if (s) 점수들.push(s['닮음']);
  }
  const 평균 = 점수들.length ? 점수들.reduce((a, b) => a + b, 0) / 점수들.length : null;
  if (평균 !== null) 닮음들.push(평균);

  const 쪽말 = `${원.쪽수}/${재.쪽수}`.padEnd(9);
  const 글말 = `${(글.비율 * 100).toFixed(1)}%`.padStart(7);
  const 닮말 = 평균 === null ? '   —  ' : `${(평균 * 100).toFixed(0)}%`.padStart(6);
  const 못 = p.엮은것.못옮긴것.join(', ');

  // **글이 사라지는 것만 갈래를 깨뜨린다.** 쪽수·닮음은 적기만 한다.
  const 탈 = 글.비율 < 0.97;
  if (탈) 실패++;
  console.log(`${앞}${쪽말}${글말}${닮말}   ${못}`);
  if (탈) {
    console.log(`${' '.repeat(34)}✗ **글이 ${글.잃은수}/${글.전체} 토막 사라졌다** — ${글.보기.join(' / ')}`);
  }
  줄들.push({ 이름: p.이름, 원쪽: 원.쪽수, 재쪽: 재.쪽수, 글: 글.비율, 닮음: 평균 });
}

console.log('─'.repeat(96));
const 잰것 = 줄들.length;
if (잰것 > 0) {
  const 글평균 = 줄들.reduce((a, b) => a + b.글, 0) / 잰것;
  const 쪽같음 = 줄들.filter((r) => r.원쪽 === r.재쪽).length;
  const 닮평균 = 닮음들.length ? 닮음들.reduce((a, b) => a + b, 0) / 닮음들.length : null;
  console.log(`문서 ${잰것}편 — 글 남음 평균 ${(글평균 * 100).toFixed(1)}%`
    + ` · 쪽수까지 같은 것 ${쪽같음}/${잰것}`
    + (닮평균 === null ? '' : ` · 디자인 닮음 평균 ${(닮평균 * 100).toFixed(0)}%`));
}

if (실패 > 0) {
  console.error(`\n✗ ${실패}편에서 글이 사라지거나 못 구웠다`);
  process.exit(1);
}
console.log('\n○ 글이 사라진 문서가 없다');
