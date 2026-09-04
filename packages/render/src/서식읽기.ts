/**
 * 머리글(`header.xml`)에 적힌 서식을 **읽어서** 평범한 객체로 낸다.
 *
 * `doc` 의 `머리글` 은 서식을 **쓰는** 쪽이다 (`charPr확보` 처럼 없으면 만든다).
 * 여기는 그 반대 — 이미 있는 것을 그대로 읽어 HTML 로 옮길 재료를 만든다.
 *
 * ## 여기서 제일 조심할 것: `hp:switch`
 *
 * 문단 여백·줄간격은 `hh:paraPr` 의 **직속 자식이 아니다.**
 * `hp:switch` 안에 `hp:case` 와 `hp:default` 두 벌로 들어 있고 **값이 다르다.**
 *
 *     hp:case     intent = -1292      ← 한글이 읽는 쪽
 *     hp:default  intent = -2584      ← 한글 API 가 말하는 HWPUNIT (= case × 2)
 *
 * 그래서 **`hp:default` 를 읽는다.** 순진하게 `firstChildNamed(paraPr, 'hh:margin')`
 * 을 부르면 둘 다 못 찾아 여백이 통째로 0 이 되고, `hp:case` 를 읽으면 절반이 된다.
 * 자세한 것은 `자료/실측.md` 1항.
 *
 * 다만 `PERCENT` 줄간격은 길이가 아니라 **두 갈래가 같다.**
 * 그리고 161편 가운데 68개 `paraPr` 은 `hp:switch` 없이 `hh:margin` 을 바로 갖고
 * 있었다. 두 꼴을 다 다룬다.
 */

import {
  findAll, firstChildNamed, getAttr, childrenNamed,
  hwp, hwpToPt, readHwp,
  type ElementNode, type HwpUnit, type Pt,
} from '@hwpx/owpml';

/** 글자 모양 하나 (`hh:charPr`) */
export interface 글자모양 {
  크기: Pt;
  글꼴: string | undefined;
  굵게: boolean;
  기울임: boolean;
  /** 밑줄 종류. `NONE` 이면 없는 것이다 */
  밑줄: string | undefined;
  취소선: boolean;
  글자색: string | undefined;
  음영색: string | undefined;
  /** 위 첨자 / 아래 첨자 */
  첨자: 'sup' | 'sub' | undefined;
}

/** 문단 모양 하나 (`hh:paraPr`) */
export interface 문단모양 {
  정렬: string | undefined;
  왼여백: HwpUnit;
  오른여백: HwpUnit;
  /** 첫 줄. 양수면 들여쓰기, 음수면 내어쓰기 */
  들여쓰기: HwpUnit;
  앞여백: HwpUnit;
  뒤여백: HwpUnit;
  줄간격: { 종류: string; 값: number } | undefined;
  쪽나눔앞: boolean;
}

/** 테두리·배경 하나 (`hh:borderFill`) */
export interface 테두리모양 {
  왼: 선 | undefined;
  오른: 선 | undefined;
  위: 선 | undefined;
  아래: 선 | undefined;
  /** CSS `background` 로 그대로 쓸 값. 색이든 그러데이션이든 */
  바탕: string | undefined;
}

export interface 선 {
  /** `SOLID` · `NONE` 등. `NONE` 이면 긋지 않는다 */
  종류: string;
  /** 한글이 적는 꼴 그대로 (`"0.12 mm"`) */
  굵기: string;
  색: string;
}

/**
 * 머리글에서 서식을 찾아 주는 것.
 *
 * `hh:charPr` 같은 목록을 **한 번만 훑어** Map 에 담는다.
 * 문단마다 `findAll` 을 부르면 문서 하나에 수천 번이 된다.
 */
export class 서식장 {
  private readonly 글자들 = new Map<string, ElementNode>();
  private readonly 문단들 = new Map<string, ElementNode>();
  private readonly 테두리들 = new Map<string, ElementNode>();
  /** `lang` → (글꼴 id → 이름) */
  private readonly 글꼴들 = new Map<string, Map<string, string>>();

  constructor(머리: ElementNode) {
    const 담기 = (이름: string, 통: Map<string, ElementNode>): void => {
      for (const el of findAll(머리, 이름)) {
        const id = getAttr(el, 'id');
        if (id !== undefined) 통.set(id, el);
      }
    };
    담기('hh:charPr', this.글자들);
    담기('hh:paraPr', this.문단들);
    담기('hh:borderFill', this.테두리들);

    for (const ff of findAll(머리, 'hh:fontface')) {
      const lang = getAttr(ff, 'lang') ?? 'HANGUL';
      const 표 = this.글꼴들.get(lang) ?? new Map<string, string>();
      for (const f of childrenNamed(ff, 'hh:font')) {
        const id = getAttr(f, 'id');
        const 이름 = getAttr(f, 'face');
        if (id !== undefined && 이름 !== undefined) 표.set(id, 이름);
      }
      this.글꼴들.set(lang, 표);
    }
  }

  /** 글꼴 이름. 한글 글꼴을 먼저 보고, 없으면 라틴을 본다 */
  글꼴이름(id: string | undefined): string | undefined {
    if (id === undefined) return undefined;
    for (const lang of ['HANGUL', 'LATIN', 'OTHER']) {
      const 이름 = this.글꼴들.get(lang)?.get(id);
      if (이름 !== undefined) return 이름;
    }
    return undefined;
  }

  글자모양(id: string | undefined): 글자모양 | undefined {
    const el = id === undefined ? undefined : this.글자들.get(id);
    if (el === undefined) return undefined;
    const 밑 = firstChildNamed(el, 'hh:underline');
    const 취 = firstChildNamed(el, 'hh:strikeout');
    const fr = firstChildNamed(el, 'hh:fontRef');
    const 첨 = firstChildNamed(el, 'hh:supscript') ? 'sup'
      : firstChildNamed(el, 'hh:subscript') ? 'sub' : undefined;
    return {
      크기: hwpToPt(readHwp(getAttr(el, 'height')) ?? hwp(1000)),
      글꼴: this.글꼴이름(fr && (getAttr(fr, 'hangul') ?? getAttr(fr, 'latin'))),
      // **굵게·기울임은 있으면 켜진 것이다** — 속성이 없다.
      굵게: firstChildNamed(el, 'hh:bold') !== undefined,
      기울임: firstChildNamed(el, 'hh:italic') !== undefined,
      밑줄: 밑 && getAttr(밑, 'type'),
      취소선: 취소선인가(취),
      글자색: getAttr(el, 'textColor'),
      음영색: getAttr(el, 'shadeColor'),
      첨자: 첨,
    };
  }

  문단모양(id: string | undefined): 문단모양 | undefined {
    const el = id === undefined ? undefined : this.문단들.get(id);
    if (el === undefined) return undefined;
    const 정 = firstChildNamed(el, 'hh:align');
    const 끊 = firstChildNamed(el, 'hh:breakSetting');
    // **여기가 hp:switch 함정이다.** 위 주석과 자료/실측.md 1항을 보라.
    const 가지 = 값가지(el);
    const m = 가지 && firstChildNamed(가지, 'hh:margin');
    const 재기 = (이름: string): HwpUnit => {
      const c = m && firstChildNamed(m, 이름);
      return readHwp(c && getAttr(c, 'value')) ?? hwp(0);
    };
    const ls = 가지 && firstChildNamed(가지, 'hh:lineSpacing');
    const ls값 = ls && Number(getAttr(ls, 'value'));
    return {
      정렬: 정 && getAttr(정, 'horizontal'),
      왼여백: 재기('hc:left'),
      오른여백: 재기('hc:right'),
      들여쓰기: 재기('hc:intent'),
      앞여백: 재기('hc:prev'),
      뒤여백: 재기('hc:next'),
      줄간격: ls && Number.isFinite(ls값)
        ? { 종류: getAttr(ls, 'type') ?? 'PERCENT', 값: ls값 as number }
        : undefined,
      쪽나눔앞: (끊 && getAttr(끊, 'pageBreakBefore')) === '1',
    };
  }

  테두리모양(id: string | undefined): 테두리모양 | undefined {
    const el = id === undefined ? undefined : this.테두리들.get(id);
    if (el === undefined) return undefined;
    const 읽기 = (이름: string): 선 | undefined => {
      const b = firstChildNamed(el, 이름);
      if (b === undefined) return undefined;
      return {
        종류: getAttr(b, 'type') ?? 'NONE',
        굵기: getAttr(b, 'width') ?? '0.12 mm',
        색: getAttr(b, 'color') ?? '#000000',
      };
    };
    return {
      왼: 읽기('hh:leftBorder'),
      오른: 읽기('hh:rightBorder'),
      위: 읽기('hh:topBorder'),
      아래: 읽기('hh:bottomBorder'),
      바탕: 바탕읽기(el),
    };
  }
}

/**
 * 취소선이 정말 그어져 있나.
 *
 * **두 번 속았다.**
 *
 * 하나 — 취소선은 밑줄과 달리 `type` 이 아니라 **`shape`** 를 쓴다.
 * 그리고 안 그은 글자에도 요소가 **그대로 붙어 있다.** 「있으면 켜진 것」 으로
 * 읽었더니 계획서 한 장이 통째로 줄이 그어진 채 나왔다.
 *
 * 둘 — `shape="NONE"` 만 걸러도 모자랐다. 표본에서 세어 보니 —
 *
 *     NONE  1524      3D  833      SOLID  2
 *
 * **`3D` 가 833개**다. 교육부 업무계획은 charPr 125개 가운데 **124개가 `3D`** 였다.
 * 발표된 정부 계획서 전체에 취소선이 그어져 있을 리 없다 — `3D` 도 「안 그음」이다.
 *
 * 그어진 것보다 **안 그어진 것을 잘못 긋는 쪽이 훨씬 나쁘다.** 문서 한 장이
 * 못 쓰게 된다. 그래서 아는 값만 켠다.
 */
function 취소선인가(취: ElementNode | undefined): boolean {
  if (취 === undefined) return false;
  const 꼴 = getAttr(취, 'shape') ?? 'NONE';
  return 꼴 !== 'NONE' && 꼴 !== '3D';
}

/**
 * `hp:switch` 에서 **길이가 진짜인 갈래**를 고른다.
 *
 * `hp:default` 가 한글 API 가 말하는 HWPUNIT 이다 (`hp:case` 는 그 절반).
 * `hp:switch` 가 아예 없는 문서도 있어서, 그때는 요소 자체를 갈래로 본다.
 */
function 값가지(paraPr: ElementNode): ElementNode | undefined {
  const sw = firstChildNamed(paraPr, 'hp:switch');
  if (sw === undefined) {
    // switch 없이 hh:margin 을 바로 든 꼴 (161편 중 68개)
    return firstChildNamed(paraPr, 'hh:margin') !== undefined
      || firstChildNamed(paraPr, 'hh:lineSpacing') !== undefined
      ? paraPr : undefined;
  }
  return firstChildNamed(sw, 'hp:default') ?? firstChildNamed(sw, 'hp:case');
}

/**
 * 칸 바탕 — 색이든 그러데이션이든 CSS `background` 값으로.
 *
 * ## 처음에 **이름을 지어내서 하나도 못 읽었다**
 *
 * `hc:solidFill` 과 `hc:gradFill` 을 찾고 있었다. 그럴듯한 이름이지만
 * **표본 33편에 그 이름은 한 번도 안 나온다.** 실제로 쓰는 것은 —
 *
 *     hc:winBrush 387 · hc:imgBrush 17 · hc:gradation 11
 *
 * 그 바람에 **칸 959개가 배경을 잃은 채** HTML 로 나갔다. 표 머리 줄의
 * 띠 색이 통째로 빠지는데, 글은 다 있으니 글자 수로는 안 걸린다.
 *
 * 이름은 짐작하지 말고 **문서를 열어 세어 본다.**
 */
function 바탕읽기(borderFill: ElementNode): string | undefined {
  const 통 = firstChildNamed(borderFill, 'hc:fillBrush');
  if (통 === undefined) return undefined;

  const grad = firstChildNamed(통, 'hc:gradation');
  if (grad !== undefined) {
    const css = 그러데이션값(grad);
    if (css !== undefined) return css;
  }

  const win = firstChildNamed(통, 'hc:winBrush');
  if (win !== undefined) {
    // `faceColor="none"` 이 「색 채우기 없음」이다. 표본 winBrush 387개 가운데
    // 그냥 `none` 인 것이 대부분이라, 이걸 안 거르면 온 칸이 검게 칠해진다.
    const v = getAttr(win, 'faceColor');
    if (v !== undefined && v !== 'none' && /^#[0-9a-fA-F]{6}$/.test(v)) return v;
  }

  // `hc:imgBrush`(그림으로 채우기)는 아직 못 옮긴다. 색으로 흉내 내지 않는다 —
  // 엉뚱한 색을 칠하느니 비워 두는 편이 낫다.
  return undefined;
}

/**
 * 그러데이션(`hc:gradation`) → CSS.
 *
 * 규격이 대화상자와 하나씩 맞물린다.
 *
 * | 대화상자 | 속성 |
 * |---|---|
 * | 유형 | `@type` — `LINEAR` `RADIAL` `CONICAL` `SQUARE` |
 * | 기울임 | `@angle` (시작각) |
 * | 가로·세로 중심 | `@centerX` `@centerY` |
 * | 번짐 정도 | `@step` |
 * | 번짐 중심 | `@stepCenter` |
 * | 시작·끝 색 | `hc:color` 여럿 (`@colorNum` 개) |
 *
 * **각도는 재서 맞췄다.** 한글 `angle=90` 이 대화상자의 「세로」다.
 * CSS `linear-gradient` 는 180deg 가 위→아래(세로)라 **90을 더한다.**
 */
function 그러데이션값(grad: ElementNode): string | undefined {
  const 색들 = childrenNamed(grad, 'hc:color')
    .map((c) => getAttr(c, 'value'))
    .filter((v): v is string => v !== undefined && /^#[0-9a-fA-F]{6}$/.test(v));
  if (색들.length < 2) return 색들[0];

  const 멈춤 = 색들.join(', ');
  const 종류 = (getAttr(grad, 'type') ?? 'LINEAR').toUpperCase();
  const 수 = (이름: string, 기본: number): number => {
    const v = Number(getAttr(grad, 이름));
    return Number.isFinite(v) ? v : 기본;
  };
  const cx = 수('centerX', 0);
  const cy = 수('centerY', 0);

  switch (종류) {
    case 'RADIAL':
      return `radial-gradient(circle at ${cx}% ${cy}%, ${멈춤})`;
    case 'CONICAL':
      return `conic-gradient(from ${수('angle', 90)}deg at ${cx}% ${cy}%, ${멈춤})`;
    case 'SQUARE':
      // 사각형 번짐은 CSS 에 짝이 없다. 원형으로 근사한다
      return `radial-gradient(${멈춤})`;
    default:
      return `linear-gradient(${(수('angle', 90) + 90) % 360}deg, ${멈춤})`;
  }
}
