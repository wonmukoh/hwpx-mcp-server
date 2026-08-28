/**
 * **양식을 받아 채운다 — 안 건드린 곳은 한 픽셀도 안 달라져야 한다.**
 *
 * "재현" 은 우리가 만든 문서가 원본을 얼마나 닮았나를 본다.
 * 이건 다른 물음이다: **남이 준 양식을 열어 고쳤을 때, 양식이 빠그라지나.**
 * 실무에서 훨씬 자주 겪는 쪽은 이쪽이다.
 *
 * 재는 법: 원본을 한글로 PDF 로 굽고, 고친 것도 굽고, **픽셀로 견준다.**
 * XML 이 맞고 검사도 통과했는데 눈으로 보니 틀린 적이 여러 번 있었다.
 * 픽셀은 안 봐주고, 우리가 놓친 것도 잡는다.
 *
 * 갈래마다 기대가 다르다:
 *   가) 그대로 저장    — 픽셀이 **완전히** 같아야 한다
 *   나) ID 매기고 저장 — id 는 안 보이니 역시 **완전히** 같아야 한다
 *   다) 글 바꾸기      — 쪽 수가 같고, **바꾼 곳만** 달라야 한다
 *   라) 표 채우기      — 표가 안 무너져야 한다 (쪽 수·표 기하 그대로)
 *   마) 글자 서식      — 쪽 수가 같아야 한다
 *
 *   node 검증/양식채우기.mjs
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

const { 문서, 표: 표클래스 } = await import(B('doc'));
const { findAll, childrenNamed, textOf } = await import(B('owpml'));

const 파이썬 = 파이썬찾기();
if (!파이썬) { console.error('python(pymupdf)이 없어 잴 수 없다'); process.exit(1); }

// 경로에 한글을 넣지 않는다 — PowerShell 이 깨뜨린다
const 무대 = path.join(os.tmpdir(), 'hwpx-forms');
fs.rmSync(무대, { recursive: true, force: true });
fs.mkdirSync(무대, { recursive: true });

const 표본칸 = path.join(뿌리, '자료', '표본', '공개');
const 기준칸 = path.join(뿌리, '자료', '기준파일');

/** 좁혀 돌릴 수 있게 — `node 검증/양식채우기.mjs 보도자료 라)` */
const [양식거르개, 손거르개] = process.argv.slice(2);

/** 시험할 양식들 — 정부 문서 4편 + 갈래별 기준 파일 */
const 양식들전부 = [
  ...fs.readdirSync(표본칸).filter((f) => f.toLowerCase().endsWith('.hwpx')).sort()
    .map((f) => ({ 이름: f, 길: path.join(표본칸, f), 갈래: '정부문서' })),
  ...['ref-table-basic.hwpx', 'ref-table-merge.hwpx', 'ref-image.hwpx', 'ref-header-footer.hwpx',
    'ref-note.hwpx', 'ref-column.hwpx', 'ref-style.hwpx', 'ref-para-indent.hwpx',
    'ref-section-break.hwpx', 'ref-shape.hwpx', 'ref-equation.hwpx', 'ref-memo.hwpx']
    .map((f) => ({ 이름: f, 길: path.join(기준칸, f), 갈래: '기준파일' })),
];
const 양식들 = 양식거르개 ? 양식들전부.filter((f) => f.이름.includes(양식거르개)) : 양식들전부;
if (양식들.length === 0) { console.error(`'${양식거르개}' 에 맞는 양식이 없다`); process.exit(2); }

/**
 * 글자를 **같은 꼴의 다른 글자**로 바꾼다.
 *
 * `'값'` 으로 죄다 채우면 안 된다 — 숫자 칸 `1,240` 을 한글 다섯 자로 바꾸면
 * 폭이 두 배가 되어 칸이 두 줄이 되고, 표가 커져 쪽이 넘친다.
 * 그건 우리 잘못이 아니라 **시험이 잘못 잰 것**이다.
 * 숫자는 숫자로, 로마자는 로마자로, 한글은 한글로 바꾼다.
 */
function 같은꼴로(글) {
  const 한글 = '가나다라마바사아자차카타파하';
  let 셈 = 0;
  return [...글].map((c) => {
    셈 = (셈 + 7) % 14;
    if (c >= '0' && c <= '9') return String.fromCharCode(48 + (셈 % 10));
    if ((c >= 'a' && c <= 'z')) return String.fromCharCode(97 + (셈 % 26));
    if ((c >= 'A' && c <= 'Z')) return String.fromCharCode(65 + (셈 % 26));
    if (c >= '가' && c <= '힣') return 한글[셈 % 한글.length];
    return c;   // 빈칸·쉼표·괄호·기호는 그대로 둔다 (폭이 다르다)
  }).join('');
}

/**
 * 문서에 든 **개체 수**를 갈래별로 센다.
 *
 * 글만 고쳤는데 표나 그림이 사라지면 양식이 빠그라진 것이다.
 * 실제로 겪었다 — 옛 `글바꾸기` 가 런을 통째로 지워 표를 날렸다.
 * 그때 낱개 시험은 다 통과했고, 이 셈만이 잡았다.
 */
function 개체수(d) {
  const 셈 = {};
  for (const s of d.구역들) {
    for (const 이름 of ['hp:tbl', 'hp:pic', 'hp:rect', 'hp:ellipse', 'hp:line',
      'hp:equation', 'hp:container', 'hp:footNote', 'hp:endNote']) {
      const n = findAll(s.root, 이름).length;
      if (n) 셈[이름] = (셈[이름] ?? 0) + n;
    }
  }
  return 셈;
}

// ── 고치는 손들 ───────────────────────────────────────────────────────────
const 손들전부 = [
  {
    이름: '가) 그대로 저장',
    기대: '픽셀완전동일',
    하기: () => ({ 한것: '아무것도 안 했다' }),
  },
  {
    이름: '나) ID 매기고 저장',
    기대: '픽셀완전동일',
    하기: (d) => ({ 한것: `id ${JSON.stringify(d.ID매기기())}` }),
  },
  {
    이름: '다) 글 바꾸기',
    기대: '쪽수동일+바꾼곳만',
    하기: (d) => {
      d.ID매기기();
      // 글자 수가 같은 글로 바꾼다 — 줄이 안 밀려야 "바꾼 곳만" 을 잴 수 있다
      const 것들 = [];
      for (const s of d.구역들) {
        for (const p of s.모든문단들) {
          const 글 = p.글;
          if (!글 || [...글.replace(/\s/g, '')].length < 8) continue;
          것들.push(p);
          if (것들.length >= 3) break;
        }
        if (것들.length >= 3) break;
      }
      if (것들.length === 0) return { 건너뜀: '바꿀 만한 문단이 없다' };
      const 한것 = [];
      for (const p of 것들) {
        const 옛 = p.글;
        const 새 = 같은꼴로(옛);
        if (새 === 옛) continue;
        const r = d.글바꾸기(d.이름표.아이디(p.el), 새);
        한것.push(r.ok ? `${d.이름표.아이디(p.el)}(${[...옛].length}자)` : `${d.이름표.아이디(p.el)} 실패:${r.이유}`);
      }
      return { 한것: 한것.join(' '), 바꾼문단: 것들.length };
    },
  },
  {
    이름: '라) 표 모두 채우기',
    기대: '쪽수동일+표기하그대로',
    하기: (d) => {
      d.ID매기기();
      const 표들 = d.구역들.flatMap((s) => s.표들);
      if (표들.length === 0) return { 건너뜀: '표가 없다' };
      // 양식을 받으면 **한 칸이 아니라 전부** 채운다. 그게 실제로 하는 일이다.
      const 앞기하 = 표들.map((el) => {
        const t = new 표클래스(el);
        return `${t.줄수}x${t.칸수}[${t.열폭.join(',')}]`;
      });
      const 모든문단 = d.구역들.flatMap((s) => s.모든문단들);
      let 채운수 = 0, 못한수 = 0;
      for (const el of 표들) {
        const t = new 표클래스(el);
        for (const 칸 of t.셀들) {
          for (const p of childrenNamed(칸.subList, 'hp:p')) {
            const 문단 = 모든문단.find((x) => x.el === p);
            if (!문단) { 못한수++; continue; }
            const 옛 = 문단.글;
            if (!옛 || [...옛].length < 1) continue;
            // 글자 수를 맞춰 넣는다 — 줄이 안 밀려야 "표가 무너졌나" 를 가릴 수 있다
            const 새 = 같은꼴로(옛);
            // 기호·공백뿐인 칸은 바꿀 것이 없다. 넣으면 글바꾸기가 "이미 같은 글"
            // 이라고 옳게 거절하는데, 그걸 실패로 세면 시험이 거짓말을 한다.
            if (새 === 옛) continue;
            const r = d.글바꾸기(d.이름표.아이디(p), 새);
            if (r.ok) 채운수++; else 못한수++;
          }
        }
      }
      if (채운수 === 0) return { 건너뜀: `채울 칸이 없다 (표 ${표들.length}개)` };
      return { 한것: `표 ${표들.length}개 / ${채운수}칸 채움${못한수 ? ` (못한 것 ${못한수})` : ''}`, 앞기하, 표수: 표들.length };
    },
  },
  {
    이름: '마) 글자 서식 주기',
    기대: '한쪽만',
    하기: (d) => {
      d.ID매기기();
      // **문서에서 가장 흔한 글자 서식**을 쓰는 문단을 고른다.
      // 저만 쓰는 서식에 걸면, 서식을 새로 안 만들고 바탕을 고치는 잘못을
      // 이 시험이 못 잡는다 — 남이 물들 일이 없기 때문이다.
      const 후보 = d.구역들.flatMap((s) => s.모든문단들).filter((p) => p.글 && p.글.trim().length >= 6);
      const 셈 = new Map();
      for (const p of 후보) {
        const 런 = childrenNamed(p.el, 'hp:run')[0];
        const c = 런 ? (런.attrs.find((a) => a.name === 'charPrIDRef')?.value ?? '0') : '0';
        셈.set(c, (셈.get(c) ?? 0) + 1);
      }
      const 흔한 = [...셈].sort((a, b) => b[1] - a[1])[0]?.[0];
      const 것 = 후보.find((p) => {
        const 런 = childrenNamed(p.el, 'hp:run')[0];
        return 런 && (런.attrs.find((a) => a.name === 'charPrIDRef')?.value ?? '0') === 흔한;
      }) ?? 후보[0];
      if (!것) return { 건너뜀: '서식 줄 문단이 없다' };
      const r = d.글자서식주기(d.이름표.아이디(것.el), { 굵게: true, 색: '#C00000' });
      return { 한것: r.ok ? `${d.이름표.아이디(것.el)} 굵게+빨강 (흔한 charPr ${흔한}, 같은 서식 문단 ${셈.get(흔한)}개)` : `실패: ${r.이유}` };
    },
  },
];
const 손들 = 손거르개 ? 손들전부.filter((h) => h.이름.includes(손거르개)) : 손들전부;
if (손들.length === 0) { console.error(`'${손거르개}' 에 맞는 손이 없다`); process.exit(2); }

// ── 한글로 굽기 (한 번만 띄운다) ──────────────────────────────────────────
function 한글로굽기(짝들) {
  const NL = String.fromCharCode(10);
  const 줄 = ["$ErrorActionPreference='Continue'",
    '$hwp = New-Object -ComObject HWPFrame.HwpObject',
    'try { $hwp.RegisterModule("FilePathCheckDLL","FilePathCheckerModule") | Out-Null } catch {}',
    'try {'];
  for (const [입력, 출력, 표] of 짝들) {
    줄.push('  try {');
    줄.push(`    if ($hwp.Open('${입력}', "", "forceopen:true")) {`);
    줄.push(`      Write-Output ("PAGES ||| ${표} ||| " + $hwp.PageCount)`);
    줄.push(`      $hwp.SaveAs('${출력}', "PDF", "") | Out-Null`);
    줄.push(`    } else { Write-Output ("OPENFAIL ||| ${표}") }`);
    줄.push(`  } catch { Write-Output ("THROW ||| ${표} ||| " + $_.Exception.Message) }`);
    줄.push('  try { $hwp.Clear(1) | Out-Null } catch {}');
  }
  줄.push('} finally { try { $hwp.Quit() | Out-Null } catch {} }');
  // -Command 로 넘기면 32k 에서 잘린다. 파일로 넘긴다.
  // PowerShell 5.1 은 .ps1 을 **ANSI 로 읽는다** — BOM 을 붙여야 UTF-8 로 읽는다.
  const 스크립트 = path.join(무대, 'bake.ps1');
  fs.writeFileSync(스크립트, '﻿' + 줄.join(NL), 'utf8');
  return execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 스크립트],
    { encoding: 'buffer', timeout: 3_000_000, maxBuffer: 1 << 26 }).toString('utf8');
}

function 픽셀견주기(가, 나) {
  const 낼곳 = path.join(무대, 'diff.json');
  const r = spawnSync(파이썬, [path.join(여기, '픽셀대조.py'), 가, 나, 낼곳, '100'],
    { encoding: 'utf8', timeout: 1_800_000 });
  if (r.status !== 0) throw new Error(`픽셀 대조가 안 됐다: ${(r.stderr ?? '').slice(0, 300)}`);
  return JSON.parse(fs.readFileSync(낼곳, 'utf8'));
}

// ── 1. 고친 파일들을 다 만든다 ────────────────────────────────────────────
const 판들 = [];
for (const [i, 양식] of 양식들.entries()) {
  const 원본바이트 = fs.readFileSync(양식.길);
  const 원본길 = path.join(무대, `f${i}-orig.hwpx`);
  fs.writeFileSync(원본길, 원본바이트);
  판들.push({ 표: `f${i}-orig`, 양식, 손: null, hwpx: 원본길, pdf: path.join(무대, `f${i}-orig.pdf`) });

  for (const [j, 손] of 손들.entries()) {
    const 표 = `f${i}-h${j}`;
    const 판 = { 표, 양식, 손, hwpx: path.join(무대, `${표}.hwpx`), pdf: path.join(무대, `${표}.pdf`) };
    try {
      const d = 문서.열기(원본바이트);
      const 앞개체 = 개체수(d);
      const 결 = 손.하기(d);
      if (결.건너뜀) { 판.건너뜀 = 결.건너뜀; 판들.push(판); continue; }
      판.앞개체 = 앞개체;
      판.한것 = 결.한것;
      판.덧 = 결;
      판.검사탈 = d.검사();
      판.실패기록 = d.실패기록.length;
      fs.writeFileSync(판.hwpx, d.저장());
    } catch (e) {
      판.터짐 = e.message;
    }
    판들.push(판);
  }
}

const 구울것 = 판들.filter((p) => !p.건너뜀 && !p.터짐);
console.log(`양식 ${양식들.length}개 × 손 ${손들.length}가지 — 한글로 ${구울것.length}판을 굽는다…`);
const 말 = 한글로굽기(구울것.map((p) => [p.hwpx, p.pdf, p.표]));

const 쪽수 = new Map();
for (const m of 말.matchAll(/PAGES \|\|\| (\S+) \|\|\| (\d+)/g)) 쪽수.set(m[1], Number(m[2]));
const 못연것 = new Set([...말.matchAll(/OPENFAIL \|\|\| (\S+)/g)].map((m) => m[1]));

// ── 2. 견준다 ─────────────────────────────────────────────────────────────
const 줄들 = [];
let 통과 = 0, 실패 = 0, 건너뜀 = 0;

for (const [i, 양식] of 양식들.entries()) {
  const 원 = 판들.find((p) => p.표 === `f${i}-orig`);
  const 원쪽 = 쪽수.get(원.표);
  줄들.push(``);
  줄들.push(`■ ${양식.이름}  (${양식.갈래}, ${원쪽 ?? '?'}쪽)`);
  if (!fs.existsSync(원.pdf)) { 줄들.push('  원본을 한글이 못 열었다 — 이 양식은 통째로 건너뛴다'); continue; }

  for (const [j, 손] of 손들.entries()) {
    const 판 = 판들.find((p) => p.표 === `f${i}-h${j}`);
    const 앞 = `  ${손.이름.padEnd(17)}`;
    if (판.건너뜀) { 줄들.push(`${앞} — 건너뜀 (${판.건너뜀})`); 건너뜀++; continue; }
    if (판.터짐) { 줄들.push(`${앞} ✗ 터졌다: ${판.터짐}`); 실패++; continue; }
    if (못연것.has(판.표) || !fs.existsSync(판.pdf)) {
      줄들.push(`${앞} ✗ **한글이 우리가 저장한 파일을 못 열었다**`); 실패++; continue;
    }

    const 탈 = [];
    if (판.검사탈?.length) 탈.push(`저장 전 검사에 걸림: ${판.검사탈[0]}`);
    if (판.실패기록) 탈.push(`연산 ${판.실패기록}건 실패`);

    const 내쪽 = 쪽수.get(판.표);
    if (원쪽 && 내쪽 && 원쪽 !== 내쪽) 탈.push(`쪽 수가 ${원쪽} → ${내쪽} 로 바뀌었다`);

    const 견 = 픽셀견주기(원.pdf, 판.pdf);
    const 다른쪽 = 견.쪽.filter((p) => p.다른픽셀 > 0);
    const 최대비율 = 견.쪽.reduce((a, p) => Math.max(a, p.비율), 0);

    if (견.쪽수[0] !== 견.쪽수[1]) 탈.push(`PDF 쪽 수가 다르다 (${견.쪽수[0]} / ${견.쪽수[1]})`);
    if (손.기대 === '픽셀완전동일' && 다른쪽.length) {
      const 첫 = 다른쪽[0];
      탈.push(`**안 건드렸는데 ${다른쪽.length}쪽이 달라졌다** — ${첫.번호}쪽 ${(첫.비율 * 100).toFixed(3)}% 자리 ${JSON.stringify(첫.상자)}`);
    }
    // 고쳤는데 아무것도 안 달라졌으면, 저장이 조용히 고친 것을 버린 것이다.
    // 이 검사가 없으면 "저장이 편집을 통째로 날려도" 이 시험이 통과한다.
    if (손.기대 !== '픽셀완전동일' && 다른쪽.length === 0) {
      탈.push('**고쳤는데 그림이 하나도 안 달라졌다** — 저장이 고친 것을 버렸다');
    }
    if (손.기대 === '쪽수동일+바꾼곳만') {
      if (다른쪽.length > (판.덧?.바꾼문단 ?? 3)) {
        탈.push(`${다른쪽.length}쪽이 달라졌다 — 문단 ${판.덧?.바꾼문단}개만 고쳤는데 판이 밀렸다`);
      }
      if (최대비율 > 0.15) 탈.push(`한 쪽이 ${(최대비율 * 100).toFixed(1)}% 달라졌다 — 너무 많다`);
    }
    if (손.기대 === '쪽수동일+표기하그대로') {
      if (최대비율 > 0.25) 탈.push(`한 쪽이 ${(최대비율 * 100).toFixed(1)}% 달라졌다 — 너무 많다`);
    }
    if (손.기대 === '한쪽만') {
      // 문단 하나에 서식을 줬으면 **그 문단이 있는 쪽만** 달라져야 한다.
      // 서식을 새로 안 만들고 바탕을 고치면 문서 전체가 같이 바뀐다.
      if (다른쪽.length > 1) {
        탈.push(`문단 하나만 고쳤는데 ${다른쪽.length}쪽이 달라졌다 — 서식이 남의 것까지 건드렸다`);
      }
    }

    // 글만 고쳤는데 표·그림이 사라지지 않았나
    if (판.앞개체) {
      const 뒤개체 = 개체수(문서.열기(fs.readFileSync(판.hwpx)));
      for (const [이름, n] of Object.entries(판.앞개체)) {
        if ((뒤개체[이름] ?? 0) !== n) {
          탈.push(`**${이름} 이 ${n}개 → ${뒤개체[이름] ?? 0}개가 됐다** — 양식이 빠그라졌다`);
        }
      }
    }

    // 표를 채웠으면 표 기하가 그대로인지 다시 열어 본다
    if (손.기대 === '쪽수동일+표기하그대로') {
      const 뒤 = 문서.열기(fs.readFileSync(판.hwpx));
      const 뒤표들 = 뒤.구역들.flatMap((s) => s.표들);
      if (뒤표들.length !== 판.덧.표수) 탈.push(`표가 ${판.덧.표수}개 → ${뒤표들.length}개가 됐다`);
      for (const [k, el] of 뒤표들.entries()) {
        const t = new 표클래스(el);
        const 뒤기하 = `${t.줄수}x${t.칸수}[${t.열폭.join(',')}]`;
        if (판.덧.앞기하[k] && 뒤기하 !== 판.덧.앞기하[k]) {
          탈.push(`${k}번 표 기하가 바뀌었다: ${판.덧.앞기하[k]} → ${뒤기하}`); break;
        }
        if (t.탈만.length) { 탈.push(`${k}번 표가 어긋났다: ${t.탈만[0]}`); break; }
      }
    }

    const 요약 = `쪽 ${내쪽 ?? '?'} / 다른쪽 ${다른쪽.length} / 최대 ${(최대비율 * 100).toFixed(3)}%`;
    if (탈.length) {
      실패++;
      줄들.push(`${앞} ✗ ${요약}`);
      for (const t of 탈) 줄들.push(`      ${t}`);
    } else {
      통과++;
      줄들.push(`${앞} ✓ ${요약}${판.한것 ? `  — ${판.한것}` : ''}`);
    }
  }
}

console.log(줄들.join(String.fromCharCode(10)));
console.log(``);
console.log(`판 ${통과 + 실패}번 — 통과 ${통과} / 탈 ${실패} / 건너뜀 ${건너뜀}`);
console.log(`낸 것: ${무대}`);
process.exit(실패 ? 1 : 0);
