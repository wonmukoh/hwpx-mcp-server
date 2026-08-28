/**
 * **정부 문서 여러 쪽을 재현하고 자로 댄다.**
 *
 * 한 쪽 잘 나왔다고 되는 것이 아니다. 여러 편·여러 쪽을 돌려야
 * "이 문서에서만 되는" 것이 아님을 안다.
 *
 * 쪽마다:
 *   1. 원본에서 그 쪽 문단을 뽑아 **우리 표시법**으로 되뽑는다
 *   2. 되풀어 글자가 원본과 같은지 본다
 *   3. `compose` **한 번**으로 문서를 만든다
 *   4. 한글로 열어 PDF 로 굽는다
 *   5. 원본 쪽과 **자로 댄다** — 글자·여백·너비·줄간격·쪽 밖 삐져나감
 *
 * ## 못 하는 쪽은 못 한다고 말한다
 *
 * 표·그림이 든 쪽은 문단만으로 못 뽑는다 (표 안 글은 `hp:subList` 에 있다).
 * 그런 쪽은 **건너뛰되 왜인지 적는다.** 조용히 빼면 "10쪽 다 됐다" 는 거짓말이 된다.
 *
 *   node 검증/여러쪽재현.mjs
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { 쪽글자들, 섞어서쪽매기기, 파이썬찾기 } from './쪽가르기.mjs';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const B = (p) => pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', p, 'src', 'index.js')).href;

const { 문서, 표: 표클래스 } = await import(B('doc'));
const { 조판, 꾸밈풀기 } = await import(B('compose'));
const { parseXml, findAll, childrenNamed, firstChildNamed, getAttr, textOf } = await import(B('owpml'));

const 파이썬 = 파이썬찾기();
if (!파이썬) { console.error('python(pymupdf)이 없어 잴 수 없다'); process.exit(1); }

// 경로에 한글(글자)을 넣지 않는다
const 무대 = path.join(os.tmpdir(), 'hwpx-manypages');
fs.rmSync(무대, { recursive: true, force: true });
fs.mkdirSync(무대, { recursive: true });

const 표본 = path.join(뿌리, '자료', '표본', '공개');
const 문서들 = fs.readdirSync(표본).filter((f) => f.toLowerCase().endsWith('.hwpx')).sort();

// ── 한글로 원본들을 PDF 로 굽는다 (한 번만 띄운다) ───────────────────────
const 사본 = new Map();
for (const [i, 이름] of 문서들.entries()) {
  const p = path.join(무대, `src${i}.hwpx`);
  fs.copyFileSync(path.join(표본, 이름), p);
  사본.set(이름, { hwpx: p, pdf: path.join(무대, `src${i}.pdf`) });
}

function 한글로굽기(짝들) {
  const 줄 = ["$ErrorActionPreference='Continue'",
    '$hwp = New-Object -ComObject HWPFrame.HwpObject',
    'try { $hwp.RegisterModule("FilePathCheckDLL","FilePathCheckerModule") | Out-Null } catch {}',
    'try {'];
  for (const [입력, 출력, 쪽수알림] of 짝들) {
    줄.push(`  try {`);
    줄.push(`    if ($hwp.Open('${입력}', "", "forceopen:true")) {`);
    if (쪽수알림) 줄.push(`      Write-Output ("PAGES ||| ${쪽수알림} ||| " + $hwp.PageCount)`);
    줄.push(`      $hwp.SaveAs('${출력}', "PDF", "") | Out-Null`);
    줄.push('    } else { Write-Output ("OPENFAIL ||| ' + (쪽수알림 ?? 입력) + '") }');
    줄.push('  } catch { Write-Output ("THROW ||| " + $_.Exception.Message) }');
    줄.push('  try { $hwp.Clear(1) | Out-Null } catch {}');
  }
  줄.push('} finally { try { $hwp.Quit() | Out-Null } catch {} }');
  return execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 줄.join('\n')],
    { encoding: 'buffer', timeout: 1_800_000, maxBuffer: 1 << 24 }).toString('utf8');
}

console.log(`원본 ${문서들.length}편을 PDF 로 굽는다…`);
한글로굽기([...사본.values()].map((v) => [v.hwpx, v.pdf, null]));

// ── 재현할 쪽을 고른다 ────────────────────────────────────────────────────
/** 문단만으로 뽑을 수 있는 쪽인가 — 표·그림이 있으면 아직 못 한다 */
/**
 * 그 쪽의 것들을 차례대로 모은다 — 문단이든 표든.
 *
 * 아직 못 다루는 것(그림·도형)이 있으면 **왜인지 적고 건너뛴다.**
 * 조용히 빼면 "다 됐다" 는 거짓말이 된다.
 */
function 쪽뽑기(d, 문단들, 매김, 쪽번호) {
  const 그쪽 = 매김.filter((m) => m.쪽 === 쪽번호).map((m) => 문단들[m.번호]);
  if (그쪽.length === 0) return { 됨: false, 왜: '그 쪽에 문단이 없다' };

  const 것들 = [];
  for (const p of 그쪽) {
    // 표가 든 문단이면 표로 내놓는다 (표 안 글은 hp:subList 에 있어 문단 목록에 안 잡힌다)
    const 표들 = childrenNamed(p.el, 'hp:run').flatMap((r) => childrenNamed(r, 'hp:tbl'));
    const 못다루는것 = new Set();
    for (const r of childrenNamed(p.el, 'hp:run')) {
      for (const c of r.children) {
        if (c.kind !== 'element') continue;
        if (['hp:t', 'hp:tbl', 'hp:ctrl', 'hp:secPr'].includes(c.name)) continue;
        못다루는것.add(c.name);
      }
    }
    if (못다루는것.size) {
      return { 됨: false, 왜: `${[...못다루는것].join(
)} 이 들어 있다 (아직 못 뽑는다)` };
    }
    for (const t of 표들) 것들.push({ 갈래: '표', 표: t });
    if (p.글.trim().length > 0 || 표들.length === 0) 것들.push({ 갈래: '문단', 문단: p });
  }
  return { 됨: true, 것들 };
}
/** 문단을 우리 표시법으로 */
/** 역슬래시. 표시 글자를 막을 때 쓴다 */
const BS = String.fromCharCode(92);

function 표시로(p, charPr표) {
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

/** 문단 하나의 서식을 원본에서 읽는다 — 짐작하지 않고 그대로 옮긴다 */
/** 글꼴 id → 이름. 머리글마다 한 번만 만든다 */
const 글꼴표캐시 = new WeakMap();
function 글꼴이름표만들기(머리) {
  let t = 글꼴표캐시.get(머리);
  if (!t) {
    t = new Map(findAll(머리, 'hh:font').map((f) => [getAttr(f, 'id'), getAttr(f, 'face')]));
    글꼴표캐시.set(머리, t);
  }
  return t;
}

function 문단서식읽기(p, 머리) {
  const 글꼴이름표 = 글꼴이름표만들기(머리);
  const pp = findAll(머리, 'hh:paraPr').find((x) => getAttr(x, 'id') === p.문단모양);
  if (!pp) return {};
  const sw = firstChildNamed(pp, 'hp:switch');
  const 가지 = sw ? firstChildNamed(sw, 'hp:default') : pp;   // default 가 HWPUNIT 그대로다
  const m = 가지 && firstChildNamed(가지, 'hh:margin');
  const ls = 가지 && firstChildNamed(가지, 'hh:lineSpacing');
  const 값 = (태그) => {
    const e = m && firstChildNamed(m, 태그);
    return e ? Number(getAttr(e, 'value')) : 0;
  };
  const align = firstChildNamed(pp, 'hh:align');
  const 정렬표 = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFY: 'justify', DISTRIBUTE: 'distribute' };

  // 자간은 이 문단이 쓰는 글자모양에서 가장 흔한 값
  const 자간셈 = new Map();
  for (const id of p.글자모양들) {
    const cp = findAll(머리, 'hh:charPr').find((x) => getAttr(x, 'id') === id);
    const sp = cp && firstChildNamed(cp, 'hh:spacing');
    const v = sp ? Number(getAttr(sp, 'hangul')) : 0;
    자간셈.set(v, (자간셈.get(v) ?? 0) + 1);
  }
  const 자간 = [...자간셈].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

  // 글꼴도 가장 흔한 것 — **줄 높이가 글꼴마다 다르다.**
  // 안 옮기면 같은 180% 라도 줄 높이가 달라져 세로로 넘친다 (실측 13장).
  const 글꼴셈 = new Map();
  for (const id of p.글자모양들) {
    const cp = findAll(머리, 'hh:charPr').find((x) => getAttr(x, 'id') === id);
    const fr = cp && firstChildNamed(cp, 'hh:fontRef');
    const face = fr && 글꼴이름표.get(getAttr(fr, 'hangul'));
    if (face) 글꼴셈.set(face, (글꼴셈.get(face) ?? 0) + 1);
  }
  const 글꼴 = [...글꼴셈].sort((a, b) => b[1] - a[1])[0]?.[0];

  // 크기도 가장 흔한 것
  const 크기셈 = new Map();
  for (const id of p.글자모양들) {
    const cp = findAll(머리, 'hh:charPr').find((x) => getAttr(x, 'id') === id);
    const v = cp ? Number(getAttr(cp, 'height')) / 100 : 0;
    if (v > 0) 크기셈.set(v, (크기셈.get(v) ?? 0) + 1);
  }
  const 크기 = [...크기셈].sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    line_spacing: ls && getAttr(ls, 'type') === 'PERCENT' ? Number(getAttr(ls, 'value')) : undefined,
    letter_spacing: 자간 !== 0 ? 자간 : undefined,
    space_before: 값('hc:prev') / 100,
    space_after: 값('hc:next') / 100,
    indent_left: 값('hc:left') / 100,
    hanging: 값('hc:intent') / 100,
    align: align ? 정렬표[getAttr(align, 'horizontal')] : undefined,
    size: 크기,
    font: 글꼴,
  };
}

/**
 * 표를 블록으로. 셀 글을 줄·칸으로 편다.
 *
 * 글만 옮기면 안 된다. 그러면 정부 문서 표가 **밋밋한 격자**가 된다 —
 * 디자인 닮음에서 글자 크기 41%, 선 42% 로 나왔던 것이 이 탓이다.
 * 원본이 들고 있는 **열마다 정렬·글자 크기·테두리 굵기·머리 줄 배경**을 같이 읽는다.
 */
function 표블록(t, 머리) {
  const tt = new 표클래스(t);
  const 줄들 = [];
  for (let y = 0; y < tt.줄수; y++) {
    const 줄 = [];
    for (let x = 0; x < tt.칸수; x++) {
      const c = tt.셀(y, x);
      const 글 = c ? findAll(c.subList, 'hp:t').map(textOf).join('') : '';
      줄.push(글);
    }
    줄들.push(줄);
  }
  if (줄들.length === 0) return null;
  const 폭 = tt.열폭;
  const 다있나 = 폭.every((w) => w !== undefined);
  const 머리있나 = tt.셀들.some((c) => getAttr(c.el, "header") === "1");

  // ── 원본이 들고 있는 표 서식을 읽는다 ────────────────────────────────
  const 몸시작 = 머리있나 ? 1 : 0;

  /** 열마다 정렬 — 몸통 첫 줄에서 읽는다 (머리 줄은 늘 가운데라 표본이 안 된다) */
  const col_align = [];
  for (let x = 0; x < tt.칸수; x++) {
    const c = tt.셀(몸시작, x);
    const p = c && findAll(c.subList, 'hp:p')[0];
    const pr = p && findAll(머리, 'hh:paraPr').find((e) => getAttr(e, 'id') === getAttr(p, 'paraPrIDRef'));
    const a = pr && findAll(pr, 'hh:align')[0];
    col_align.push(({ LEFT: 'left', CENTER: 'center', RIGHT: 'right' })[a ? getAttr(a, 'horizontal') : ''] ?? 'left');
  }

  /** 표 안 글자 크기 — 몸통 칸에서 가장 흔한 것 */
  const 크기셈 = new Map();
  for (const c of tt.셀들) {
    for (const r of findAll(c.subList, 'hp:run')) {
      const cp = findAll(머리, 'hh:charPr').find((e) => getAttr(e, 'id') === getAttr(r, 'charPrIDRef'));
      if (!cp) continue;
      const h = Number(getAttr(cp, 'height')) / 100;
      if (h > 0) 크기셈.set(h, (크기셈.get(h) ?? 0) + 1);
    }
  }
  const cell_size = [...크기셈].sort((a, b) => b[1] - a[1])[0]?.[0];

  /** 테두리 굵기·머리 줄 배경 — 몸통 셀과 머리 셀의 borderFill 에서 */
  const bf = (셀) => 셀 && findAll(머리, 'hh:borderFill').find((e) => getAttr(e, 'id') === 셀.테두리);
  const 몸bf = bf(tt.셀(몸시작, 0));
  const border_width = 몸bf ? getAttr(findAll(몸bf, 'hh:leftBorder')[0] ?? {}, 'width') : undefined;
  const 머리bf = 머리있나 ? bf(tt.셀(0, 0)) : undefined;
  const 붓 = 머리bf && findAll(머리bf, 'hc:winBrush')[0];
  const 채움 = 붓 ? getAttr(붓, 'faceColor') : undefined;

  return {
    kind: 'table',
    ...(머리있나 ? { headers: 줄들[0], rows: 줄들.slice(1) } : { rows: 줄들 }),
    ...(다있나 ? { widths: 폭.map((w) => w / 100) } : {}),
    ...(col_align.some((a) => a !== 'left') ? { col_align } : {}),
    ...(cell_size ? { cell_size } : {}),
    ...(border_width ? { border_width } : {}),
    ...(채움 && 채움 !== 'none' ? { header_background: 채움 } : {}),
  };
}

function 블록만들기(것들, charPr표, 머리) {
  const 블록들 = [];
  for (const it of 것들) {
    if (it.갈래 === '표') { const b = 표블록(it.표, 머리); if (b) 블록들.push(b); continue; }
    const p = it.문단;
    const 맨글 = p.글.trim();
    const 서식 = 문단서식읽기(p, 머리);
    if (맨글.length === 0) {
      // **빈 문단에도 서식을 실어야 한다.** 글이 없어도 줄 높이는 차지한다.
      // 안 실으면 조판이 기본값(10pt·160% = 16pt)을 쓰는데 원본은 7pt 짜리라,
      // 빈 줄마다 9pt 씩 더 먹어 쪽이 세로로 넘쳤다.
      블록들.push({ kind: 'text', text: '', ...서식 });
      continue;
    }
    const 표시 = 표시로(p, charPr표).trim();
    if (/^\s*[※*]/.test(맨글)) {
      블록들.push({ kind: 'note', text: 표시, ...서식 });
    } else if (/^[(（]?[ⅠⅡⅢⅣⅤ\d]+[).．]/.test(맨글) && 맨글.length < 60) {
      블록들.push({ kind: 'heading', text: 표시, ...서식 });
    } else {
      블록들.push({ kind: 'body', text: 표시, indent: false, ...서식 });
    }
  }
  return 블록들;
}

/** 원본 쪽의 서식을 잰다 — 여백·줄간격·자간 */
/** 이 문단이 든 구역을 찾는다. 구역이 여럿인 문서는 쪽 여백이 구역마다 다르다 */
function 문단의구역(d, p) {
  for (const s of d.구역들) {
    let 위 = p.el;
    while (위) { if (위 === s.root) return s; 위 = 위.parent; }
  }
  return d.구역들[0];
}

function 원본서식(d, 문단들) {
  const 머리doc = parseXml(d.머리.toXml());
  const 머리 = 머리doc.root;
  // 구역이 여럿이면 **그 쪽이 든 구역**의 여백을 써야 한다.
  // 첫 구역 것을 쓰면 글 왼쪽이 통째로 어긋난다 (실제로 7.6pt 어긋났다).
  const s = 문단들[0] ? 문단의구역(d, 문단들[0]) : d.구역들[0];
  const 여백 = s.쪽여백 ?? {};

  // 가장 많이 쓰인 본문 문단모양에서 줄간격을, 글자모양에서 자간을 잰다
  const 셈 = new Map();
  for (const p of 문단들) 셈.set(p.문단모양, (셈.get(p.문단모양) ?? 0) + 1);
  const 흔한것 = [...셈].sort((a, b) => b[1] - a[1])[0]?.[0];
  const pp = findAll(머리, 'hh:paraPr').find((x) => getAttr(x, 'id') === 흔한것);
  let 줄간격 = 160;
  if (pp) {
    const sw = firstChildNamed(pp, 'hp:switch');
    const g = sw ? firstChildNamed(sw, 'hp:case') : pp;
    const ls = g && firstChildNamed(g, 'hh:lineSpacing');
    if (ls && getAttr(ls, 'type') === 'PERCENT') 줄간격 = Number(getAttr(ls, 'value'));
  }

  const 자간셈 = new Map();
  for (const p of 문단들) {
    for (const id of p.글자모양들) {
      const cp = findAll(머리, 'hh:charPr').find((x) => getAttr(x, 'id') === id);
      const sp = cp && firstChildNamed(cp, 'hh:spacing');
      const v = sp ? Number(getAttr(sp, 'hangul')) : 0;
      자간셈.set(v, (자간셈.get(v) ?? 0) + 1);
    }
  }
  const 자간 = [...자간셈].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

  // 본문 글꼴
  const ff = findAll(머리, 'hh:fontface').find((f) => getAttr(f, 'lang') === 'HANGUL');
  const 글꼴들 = ff ? childrenNamed(ff, 'hh:font').map((f) => getAttr(f, 'face')) : [];

  return {
    page: {
      margin_left: (여백['left'] ?? 8504) / 100,
      margin_right: (여백['right'] ?? 8504) / 100,
      margin_top: (여백['top'] ?? 5668) / 100,
      margin_bottom: (여백['bottom'] ?? 4252) / 100,
      // 머리말·꼬리말 자리도 옮긴다. 안 옮기면 본문 높이가 좁아져
      // **아무 잘못 없이 세로로 넘친다** (교육부 2834 vs 빈 문서 틀 4252).
      margin_header: (여백['header'] ?? 4252) / 100,
      margin_footer: (여백['footer'] ?? 4252) / 100,
    },
    line_spacing: 줄간격,
    letter_spacing: 자간,
    body_font: 글꼴들.includes('함초롬바탕') ? '함초롬바탕' : (글꼴들[0] ?? undefined),
  };
}

// ── 쪽마다 재현한다 ──────────────────────────────────────────────────────
const 할것 = [];
for (const 이름 of 문서들) {
  const { hwpx, pdf } = 사본.get(이름);
  if (!fs.existsSync(pdf)) { 할것.push({ 이름, 쪽: null, 건너뜀: 'PDF 가 안 나왔다' }); continue; }

  const d = 문서.열기(fs.readFileSync(hwpx));
  const 문단들 = d.구역들.flatMap((s) => s.문단들);
  const 쪽글자 = 쪽글자들(pdf, 파이썬);
  const 가른것 = 섞어서쪽매기기(문단들, 쪽글자, getAttr, firstChildNamed, childrenNamed);
  const 매김 = 가른것.매김;
  console.log(`  ${이름.slice(0, 28).padEnd(30)} ${가른것.어떻게}`
    + ` — 쪽 ${Math.max(...매김.map((m) => m.쪽 ?? 0)) + 1}개 / PDF ${쪽글자.length}쪽`);

  const 머리 = parseXml(d.머리.toXml()).root;
  const charPr표 = new Map();
  for (const cp of findAll(머리, 'hh:charPr')) {
    charPr표.set(getAttr(cp, 'id'), {
      색: getAttr(cp, 'textColor') ?? '#000000',
      굵게: !!firstChildNamed(cp, 'hh:bold'),
    });
  }

  for (let 쪽 = 0; 쪽 < 쪽글자.length; 쪽++) {
    const 뽑기 = 쪽뽑기(d, 문단들, 매김, 쪽);
    if (!뽑기.됨) { 할것.push({ 이름, 쪽: 쪽 + 1, 건너뜀: 뽑기.왜 }); continue; }
    const 그쪽문단 = 뽑기.것들.filter((x) => x.갈래 === '문단').map((x) => x.문단);
    할것.push({
      이름, 쪽: 쪽 + 1, 원본pdf: pdf,
      블록들: 블록만들기(뽑기.것들, charPr표, 머리),
      설정: 원본서식(d, 그쪽문단),
    });
  }
}

const 할수있는것 = 할것.filter((x) => !x.건너뜀);
console.log(`문서 ${문서들.length}편 / 쪽 ${할것.length}개 — 재현할 수 있는 쪽 ${할수있는것.length}개\n`);

// 만들고, 한 번에 한글에 먹인다
const 짝들 = [];
for (const [i, it] of 할수있는것.entries()) {
  const d = 문서.새로();
  d.ID매기기();
  // 줄간격·자간은 **블록마다** 원본 값을 물렸다. 설정은 쪽 여백과 글꼴만.
  const { line_spacing, letter_spacing, ...쪽설정 } = it.설정;
  const r = 조판(d, it.블록들, {
    ...쪽설정,
    page_number: 'bottom-center',
  });
  if (!r.ok) { it.탈 = [`조판 실패: ${r.이유}`]; continue; }
  const 검사탈 = d.검사();
  if (검사탈.length) it.탈 = [`검사에 걸림: ${검사탈[0]}`];
  it.우리것 = path.join(무대, `repro${i}.hwpx`);
  it.우리pdf = path.join(무대, `repro${i}.pdf`);
  fs.writeFileSync(it.우리것, d.저장());
  짝들.push([it.우리것, it.우리pdf, `${i}`]);
  it.요소 = r.value.문단수;
}

console.log(`재현본 ${짝들.length}편을 한글에 먹인다…`);
const 한글말 = 한글로굽기(짝들);
for (const 줄 of 한글말.split(/\r?\n/)) {
  const m = /PAGES \|\|\| (\d+) \|\|\| (\d+)/.exec(줄);
  if (m) 할수있는것[Number(m[1])].난쪽수 = Number(m[2]);
  const f = /OPENFAIL \|\|\| (\d+)/.exec(줄);
  if (f) (할수있는것[Number(f[1])].탈 ??= []).push('한글이 안 받았다');
}

// ── 자로 댄다 ────────────────────────────────────────────────────────────
function 대조(원본pdf, 원본쪽, 우리pdf) {
  const r = spawnSync(파이썬, [path.join(여기, '대조하기.py'), 원본pdf, String(원본쪽), 우리pdf, '1'],
    { encoding: 'utf8' });
  const 말 = (r.stdout ?? '') + (r.stderr ?? '');
  const 숫자 = (이름) => {
    const m = new RegExp(`${이름}[^\\n]*차이 (-?[\\d.]+)pt`).exec(말);
    return m ? Number(m[1]) : null;
  };
  const 글자 = /\(원본 (\d+)자 \/ 재현 (\d+)자\)/.exec(말);
  const 간격 = /줄 간격[^\n]*원본 ([\d.]+)pt\s+재현 ([\d.]+)pt/.exec(말);
  const 줄수 = /줄 수[^\n]*원본 (\d+)\s+재현 (\d+)/.exec(말);
  return {
    왼쪽차: 숫자('글 왼쪽'), 너비차: 숫자('글 너비'),
    원본글자: 글자 ? Number(글자[1]) : null, 재현글자: 글자 ? Number(글자[2]) : null,
    똑같나: 말.includes('○ 똑같다'),
    원본간격: 간격 ? Number(간격[1]) : null, 재현간격: 간격 ? Number(간격[2]) : null,
    원본줄: 줄수 ? Number(줄수[1]) : null, 재현줄: 줄수 ? Number(줄수[2]) : null,
  };
}

/**
 * PDF **전체 쪽**의 글자 수. 공백은 뺀다.
 *
 * 1쪽만 세면 **넘침과 잘못 가름을 못 가린다.**
 * 둘 다 "1쪽 글자가 모자람" 으로 똑같이 보이기 때문이다.
 * 전체를 세면 갈린다 — 전체가 맞으면 넘친 것이고(우리 탈),
 * 전체도 안 맞으면 애초에 쪽을 잘못 가른 것이다(못 잰 것).
 */
function 온글자수(pdf) {
  const 낼곳 = path.join(무대, 'allchars.json');
  const 코드 = [
    'import sys, json, pymupdf',
    'd = pymupdf.open(sys.argv[1])',
    's = "".join(w[4] for p in d for w in p.get_text("words"))',
    'open(sys.argv[2], "w", encoding="utf-8").write(json.dumps(len(s)))',
  ].join(String.fromCharCode(10));
  const 임시 = path.join(무대, 'allchars.py');
  fs.writeFileSync(임시, 코드, 'utf8');
  const r = spawnSync(파이썬, [임시, pdf, 낼곳], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  try { return JSON.parse(fs.readFileSync(낼곳, 'utf8')); } catch { return null; }
}

function 삐져나감(pdf) {
  const r = spawnSync(파이썬, [path.join(여기, '눈으로보기.py'), pdf,
    path.join(path.dirname(pdf), `본것-${path.basename(pdf, '.pdf')}`)], { encoding: 'utf8' });
  const 말 = (r.stdout ?? '') + (r.stderr ?? '');
  const m = /쪽 밖으로 나간 것 (\d+)개/.exec(말);
  return m ? Number(m[1]) : 0;
}

for (const it of 할수있는것) {
  if (!fs.existsSync(it.우리pdf ?? '')) { (it.탈 ??= []).push('PDF 가 안 나왔다'); continue; }
  it.잰것 = 대조(it.원본pdf, it.쪽, it.우리pdf);
  it.디자인 = 디자인닮음(it.원본pdf, it.쪽, it.우리pdf);
  it.삐짐 = 삐져나감(it.우리pdf);

  const 탈 = it.탈 ?? [];

  // ── 먼저 **자를 믿을 수 있나** 부터 본다 ──────────────────────────────
  //
  // 쪽가르기는 PDF 글자를 맞춰 "이 문단은 3쪽" 을 되짚는 어림짐작이다.
  // 어림이 빗나가면 그 쪽에 남의 문단이 섞이거나 제 문단이 빠진다.
  // 그 상태로 잰 값은 **우리 잘못이 아니라 자가 틀린 것**이다.
  //
  // 실제로 겪었다: 원본 651자 / 재현 1018자 인 쪽을 두고
  // "세로로 넘쳐 2쪽이 났다" 고 보고했다. 넘친 게 아니라 내가 잘못 갈랐다.
  // 그런 쪽은 탈로 세지 않고 **못 갈랐다고 따로 적는다.**
  const j0 = it.잰것;
  if (j0.원본글자 !== null && j0.재현글자 !== null) {
    const 벌어짐 = Math.abs(j0.원본글자 - j0.재현글자);
    const 참을만큼 = Math.max(8, j0.원본글자 * 0.05);
    if (벌어짐 > 참을만큼) {
      // 1쪽 글자가 모자란 데는 **두 가지 까닭**이 있고, 둘은 전혀 다른 것이다:
      //   가) 우리가 세로로 넘쳐 2쪽으로 밀렸다 → **우리 탈이다**
      //   나) 애초에 쪽을 잘못 갈라 남의 문단이 섞였다 → **잰 적이 없는 것이다**
      // 전체 쪽 글자를 세면 갈린다. 안 가르면 넘침이 '못 갈랐다' 뒤에 숨는다.
      const 온것 = 온글자수(it.우리pdf);
      const 넘친것 = 온것 !== null
        && Math.abs(온것 - j0.원본글자) <= Math.max(8, j0.원본글자 * 0.05);
      if (넘친것) {
        탈.push(`세로로 넘쳤다 — 1쪽에 ${j0.재현글자}자만 남고 나머지는 다음 쪽으로 갔다`
          + ` (온 글자 ${온것} 은 원본 ${j0.원본글자} 과 맞다)`);
      } else {
        it.못갈랐다 = `글자가 원본 ${j0.원본글자} / 재현 ${j0.재현글자}`
          + `${온것 !== null ? ` (온 쪽 합쳐도 ${온것})` : ''} — 쪽을 잘못 갈랐다`;
        it.탈 = [];
        continue;
      }
    }
  }

  if (it.난쪽수 !== undefined && it.난쪽수 !== 1) 탈.push(`${it.난쪽수}쪽이 났다 (1쪽이어야 한다)`);
  if (it.삐짐 > 0) 탈.push(`쪽 밖으로 ${it.삐짐}개가 나갔다`);
  const j = it.잰것;
  if (j.왼쪽차 === null || Math.abs(j.왼쪽차) > 2) 탈.push(`글 왼쪽이 ${j.왼쪽차}pt 어긋났다`);
  if (j.너비차 === null || Math.abs(j.너비차) > 6) 탈.push(`글 너비가 ${j.너비차}pt 어긋났다`);
  if (j.원본간격 !== null && Math.abs(j.원본간격 - j.재현간격) > 0.6) {
    탈.push(`줄 간격이 다르다 (${j.원본간격} / ${j.재현간격})`);
  }
  // 글자 — 쪽 번호가 끼므로 글자 수로만 본다.
  // 크게 벌어진 것은 위에서 '못 갈랐다' 로 빠졌다. 여기 남은 것은 진짜 차이다.
  if (j.원본글자 !== null && Math.abs(j.원본글자 - j.재현글자) > 3) {
    탈.push(`글자 수가 다르다 (원본 ${j.원본글자} / 재현 ${j.재현글자})`);
  }
  it.탈 = 탈;
}

/**
 * **디자인이 얼마나 닮았나** — 글자 크기·굵기·색·가로 자리·선을 따로 잰다.
 *
 * 글자만 맞는지 보는 것으로는 "충실히 재현했나" 에 답할 수 없다.
 * 글이 706/708 자로 거의 같은데 큰 제목이 안 크고 굵은 글자가 하나도 없는
 * 밋밋한 쪽이 나올 수 있다 — 실제로 그랬다.
 */
function 디자인닮음(원본pdf, 원본쪽, 우리pdf) {
  const 낼곳 = path.join(무대, 'design.json');
  const r = spawnSync(파이썬, [path.join(여기, '디자인닮음.py'),
    원본pdf, String(원본쪽), 우리pdf, '0', 낼곳], { encoding: 'utf8', timeout: 600_000 });
  if (r.status !== 0) return null;
  try { return JSON.parse(fs.readFileSync(낼곳, 'utf8')); } catch { return null; }
}

// ── 알림 ─────────────────────────────────────────────────────────────────
console.log('┌─ 쪽마다 잰 것 ' + '─'.repeat(62));
console.log('│ ' + '문서'.padEnd(28) + '쪽   글자(원본/재현)   왼쪽차  너비차   줄간격 디자인   탈');
let 통과 = 0;
for (const it of 할수있는것) {
  const j = it.잰것 ?? {};
  const 짧은이름 = it.이름.replace('.hwpx', '').slice(0, 26);
  const 글자 = j.원본글자 !== undefined && j.원본글자 !== null ? `${j.원본글자}/${j.재현글자}` : '—';
  const 줄 = [
    '│ ' + 짧은이름.padEnd(28),
    String(it.쪽).padStart(2),
    글자.padStart(14),
    (j.왼쪽차 ?? '—').toString().padStart(7),
    (j.너비차 ?? '—').toString().padStart(7),
    `${j.원본간격 ?? '—'}/${j.재현간격 ?? '—'}`.padStart(9),
    (it.디자인 && !it.못갈랐다 ? `${(it.디자인.닮음 * 100).toFixed(0)}%` : '—').padStart(5),
    '  ' + (it.탈.length ? `✗ ${it.탈[0]}` : '○'),
  ].join(' ');
  console.log(it.못갈랐다 ? 줄.replace(/○$/, '－ 못 갈랐다') : 줄);
  if (!it.못갈랐다 && it.탈.length === 0) 통과++;
}
console.log('└' + '─'.repeat(76));

const 건너뛴것 = 할것.filter((x) => x.건너뜀);
if (건너뛴것.length) {
  console.log(`\n건너뛴 쪽 ${건너뛴것.length}개 — **못 한 것이지 없는 것이 아니다**`);
  const 까닭 = new Map();
  for (const it of 건너뛴것) 까닭.set(it.건너뜀, (까닭.get(it.건너뜀) ?? 0) + 1);
  for (const [왜, n] of [...까닭].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}쪽  ${왜}`);
}

// ── 디자인이 얼마나 충실한가 ────────────────────────────────────────────
const 잰디자인 = 할수있는것.filter((x) => x.디자인 && !x.못갈랐다 && x.디자인.닮음 !== undefined);
if (잰디자인.length) {
  const 평균 = (뽑기) => 잰디자인.reduce((a, x) => a + 뽑기(x.디자인), 0) / 잰디자인.length;
  console.log(`\n디자인 닮음 — 쪽 ${잰디자인.length}개 평균`);
  for (const [이름, 열쇠] of [['글자 크기', '글자크기'], ['굵기', '굵기'], ['색', '색'],
    ['가로 자리', '가로자리'], ['선', '선'], ['모두', '닮음']]) {
    const v = 평균((d) => d[열쇠] ?? 0);
    const 막대 = '█'.repeat(Math.round(v * 24)).padEnd(24, '·');
    console.log(`  ${이름.padEnd(9)} ${막대} ${(v * 100).toFixed(1)}%`);
  }
  const 셈 = (쪽, 열쇠) => 쪽.디자인[열쇠] ?? 0;
  const 합 = (열쇠) => 잰디자인.reduce((a, x) => a + (x.디자인[열쇠] ?? 0), 0);
  console.log(`  원본에 있던 굵은 글자 ${잰디자인.reduce((a, x) => a + (x.디자인.원본?.굵은글자 ?? 0), 0)}자`
    + ` → 재현 ${잰디자인.reduce((a, x) => a + (x.디자인.재현?.굵은글자 ?? 0), 0)}자`);
  console.log(`  원본 글자 크기 갈래 ${잰디자인.reduce((a, x) => a + (x.디자인.원본?.크기갈래 ?? 0), 0)}`
    + ` → 재현 ${잰디자인.reduce((a, x) => a + (x.디자인.재현?.크기갈래 ?? 0), 0)}`);
  console.log(`  원본 색 갈래 ${잰디자인.reduce((a, x) => a + (x.디자인.원본?.색갈래 ?? 0), 0)}`
    + ` → 재현 ${잰디자인.reduce((a, x) => a + (x.디자인.재현?.색갈래 ?? 0), 0)}`);
}

const 못간것 = 할수있는것.filter((x) => x.못갈랐다).length;
const 잰것수 = 할수있는것.length - 못간것;
console.log(`\n재현한 쪽 ${할수있는것.length}개 — 잰 쪽 ${잰것수} (탈 없음 ${통과} / 탈 있음 ${잰것수 - 통과}) / 못 갈라 못 잰 쪽 ${못간것}`);
for (const it of 할수있는것) {
  if (!it.탈.length) continue;
  console.log(`  ✗ ${it.이름} ${it.쪽}쪽`);
  for (const t of it.탈) console.log(`      ${t}`);
}
console.log(`\n낸 것: ${무대}`);
process.exit(할수있는것.length && 통과 === 할수있는것.length ? 0 : 1);
