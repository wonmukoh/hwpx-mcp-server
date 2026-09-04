/**
 * 문서를 **HTML 한 장**으로 엮는다.
 *
 * 왜 있나: `.hwpx` 는 브라우저가 못 연다. 그래서 문서를 만들어 주는 앱이
 * **미리보기도 PDF 도 못 준다** — 한글이 깔려 있어야만 눈으로 볼 수 있었다.
 * HTML 로 한 번 옮겨 두면 미리보기·인쇄·PDF·워드 붙여넣기가 한꺼번에 풀린다.
 *
 * ## 자족적이다
 *
 * 딸린 폴더가 없다. 그림은 `data:` 로 박고 CSS 는 안에 적는다.
 * 파일 하나를 그대로 브라우저에 던지면 그려진다.
 *
 * ## 문단을 `<p>` 가 아니라 `<div>` 로 내는 까닭
 *
 * **표가 문단 안에 들어 있다.** 실측 런 49168개 가운데 1269개가 `hp:tbl` 을 물고
 * 있고, 글과 표가 **같은 런에 든 것이 1134개**다. `<p>` 안에 `<table>` 을 쓰면
 * HTML 규격 위반이라 브라우저가 표를 문단 **밖으로 끌어낸다** — 차례가 뒤집힌다.
 * `<div>` 는 그런 제약이 없다.
 *
 * ## 못 하는 것 — 쪽이 어디서 넘어가는지
 *
 * 한글과 브라우저는 줄 끊는 규칙이 다르다. 글자와 표는 닮게 나오지만
 * **몇 쪽짜리가 되느냐는 달라진다.** 「인쇄본과 한 픽셀도 안 틀리게」는 못 한다.
 * 미리보기·검토용이다. 못 옮긴 것은 `못옮긴것` 에 담아 **말해 준다.**
 */

import {
  childrenNamed, findAll, firstChildNamed, getAttr, textOf, parseXml,
  hwp, hwpToMm, hwpToPt, readHwp,
  type ElementNode, type HwpUnit,
} from '@hwpx/owpml';
import { 문서, 표, 구역 } from '@hwpx/doc';
import { 서식장, type 글자모양, type 문단모양, type 선 } from './서식읽기.js';

export interface 엮기설정 {
  /** `<title>`. 안 주면 첫 글줄을 쓴다 */
  제목?: string;
  /**
   * 그림을 `data:` 로 박을까. `false` 면 자리만 잡는다.
   * 그림이 많은 문서는 HTML 이 몇 MB 가 된다 — 그게 곤란할 때 끈다.
   */
  그림?: boolean;
}

export interface 엮은것 {
  html: string;
  구역수: number;
  문단수: number;
  표수: number;
  그림수: number;
  글자수: number;
  /** 옮기지 못하고 지나친 것들. 사람이 읽는 말로 */
  못옮긴것: string[];
}

/** HWPUNIT → mm 을 소수 둘째 자리까지. CSS 에 넣을 글자 */
function mm(v: HwpUnit | number): string {
  return `${(hwpToMm(hwp(Number(v))) as number).toFixed(2)}mm`;
}

/** HWPUNIT → pt */
function pt(v: HwpUnit | number): string {
  return `${(hwpToPt(hwp(Number(v))) as number).toFixed(2)}pt`;
}

/** HTML 로 낼 글. `&` 를 **먼저** 바꿔야 한다 — 나중에 바꾸면 제가 낸 `&lt;` 를 또 바꾼다 */
function 감싸기(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * CSS 값에 넣을 글꼴 이름.
 *
 * 이름은 **남의 문서에서 온 것**이라 뭐가 들었는지 모른다.
 * 따옴표나 역슬래시가 섞이면 CSS 가 거기서 깨진다. 빼고 감싼다.
 */
function 글꼴값(이름: string): string {
  return `'${이름.replace(/['"\\]/g, '')}'`;
}

/** `#RRGGBB` 인 것만 통과시킨다. `none` 이나 이상한 값은 안 쓴다 */
function 색값(v: string | undefined): string | undefined {
  return v !== undefined && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined;
}

const 정렬표: Record<string, string> = {
  LEFT: 'left', RIGHT: 'right', CENTER: 'center',
  JUSTIFY: 'justify', DISTRIBUTE: 'justify', DISTRIBUTE_SPACE: 'justify',
};

const 세로정렬표: Record<string, string> = {
  TOP: 'top', CENTER: 'middle', BOTTOM: 'bottom',
};

/** `"0.12 mm"` → `0.12mm`. 한글은 숫자와 단위 사이에 칸을 둔다 */
function 굵기값(w: string): string {
  const n = parseFloat(w);
  return Number.isFinite(n) && n > 0 ? `${n}mm` : '0.12mm';
}

/** CSS `border-*` 한 줄. **안 그리는 선이면 `undefined`** */
function 선값(s: 선 | undefined): string | undefined {
  if (s === undefined || s.종류 === 'NONE') return undefined;
  const 꼴 = s.종류 === 'DASH' ? 'dashed'
    : s.종류 === 'DOT' ? 'dotted'
      : s.종류 === 'DOUBLE_SLIM' || s.종류 === 'SLIM_THICK' ? 'double' : 'solid';
  return `${굵기값(s.굵기)} ${꼴} ${색값(s.색) ?? '#000000'}`;
}

/** `key: value` 짝들을 style 속성으로. 빈 것은 버린다 */
function 스타일(짝: Record<string, string | undefined>): string {
  const 것 = Object.entries(짝)
    .filter((e): e is [string, string] => e[1] !== undefined && e[1] !== '')
    .map(([k, v]) => `${k}:${v}`);
  return 것.length === 0 ? '' : ` style="${감싸기(것.join(';'))}"`;
}

/** 엮는 동안 들고 다니는 것 */
class 엮는이 {
  readonly 못옮긴것 = new Set<string>();
  문단수 = 0;
  표수 = 0;
  그림수 = 0;
  글자수 = 0;

  constructor(
    readonly 서식: 서식장,
    /** `binaryItemIDRef` → `data:` URI. 그림을 안 박으면 빈 Map */
    readonly 그림장: Map<string, string>,
  ) {}
}

// ── 문단 ────────────────────────────────────────────────────────────────────

/**
 * 문단 하나.
 *
 * 문단의 자식을 **차례대로** 훑는다. 런 안에 글·표·그림이 섞여 있고
 * **차례가 뜻을 갖는다** — 글 다음에 표가 오는 문단을 글만 모아 내면 표가 앞으로 간다.
 */
function 문단엮기(p: ElementNode, c: 엮는이): string {
  c.문단수++;
  const 모양 = c.서식.문단모양(getAttr(p, 'paraPrIDRef'));
  const 조각: string[] = [];

  for (const 런 of childrenNamed(p, 'hp:run')) {
    const 글모양 = c.서식.글자모양(getAttr(런, 'charPrIDRef'));
    for (const 것 of 런.children) {
      if (것.kind !== 'element') continue;
      조각.push(런속엮기(것, 글모양, c));
    }
  }

  const 속 = 조각.join('');
  // **빈 문단도 자리를 차지한다.** 양식의 빈 줄은 뜻이 있는 자리라
  // 없애면 아래가 통째로 올라온다.
  const 알맹이 = 속 === '' ? '<br>' : 속;

  return `<div class="p"${문단스타일(모양, p)}>${알맹이}</div>`;
}

function 문단스타일(모양: 문단모양 | undefined, p: ElementNode): string {
  // `hp:p/@pageBreak` 도 쪽 나눔이다 — 문단 모양과 별개로 붙는다
  const 쪽나눔 = (모양?.쪽나눔앞 ?? false) || getAttr(p, 'pageBreak') === '1';
  if (모양 === undefined) {
    return 스타일({ 'page-break-before': 쪽나눔 ? 'always' : undefined });
  }
  return 스타일({
    'text-align': 모양.정렬 === undefined ? undefined : 정렬표[모양.정렬],
    'margin-left': 모양.왼여백 === 0 ? undefined : mm(모양.왼여백),
    'margin-right': 모양.오른여백 === 0 ? undefined : mm(모양.오른여백),
    'margin-top': 모양.앞여백 === 0 ? undefined : mm(모양.앞여백),
    'margin-bottom': 모양.뒤여백 === 0 ? undefined : mm(모양.뒤여백),
    'text-indent': 모양.들여쓰기 === 0 ? undefined : mm(모양.들여쓰기),
    'line-height': 줄간격값(모양),
    'page-break-before': 쪽나눔 ? 'always' : undefined,
  });
}

function 줄간격값(모양: 문단모양): string | undefined {
  const ls = 모양.줄간격;
  if (ls === undefined || ls.값 <= 0) return undefined;
  // PERCENT 는 백분율 그대로. 나머지(FIXED·AT_LEAST)는 HWPUNIT 길이다
  return ls.종류 === 'PERCENT' ? `${ls.값}%` : pt(ls.값);
}

/** 런 안의 것 하나 — 글이거나, 표거나, 그림이거나 */
function 런속엮기(것: ElementNode, 글모양: 글자모양 | undefined, c: 엮는이): string {
  switch (것.name) {
    case 'hp:t': {
      const 글 = textOf(것);
      c.글자수 += 글.length;
      if (글 === '') return '';
      return `<span${글자스타일(글모양)}>${감싸기(글)}</span>`;
    }
    case 'hp:tbl':
      return 표엮기(것, c);
    case 'hp:pic':
      return 떠있으면감싸기(것, 그림엮기(것, c, false));
    case 'hp:container':
      return 떠있으면감싸기(것, 묶음엮기(것, c));
    case 'hp:rect': case 'hp:ellipse': case 'hp:polygon':
    case 'hp:arc': case 'hp:curve':
      return 떠있으면감싸기(것, 도형엮기(것, c, false));
    case 'hp:lineBreak':
      return '<br>';
    case 'hp:tab':
      // 탭 자리는 한글이 탭 설정으로 잡는다. 여기서는 눈에 보이는 만큼만 벌린다
      return '<span class="tab"></span>';
    // 쪽 설정·조판 표시·줄 배치는 눈에 안 보이는 것이라 그냥 지난다
    case 'hp:secPr':
    case 'hp:ctrl':
    case 'hp:linesegarray':
      return '';
    default:
      c.못옮긴것.add(못옮긴이름(것.name));
      return '';
  }
}

function 글자스타일(m: 글자모양 | undefined): string {
  if (m === undefined) return '';
  const 밑 = m.밑줄 !== undefined && m.밑줄 !== 'NONE';
  const 꾸밈 = [밑 ? 'underline' : '', m.취소선 ? 'line-through' : '']
    .filter((x) => x !== '').join(' ');
  // 첨자는 글자도 작아진다. 안 줄이면 줄 높이가 튄다
  const 크기 = m.첨자 === undefined ? m.크기 : m.크기 * 0.7;
  return 스타일({
    'font-family': m.글꼴 === undefined ? undefined : `${글꼴값(m.글꼴)},serif`,
    'font-size': `${크기}pt`,
    'font-weight': m.굵게 ? 'bold' : undefined,
    'font-style': m.기울임 ? 'italic' : undefined,
    'text-decoration': 꾸밈 === '' ? undefined : 꾸밈,
    color: 색값(m.글자색),
    'background-color': 색값(m.음영색),
    'vertical-align': m.첨자 === undefined ? undefined : (m.첨자 === 'sup' ? 'super' : 'sub'),
  });
}

// ── 표 ──────────────────────────────────────────────────────────────────────

/**
 * 표 하나.
 *
 * `table-layout:fixed` + `<colgroup>` 을 쓴다. 안 그러면 브라우저가 글 길이를 보고
 * **열 폭을 제가 정한다** — 한글은 폭을 이미 정해 놨는데 다른 표가 되어 버린다.
 */
function 표엮기(el: ElementNode, c: 엮는이): string {
  c.표수++;
  const t = new 표(el);
  const 폭들 = t.열폭;
  const 전체폭 = 폭들.reduce<number>((a, b) => a + (b ?? 0), 0);

  const 열 = 폭들
    .map((w) => `<col${스타일({ width: w === undefined ? undefined : mm(w) })}>`)
    .join('');

  const 줄들 = childrenNamed(el, 'hp:tr')
    .map((tr) => `<tr>${childrenNamed(tr, 'hp:tc').map((tc) => 칸엮기(tc, c)).join('')}</tr>`)
    .join('');

  return `<table${스타일({ width: 전체폭 > 0 ? mm(전체폭) : undefined })}>`
    + `${표제목(el, c)}<colgroup>${열}</colgroup><tbody>${줄들}</tbody></table>`;
}

/**
 * 표 제목(`hp:caption`).
 *
 * **빼먹으면 글이 사라진다.** 「지난 10년간 소규모학교 수」 같은 그림·표 설명이
 * 여기 든다. 표 안이 아니라 표에 **딸린** 자리라, 칸만 훑으면 안 보인다.
 *
 * `@side` 로 위아래를 정한다. HTML `<caption>` 은 `caption-side` 로 옮긴다.
 */
function 표제목(el: ElementNode, c: 엮는이): string {
  const cap = firstChildNamed(el, 'hp:caption');
  if (cap === undefined) return '';
  const 속 = 글통엮기(firstChildNamed(cap, 'hp:subList'), c);
  if (속 === '') return '';
  const 쪽 = getAttr(cap, 'side') === 'TOP' ? 'top' : 'bottom';
  return `<caption${스타일({ 'caption-side': 쪽, 'text-align': 'inherit' })}>${속}</caption>`;
}

function 칸엮기(tc: ElementNode, c: 엮는이): string {
  const 걸침 = firstChildNamed(tc, 'hp:cellSpan');
  const rowSpan = Number(걸침 === undefined ? 1 : getAttr(걸침, 'rowSpan')) || 1;
  const colSpan = Number(걸침 === undefined ? 1 : getAttr(걸침, 'colSpan')) || 1;

  const 테 = c.서식.테두리모양(getAttr(tc, 'borderFillIDRef'));
  const 여백 = firstChildNamed(tc, 'hp:cellMargin');
  const 안 = (이름: string): string | undefined => {
    const v = readHwp(여백 === undefined ? undefined : getAttr(여백, 이름));
    return v === undefined ? undefined : mm(v);
  };
  const 세로 = getAttr(tc, 'vertAlign');

  const 걸침속성 = `${rowSpan > 1 ? ` rowspan="${rowSpan}"` : ''}`
    + `${colSpan > 1 ? ` colspan="${colSpan}"` : ''}`;

  return `<td${걸침속성}${스타일({
    'border-left': 선값(테?.왼),
    'border-right': 선값(테?.오른),
    'border-top': 선값(테?.위),
    'border-bottom': 선값(테?.아래),
    // **`background` 다.** 색만 오는 게 아니라 그러데이션도 온다
    background: 테?.바탕,
    'vertical-align': 세로 === undefined ? undefined : 세로정렬표[세로],
    'padding-left': 안('left'),
    'padding-right': 안('right'),
    'padding-top': 안('top'),
    'padding-bottom': 안('bottom'),
  })}>${글통엮기(firstChildNamed(tc, 'hp:subList'), c)}</td>`;
}

/** 글이 든 곳(`hp:subList`)의 문단들 */
function 글통엮기(통: ElementNode | undefined, c: 엮는이): string {
  if (통 === undefined) return '';
  return childrenNamed(통, 'hp:p').map((p) => 문단엮기(p, c)).join('');
}

// ── 묶은 것과 도형 ──────────────────────────────────────────────────────────

/**
 * **뜬 개체는 문단 들여쓰기를 따라가면 안 된다.**
 *
 * `textWrap="TREAT_AS_CHAR"`(글자처럼 취급) 인 것만 글 흐름을 탄다.
 * 나머지는 한글이 `hp:pos` 로 제 자리에 놓는 것이라, 문단 들여쓰기와 상관이 없다.
 *
 * 그냥 줄 안에 넣었더니 **제목 띠가 쪽 왼쪽 밖으로 25mm 밀려 나가** 잘렸다 —
 * 그 문단에 `내어쓰기(-25.26mm)` 가 걸려 있었기 때문이다.
 * 「예산 집행 계획」이 「행 계획」으로 보인 것이 이것이었다.
 *
 * 자리를 그대로 잡아 주지는 못한다(그건 `hp:pos` 를 다 풀어야 한다).
 * 다만 **들여쓰기에 끌려가지는 않게** 제 줄에 놓는다.
 */
function 떠있으면감싸기(el: ElementNode, 속: string): string {
  if (속 === '') return '';
  if (getAttr(el, 'textWrap') === 'TREAT_AS_CHAR') return 속;
  return `<div class="뜬것">${속}</div>`;
}

/** 그리기 개체 하나의 자리와 크기 (HWPUNIT). `hp:curSz` 는 **지금 보이는** 크기다 */
interface 개체자리 { x: number; y: number; w: number; h: number }

/**
 * **음수 자리가 부호 없는 32비트로 적혀 있다.**
 *
 * `hp:offset/@y` 에 `4294955572` 가 들어 있었다. 2³² − 11724 다 — 즉 **−11724**.
 * 그대로 읽었더니 `top: 15377783mm`(15km) 짜리 자리가 생겨,
 * 브라우저가 A4 로 나누느라 **29,154쪽짜리 PDF** 를 뱉었다.
 *
 * 크기(`width`·`height`)에는 안 쓴다 — 음수 크기는 뜻이 없어서,
 * 큰 값이 진짜 큰 것일 수 있다. **자리에만** 쓴다.
 */
function 부호맞추기(v: number): number {
  return v >= 0x8000_0000 ? v - 0x1_0000_0000 : v;
}

function 자리재기(el: ElementNode): 개체자리 {
  const off = firstChildNamed(el, 'hp:offset');
  const sz = firstChildNamed(el, 'hp:curSz') ?? firstChildNamed(el, 'hp:orgSz');
  const 읽 = (e: ElementNode | undefined, 이름: string): number =>
    readHwp(e === undefined ? undefined : getAttr(e, 이름)) ?? 0;
  return {
    x: 부호맞추기(읽(off, 'x')),
    y: 부호맞추기(읽(off, 'y')),
    w: 읽(sz, 'width'),
    h: 읽(sz, 'height'),
  };
}

const 그릴것들 = new Set([
  'hp:pic', 'hp:container', 'hp:rect', 'hp:ellipse', 'hp:polygon', 'hp:arc', 'hp:curve',
]);

/**
 * 묶은 개체(`hp:container`).
 *
 * **건너뛰면 글이 사라진다.** 학교·관공서 문서의 「제목 띠」가 이 꼴이다 —
 * 배경 그림(`hp:pic`) 위에 제목 글상자(`hp:rect`)를 얹어 묶어 놓는다.
 * 처음엔 통째로 지나쳤더니 계획서에서 **「추진 개요」 같은 절 제목이 통째로**
 * 빠졌다. 한글 PDF 와 글을 대 보고서야 알았다.
 *
 * ## 배율을 짐작하지 않고 한글이 적어 둔 것을 읽는다
 *
 * 처음에는 「자식 전체를 감싸는 상자를 묶음 크기에 맞추면 배율이 나온다」 고 셈해
 * **묶음을 통째로 줄였다.** 그랬더니 띠 제목 글자가 작아졌다.
 * 한글 PDF 에서 그 글자를 재 보니 **15pt 그대로**였다 — 안 줄인 것이다.
 *
 * 값을 늘어놓고 보면 배율이 **개체마다 다르다.**
 *
 *     묶음    orgSz 28483 → curSz 21939      = 0.7702   ← 자리를 옮기는 배율
 *     그림    curSz 37203 × 0.58971 = 21939            ← 띠 크기에 꽉 맞춘다
 *     글상자  curSz 17503 × 1.026403 = 17966           ← 거의 그대로 둔다
 *
 * 그 `0.58971` · `1.026403` 은 한글이 개체마다 **마지막 `hc:scaMatrix`** 에
 * 적어 둔 값이다. 셈해서 맞히려 들지 말고 적힌 것을 읽는다.
 */
function 묶음엮기(el: ElementNode, c: 엮는이): string {
  const 것들 = el.children.filter(
    (x): x is ElementNode => x.kind === 'element' && 그릴것들.has(x.name),
  );
  if (것들.length === 0) return '';

  const 통 = 자리재기(el);
  const 본 = 본디크기(el);
  // 자리를 옮기는 배율은 묶음이 얼마나 줄었나 — curSz / orgSz
  const gx = 본.w > 0 && 통.w > 0 ? 통.w / 본.w : 1;
  const gy = 본.h > 0 && 통.h > 0 ? 통.h / 본.h : 1;

  const 속 = 것들.map((x) => {
    const a = 자리재기(x);
    const s = 제배율(x);
    return `<span${스타일({
      position: 'absolute',
      left: mm(a.x * gx),
      top: mm(a.y * gy),
      width: mm(a.w * s.x),
      height: mm(a.h * s.y),
    })}>${묶음속엮기(x, c)}</span>`;
  }).join('');

  return `<span class="묶음"${스타일({
    position: 'relative',
    display: 'inline-block',
    width: mm(통.w > 0 ? 통.w : 본.w),
    height: mm(통.h > 0 ? 통.h : 본.h),
  })}>${속}</span>`;
}

/** 줄이기 전 크기 (`hp:orgSz`) */
function 본디크기(el: ElementNode): { w: number; h: number } {
  const sz = firstChildNamed(el, 'hp:orgSz');
  const 읽 = (이름: string): number =>
    readHwp(sz === undefined ? undefined : getAttr(sz, 이름)) ?? 0;
  return { w: 읽('width'), h: 읽('height') };
}

/**
 * 이 개체가 저 혼자 얼마나 더 줄거나 늘어나나.
 *
 * `hp:renderingInfo` 에는 변환이 여럿 쌓여 있고 **맨 뒤의 `hc:scaMatrix`** 가
 * 그 개체에만 걸리는 배율이다. 앞의 것은 묶음 전체에 걸리는 것이라
 * 자리를 옮길 때 이미 썼다. 없으면 1 — 안 줄인 것이다.
 */
function 제배율(el: ElementNode): { x: number; y: number } {
  const ri = firstChildNamed(el, 'hp:renderingInfo');
  if (ri === undefined) return { x: 1, y: 1 };
  const 들 = childrenNamed(ri, 'hc:scaMatrix');
  const 끝 = 들[들.length - 1];
  if (끝 === undefined || 들.length < 2) return { x: 1, y: 1 };
  const 읽 = (이름: string): number => {
    const v = Number(getAttr(끝, 이름));
    return Number.isFinite(v) && v !== 0 ? v : 1;
  };
  return { x: 읽('e1'), y: 읽('e5') };
}

/** 묶음 안의 것 하나. 제 상자를 **가득 채운다** — 자리는 바깥에서 이미 잡았다 */
function 묶음속엮기(el: ElementNode, c: 엮는이): string {
  switch (el.name) {
    case 'hp:pic': return 그림엮기(el, c, true);
    case 'hp:container': return 묶음엮기(el, c);
    default: return 도형엮기(el, c, true);
  }
}

/**
 * 도형 하나 — 글상자로 쓰인 것이 대부분이다.
 *
 * 모양(둥근 모서리·화살표)은 안 그린다. **글은 반드시 낸다** —
 * 잃어서 안 되는 것은 글이다. 채우기 색과 테두리만 옮긴다.
 */
function 도형엮기(el: ElementNode, c: 엮는이, 채우기: boolean): string {
  const 속 = 글통엮기(도형속글통(el), c);
  const 자리 = 자리재기(el);
  // **넘쳐도 자른다고 하지 않는다.** `overflow:hidden` 을 걸었더니 상자보다 긴 글이
  // 소리 없이 잘렸다. 넘쳐 보이는 편이 없어지는 것보다 낫다.
  const 꼴 = 채우기
    ? { width: '100%', height: '100%' }
    : { display: 'inline-block', width: 자리.w > 0 ? mm(자리.w) : undefined };
  if (속 === '') {
    // 글이 없는 도형은 **자리만** 잡는다. 없애면 아래가 올라온다
    c.못옮긴것.add('도형');
    return `<span class="도형"${스타일(꼴)}></span>`;
  }
  return `<span class="글상자"${스타일(꼴)}>${속}</span>`;
}

/** 도형 안의 글은 `hp:drawText > hp:subList` 에 있다 */
function 도형속글통(el: ElementNode): ElementNode | undefined {
  const dt = firstChildNamed(el, 'hp:drawText');
  return dt === undefined
    ? firstChildNamed(el, 'hp:subList')
    : firstChildNamed(dt, 'hp:subList');
}

// ── 그림 ────────────────────────────────────────────────────────────────────

/**
 * 그림 하나.
 *
 * 크기는 `hp:curSz`(지금 보이는 크기)를 쓴다. `hp:orgSz` 는 **원본 크기**라
 * 그걸 쓰면 문서에서 줄여 놓은 그림이 도로 커진다.
 */
function 그림엮기(el: ElementNode, c: 엮는이, 채우기: boolean): string {
  c.그림수++;
  const 자리 = 자리재기(el);
  const img = firstChildNamed(el, 'hc:img');
  const 참조 = img === undefined ? undefined : getAttr(img, 'binaryItemIDRef');
  const 주소 = 참조 === undefined ? undefined : c.그림장.get(참조);

  const 꼴 = 채우기
    ? 스타일({ width: '100%', height: '100%' })
    : 스타일({
      width: 자리.w > 0 ? mm(자리.w) : undefined,
      height: 자리.h > 0 ? mm(자리.h) : undefined,
    });
  if (주소 === undefined) {
    // 알맹이를 못 찾았다. **자리는 잡아 둔다** — 없애면 아래가 올라와 배치가 달라진다
    c.못옮긴것.add('그림 알맹이를 못 찾은 것이 있다');
    return `<span class="빈그림"${꼴}></span>`;
  }
  return `<img src="${주소}" alt=""${꼴}>`;
}

/**
 * 그림 알맹이를 모은다 — `binaryItemIDRef` → `data:` URI.
 *
 * 매니페스트(`Contents/content.hpf`)가 `id="image1"` 을 `BinData/image1.bmp` 로
 * 이어 준다. **정규식으로 캐지 않는다** — 이 저장소에는 XML 을 정규식으로 만지는
 * 자리가 0곳이다.
 */
function 그림모으기(d: 문서): Map<string, string> {
  const 장 = new Map<string, string>();
  const 컨 = d.컨테이너;
  const 매니길 = 컨.names().find((n) => n.endsWith('.hpf'));
  if (매니길 === undefined) return 장;

  let 뿌리: ElementNode;
  try {
    뿌리 = parseXml(컨.readText(매니길)).root;
  } catch {
    return 장;
  }

  for (const item of findAll(뿌리, 'opf:item')) {
    const id = getAttr(item, 'id');
    const href = getAttr(item, 'href');
    if (id === undefined || href === undefined) continue;
    if (!href.startsWith('BinData/') || !컨.has(href)) continue;
    try {
      장.set(id, `data:${마임(href)};base64,${컨.read(href).toString('base64')}`);
    } catch { /* 못 읽으면 자리만 잡는다 */ }
  }
  return 장;
}

function 마임(길: string): string {
  switch (길.slice(길.lastIndexOf('.') + 1).toLowerCase()) {
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'bmp': return 'image/bmp';
    case 'svg': return 'image/svg+xml';
    case 'webp': return 'image/webp';
    case 'tif': case 'tiff': return 'image/tiff';
    default: return 'image/jpeg';
  }
}

function 못옮긴이름(태그: string): string {
  switch (태그) {
    case 'hp:equation': return '수식';
    case 'hp:rect': case 'hp:ellipse': case 'hp:line': case 'hp:polygon':
    case 'hp:arc': case 'hp:curve': case 'hp:connectLine':
      return '도형';
    case 'hp:container': return '묶은 그림·도형';
    case 'hp:ole': return 'OLE 개체';
    case 'hp:chart': return '차트';
    case 'hp:footnote': return '각주';
    case 'hp:endnote': return '미주';
    case 'hp:textart': return '글맵시';
    default: return 태그;
  }
}

// ── 쪽 ──────────────────────────────────────────────────────────────────────

/**
 * 구역 하나 = `.쪽` 하나.
 *
 * 여기 쓰는 `.쪽` 은 **종이 한 장이 아니라 쪽 설정이 같은 덩어리**다.
 * 한 구역이 열 장이 되기도 한다. 진짜 쪽 나눔은 브라우저가 한다.
 */
function 구역엮기(s: 구역, c: 엮는이, 첫째: boolean): string {
  const 크기 = s.용지크기;
  const 여백 = s.쪽여백 ?? {};
  const 안쪽 = 크기 === undefined
    ? undefined
    : 크기.너비 - (여백['left'] ?? 0) - (여백['right'] ?? 0);

  const 속 = childrenNamed(s.root, 'hp:p').map((p) => 문단엮기(p, c)).join('');
  return `<section class="쪽"${스타일({
    width: 안쪽 === undefined ? undefined : mm(안쪽),
    'padding-left': mm(여백['left'] ?? 0),
    'padding-right': mm(여백['right'] ?? 0),
    'padding-top': mm(여백['top'] ?? 0),
    'padding-bottom': mm(여백['bottom'] ?? 0),
    'page-break-before': 첫째 ? undefined : 'always',
  })}>${속}</section>`;
}

/**
 * 첫 구역의 용지 크기로 `@page` 를 잡는다.
 *
 * **`hp:pagePr/@landscape` 를 보지 않는다.** 이름이 그렇게 생겼다고 가로쓰기가
 * 아니다 — 세어 보니 구역 36개 가운데 **35개가 `WIDELY`** 인데 치수는 전부
 * 세로꼴(59528 × 84188)이었다. 그 값을 믿고 뒤집었더니 A4 세로 문서가
 * **가로 PDF** 로 나왔다(842 × 595pt).
 *
 * `width`·`height` 에 이미 방향이 들어 있다. 그것만 쓴다.
 */
function 쪽규칙(d: 문서): string {
  const 크기 = d.구역들[0]?.용지크기;
  if (크기 === undefined) return '@page { margin: 0 }';
  return `@page { size: ${mm(크기.너비)} ${mm(크기.높이)}; margin: 0 }`;
}

/** 제목을 안 주면 첫 글줄을 쓴다 */
function 제목고르기(d: 문서, 준것: string | undefined): string {
  if (준것 !== undefined && 준것.trim() !== '') return 준것;
  for (const s of d.구역들) {
    for (const p of s.모든문단들) {
      const 글 = p.글.trim();
      if (글 !== '') return 글.slice(0, 60);
    }
  }
  return '문서';
}

export function 엮기(d: 문서, 설정: 엮기설정 = {}): 엮은것 {
  const 머리 = parseXml(d.머리.toXml()).root;
  const 그림장 = (설정.그림 ?? true) ? 그림모으기(d) : new Map<string, string>();
  const c = new 엮는이(new 서식장(머리), 그림장);

  const 쪽들 = d.구역들.map((s, i) => 구역엮기(s, c, i === 0)).join('\n');

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${감싸기(제목고르기(d, 설정.제목))}</title>
<style>
${쪽규칙(d)}
html { background: #f2f2f2 }
body { margin: 0; font-family: '함초롬바탕', serif; line-height: 1.6 }
.쪽 {
  box-sizing: content-box;
  margin: 0 auto 6mm;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,.2);
}
.p { margin: 0 }
/* 뜬 개체 — 문단 들여쓰기에 끌려가지 않는다 */
.뜬것 { text-indent: 0; margin: 0 }
table { border-collapse: collapse; table-layout: fixed; max-width: 100% }
td { vertical-align: top; word-break: break-all; overflow-wrap: anywhere }
img { display: inline-block; object-fit: contain }
.tab { display: inline-block; width: 8mm }
.빈그림 { display: inline-block; border: 0.2mm dashed #bbb }
/* 인쇄할 때는 종이가 제 여백을 갖는다 — 화면용 그림자와 바탕을 뺀다 */
@media print {
  html { background: #fff }
  .쪽 { margin: 0; box-shadow: none }
}
</style>
</head>
<body>
${쪽들}
</body>
</html>
`;

  return {
    html,
    구역수: d.구역들.length,
    문단수: c.문단수,
    표수: c.표수,
    그림수: c.그림수,
    글자수: c.글자수,
    못옮긴것: [...c.못옮긴것].sort(),
  };
}
