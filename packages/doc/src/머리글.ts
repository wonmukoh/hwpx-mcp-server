/**
 * `Contents/header.xml` — 글자모양·문단모양·테두리·글꼴이 사는 곳.
 *
 * ## 스타일은 **복제해서 고친다**
 *
 * `charPr` 하나를 새로 짜서 넣으면 한글이 안 읽거나 문서 모양이 통째로 바뀐다.
 * 빠진 자식이 있으면 한글이 그 뒤를 조용히 무시한다.
 *
 * 그래서: **쓰던 것을 복제 → 달라는 것만 덮어쓰기 → 같은 모양이 이미 있으면 그걸 쓰기.**
 *
 * ## 지문으로 중복을 없앤다
 *
 * 같은 서식을 100번 주면 charPr 이 100개 생겨 header 가 부푼다.
 * 그래서 만들기 전에 **지문**(id 를 뺀 XML 글자)으로 같은 것이 있나 본다.
 *
 * ## itemCnt 는 늘 실제 개수와 맞춘다
 *
 * `<hh:charProperties itemCnt="7">` 의 숫자가 실제 개수와 다르면
 * 한글이 목록을 **잘라 읽는다.** 넣을 때마다 같이 올린다.
 */

import {
  getAttr, setAttr, appendChild, createElement, removeNode,
  findFirst, childrenNamed, firstChildNamed,
  parseXml, serializeXml, serializeNode, 복제하기, 지문,
  ptToHwp, 굵기맞추기,
  type ElementNode, type XmlDocument, type HwpUnit, type Pt, type 테두리굵기값,
} from '@hwpx/owpml';
import { 됨, 안됨, type 결과 } from './결과.js';

/** `refList` 아래 목록들. **순서가 규격이다** — 함부로 바꾸면 한글이 못 읽는다 */
export const 목록순서 = [
  'hh:fontfaces',
  'hh:borderFills',
  'hh:charProperties',
  'hh:tabProperties',
  'hh:numberings',
  'hh:bullets',
  'hh:paraProperties',
  'hh:styles',
  'hh:memoProperties',
  'hh:trackChanges',
  'hh:trackChangeAuthors',
] as const;

/** 목록 이름 → 그 안에 든 낱개 이름 */
const 낱개이름: Record<string, string> = {
  'hh:fontfaces': 'hh:fontface',
  'hh:borderFills': 'hh:borderFill',
  'hh:charProperties': 'hh:charPr',
  'hh:tabProperties': 'hh:tabPr',
  'hh:numberings': 'hh:numbering',
  'hh:bullets': 'hh:bullet',
  'hh:paraProperties': 'hh:paraPr',
  'hh:styles': 'hh:style',
  'hh:memoProperties': 'hh:memoPr',
};

export const 언어들 = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'] as const;
export type 언어 = (typeof 언어들)[number];

export interface 글자모양패치 {
  /** 글자 크기 (pt) */
  크기?: Pt;
  /** `#1F4E9C` 같은 6자리 색 */
  색?: string;
  굵게?: boolean;
  기울임?: boolean;
  /** `NONE` `BOTTOM` `CENTER` `TOP` */
  밑줄?: string;
  /** 글꼴 이름. 7개 언어 전부에 건다 */
  글꼴?: string;
  /** 글자 배경(음영) 색. `none` 이면 없앤다 */
  배경색?: string;
  /**
   * 자간 — 글자 사이를 좁히거나 넓힌다. 백분율, 음수면 좁아진다.
   *
   * 실측: 교육부 업무계획 본문이 **-6** 을 쓴다. 좁혀서 한 줄에 더 담는 것이다.
   * 이걸 안 맞추면 같은 글도 줄이 다르게 끊긴다.
   */
  자간?: number;
  /** 장평 — 글자 너비 백분율. 100 이 보통 */
  장평?: number;
}

/**
 * 테두리와 배경.
 *
 * `면` 을 안 주면 네 면 다 건다. 굵기는 한글이 아는 값으로 맞춰 준다
 * (`'0.4'` 을 줘도 `'0.4 mm'` 로 고쳐 쓴다 — 공백을 빼면 한글이 못 읽는다).
 */
export interface 테두리패치 {
  면?: ('all' | 'left' | 'right' | 'top' | 'bottom')[];
  /** `SOLID` `NONE` `DASH` `DOT` `DOUBLE_SLIM` … */
  종류?: string;
  굵기?: 테두리굵기값 | string | number;
  색?: string;
  /** 배경색. `'none'` 이면 채움을 없앤다 */
  채움?: string;
}

export interface 줄간격 {
  종류: 'PERCENT' | 'FIXED' | 'BETWEEN_LINES' | 'AT_LEAST';
  값: number;
}

export interface 문단모양패치 {
  /** `LEFT` `CENTER` `RIGHT` `JUSTIFY` `DISTRIBUTE` */
  정렬?: string;
  왼쪽여백?: HwpUnit;
  오른쪽여백?: HwpUnit;
  /** 첫 줄 들여쓰기. 음수면 내어쓰기 */
  들여쓰기?: HwpUnit;
  위여백?: HwpUnit;
  아래여백?: HwpUnit;
  줄간격?: 줄간격;
}

/** 여백 이름 → 태그 */
const 여백태그: Record<string, string> = {
  들여쓰기: 'hc:intent',
  왼쪽여백: 'hc:left',
  오른쪽여백: 'hc:right',
  위여백: 'hc:prev',
  아래여백: 'hc:next',
};

export class 머리글 {
  private readonly doc: XmlDocument;
  /** 지문 → id. 같은 모양을 두 번 만들지 않으려고 들고 있는다 */
  private readonly 지문장부 = new Map<string, Map<string, string>>();
  private 손댔나 = false;

  constructor(xml: string) {
    this.doc = parseXml(xml);
  }

  get dirty(): boolean {
    return this.손댔나;
  }

  /** 다시 XML 로. 안 고쳤으면 원본과 바이트가 같다 */
  toXml(): string {
    return serializeXml(this.doc);
  }

  /**
   * **구역이 몇 개인지 머리글에 적는다.**
   *
   * `<hh:head secCnt="2">` — 한글은 **이 숫자를 믿고 그만큼만 읽는다.**
   * 구역 파일을 더하고 manifest 에 적어도, 이 숫자가 1 이면
   * 둘째 구역을 **통째로 버린다.** 글까지 사라진다.
   *
   * 찾는 데 오래 걸렸다. manifest·spine·부품 차례·settings 를 다 대 봤는데
   * 전부 같았다. 기준 파일과 부품을 하나씩 바꿔 끼워 보고서야
   * `header.xml` 이 범인인 것을 알았다 (실측 14장).
   */
  구역수적기(몇개: number): void {
    const head = this.doc.root.name === 'hh:head'
      ? this.doc.root
      : findFirst(this.doc.root, 'hh:head');
    if (!head) throw new Error('header.xml 에 hh:head 가 없다 — HWPX 가 아니다');
    if (getAttr(head, 'secCnt') === String(몇개)) return;
    setAttr(head, 'secCnt', String(몇개));
    this.손댔나 = true;
  }

  /** 머리글이 말하는 구역 수 */
  get 구역수(): number {
    const head = this.doc.root.name === 'hh:head'
      ? this.doc.root
      : findFirst(this.doc.root, 'hh:head');
    return head ? Number(getAttr(head, 'secCnt') ?? 1) : 1;
  }

  private get refList(): ElementNode {
    const r = findFirst(this.doc.root, 'hh:refList');
    if (!r) throw new Error('header.xml 에 hh:refList 가 없다 — HWPX 가 아니다');
    return r;
  }

  /** 목록 요소. 없으면 **규격 순서에 맞는 자리**에 만든다 */
  목록(이름: string): ElementNode {
    const 있는것 = firstChildNamed(this.refList, 이름);
    if (있는것) return 있는것;

    const 새것 = createElement(이름, { itemCnt: '0' });
    // 순서를 지켜 끼워 넣는다. 순서가 틀리면 한글이 못 읽는다.
    const 내자리 = 목록순서.indexOf(이름 as (typeof 목록순서)[number]);
    const 아이들 = this.refList.children.filter((c): c is ElementNode => c.kind === 'element');
    const 뒤에올것 = 아이들.find((c) => {
      const i = 목록순서.indexOf(c.name as (typeof 목록순서)[number]);
      return i !== -1 && 내자리 !== -1 && i > 내자리;
    });
    if (뒤에올것) {
      const idx = this.refList.children.indexOf(뒤에올것);
      this.refList.children.splice(idx, 0, 새것);
      새것.parent = this.refList;
      let p: ElementNode | undefined = this.refList;
      while (p) { p.dirty = true; p = p.parent; }
    } else {
      appendChild(this.refList, 새것);
    }
    this.손댔나 = true;
    return 새것;
  }

  /** 목록에 든 낱개들 */
  낱개들(목록이름: string): ElementNode[] {
    const 낱 = 낱개이름[목록이름];
    if (!낱) throw new Error(`${목록이름} 의 낱개 이름을 모른다`);
    return childrenNamed(this.목록(목록이름), 낱);
  }

  /** id 로 낱개 찾기 */
  낱개(목록이름: string, id: string): ElementNode | undefined {
    return this.낱개들(목록이름).find((e) => getAttr(e, 'id') === id);
  }

  /**
   * 낱개를 넣고 **itemCnt 를 실제 개수로 맞춘다.**
   *
   * 새 id 는 지금 쓰는 것 가운데 가장 큰 것 + 1 이다.
   * (0부터 다시 세면 이미 쓰이는 번호와 부딪힌다)
   */
  넣기(목록이름: string, el: ElementNode): string {
    const 목 = this.목록(목록이름);
    const 이미 = this.낱개들(목록이름);
    const 최대 = 이미.reduce((m, e) => Math.max(m, Number(getAttr(e, 'id') ?? -1)), -1);
    const 새id = String(최대 + 1);
    setAttr(el, 'id', 새id);
    appendChild(목, el);
    setAttr(목, 'itemCnt', String(이미.length + 1));
    this.손댔나 = true;
    return 새id;
  }

  /**
   * 그 목록에서 **가장 작은 id.** 서식을 갈라 낼 바탕으로 쓴다.
   *
   * `0` 을 못 박으면 안 된다 — 빈 문서 템플릿의 borderFill 은 **1부터** 시작한다.
   * 실제로 그걸 못 박았다가 띠 블록이 "id=0 이 없다" 로 멈췄다.
   */
  첫id(목록이름: string): string | undefined {
    const 있는것 = this.낱개들(목록이름)
      .map((e) => getAttr(e, 'id'))
      .filter((x): x is string => x !== undefined)
      .sort((a, b) => Number(a) - Number(b));
    return 있는것[0];
  }

  /** itemCnt 가 실제 개수와 맞나 (검사용) */
  itemCnt검사(): string[] {
    const 탈: string[] = [];
    for (const 이름 of 목록순서) {
      const 목 = firstChildNamed(this.refList, 이름);
      if (!목) continue;
      const 낱 = 낱개이름[이름];
      if (!낱) continue;
      const 적힌것 = Number(getAttr(목, 'itemCnt') ?? '-1');
      const 실제 = childrenNamed(목, 낱).length;
      if (적힌것 !== 실제) 탈.push(`${이름} 의 itemCnt 가 ${적힌것} 인데 실제로는 ${실제}개다`);
    }
    return 탈;
  }

  // ── 지문 ────────────────────────────────────────────────────────────────

  private 지문장부만들기(목록이름: string): Map<string, string> {
    const 있는것 = this.지문장부.get(목록이름);
    if (있는것) return 있는것;
    const 장부 = new Map<string, string>();
    for (const e of this.낱개들(목록이름)) {
      const 조각 = serializeNode(e, this.doc.source);
      장부.set(지문(e, this.doc.source) || 조각, getAttr(e, 'id') ?? '');
    }
    this.지문장부.set(목록이름, 장부);
    return 장부;
  }

  /**
   * 복제 → 고치기 → 지문 대조 → 다시 쓰거나 새로 넣기.
   *
   * `고치기` 가 `false` 를 돌려주면 **바꿀 것이 없었다는 뜻**이라
   * 바탕 id 를 그대로 돌려준다 (쓸데없이 새로 만들지 않는다).
   */
  확보(
    목록이름: string,
    바탕id: string,
    고치기: (복제본: ElementNode) => boolean,
  ): 결과<{ id: string; 새로만듦: boolean }> {
    const 바탕 = this.낱개(목록이름, 바탕id);
    if (!바탕) {
      const 있는것 = this.낱개들(목록이름).map((e) => getAttr(e, 'id')).join(', ');
      return 안됨(
        `${목록이름} 에 id=${바탕id} 이 없다`,
        `이 문서에 있는 것: ${있는것 || '(없음)'}`,
      );
    }

    const 복제본 = 복제하기(바탕, this.doc.source);
    if (!고치기(복제본)) return 됨({ id: 바탕id, 새로만듦: false });

    // 복제본은 제 나무를 갖고 있다. 제 글을 만들어 거기서 지문을 낸다.
    const 복제본글 = 복제본조각(복제본);
    const 장부 = this.지문장부만들기(목록이름);
    const 새지문 = 지문(복제본, 복제본글);
    const 이미있는것 = 장부.get(새지문);
    if (이미있는것 !== undefined) return 됨({ id: 이미있는것, 새로만듦: false });

    const 새id = this.넣기(목록이름, 복제본);
    // 넣고 나서 id 가 붙었으니 지문을 다시 낸다 (id 는 지문에서 빠진다)
    장부.set(지문(복제본, 복제본조각(복제본)), 새id);
    return 됨({ id: 새id, 새로만듦: true });
  }

  // ── 글자 모양 ───────────────────────────────────────────────────────────

  charPr확보(바탕id: string, 패치: 글자모양패치): 결과<{ id: string; 새로만듦: boolean }> {
    if (Object.keys(패치).length === 0) return 됨({ id: 바탕id, 새로만듦: false });

    let 글꼴id: string | undefined;
    if (패치.글꼴 !== undefined) {
      const r = this.글꼴확보(패치.글꼴);
      if (!r.ok) return r;
      글꼴id = r.value.id;
    }

    return this.확보('hh:charProperties', 바탕id, (el) => {
      let 바꿨나 = false;
      const 속성 = (이름: string, 값: string) => {
        if (getAttr(el, 이름) === 값) return;
        setAttr(el, 이름, 값);
        바꿨나 = true;
      };
      const 자식있고없고 = (태그: string, 있어야하나: boolean) => {
        const 있음 = firstChildNamed(el, 태그);
        if (있어야하나 && !있음) { appendChild(el, createElement(태그, {})); 바꿨나 = true; }
        else if (!있어야하나 && 있음) { removeNode(있음); 바꿨나 = true; }
      };

      if (패치.크기 !== undefined) 속성('height', String(ptToHwp(패치.크기)));
      // 자간·장평은 언어 일곱 쪽에 다 걸어야 한다. 한 쪽만 걸면 그 언어 글자만 바뀐다.
      const 언어일곱 = (태그: string, 값: number) => {
        const e = firstChildNamed(el, 태그);
        if (!e) return;
        for (const 언어 of 언어들) {
          const 키 = 언어.toLowerCase();
          if (getAttr(e, 키) !== String(값)) { setAttr(e, 키, String(값)); 바꿨나 = true; }
        }
      };
      if (패치.자간 !== undefined) 언어일곱('hh:spacing', 패치.자간);
      if (패치.장평 !== undefined) 언어일곱('hh:ratio', 패치.장평);
      if (패치.색 !== undefined) 속성('textColor', 색맞추기(패치.색));
      if (패치.배경색 !== undefined) {
        속성('shadeColor', 패치.배경색 === 'none' ? 'none' : 색맞추기(패치.배경색));
      }
      // 굵게·기울임은 속성이 아니라 **자식 요소의 있고 없고**다 (자료/실측.md 5항)
      if (패치.굵게 !== undefined) 자식있고없고('hh:bold', 패치.굵게);
      if (패치.기울임 !== undefined) 자식있고없고('hh:italic', 패치.기울임);
      if (패치.밑줄 !== undefined) {
        const u = firstChildNamed(el, 'hh:underline');
        if (u) {
          if (getAttr(u, 'type') !== 패치.밑줄) { setAttr(u, 'type', 패치.밑줄); 바꿨나 = true; }
        } else {
          appendChild(el, createElement('hh:underline', { type: 패치.밑줄, shape: 'SOLID', color: '#000000' }));
          바꿨나 = true;
        }
      }
      if (글꼴id !== undefined) {
        const ref = firstChildNamed(el, 'hh:fontRef');
        if (ref) {
          for (const 언어 of 언어들) {
            const 키 = 언어.toLowerCase();
            if (getAttr(ref, 키) !== 글꼴id) { setAttr(ref, 키, 글꼴id); 바꿨나 = true; }
          }
        }
      }
      return 바꿨나;
    });
  }

  // ── 문단 모양 ───────────────────────────────────────────────────────────

  paraPr확보(바탕id: string, 패치: 문단모양패치): 결과<{ id: string; 새로만듦: boolean }> {
    if (Object.keys(패치).length === 0) return 됨({ id: 바탕id, 새로만듦: false });

    return this.확보('hh:paraProperties', 바탕id, (el) => {
      let 바꿨나 = false;

      if (패치.정렬 !== undefined) {
        const a = firstChildNamed(el, 'hh:align');
        if (a && getAttr(a, 'horizontal') !== 패치.정렬) {
          setAttr(a, 'horizontal', 패치.정렬);
          바꿨나 = true;
        }
      }

      // 여백·줄간격은 hp:switch 의 **두 갈래에 다 써야 한다.**
      // 한글은 hp:case 를 읽고 hp:default 를 case×2 로 다시 쓴다 (자료/실측.md 1항).
      const 갈래들 = 여백갈래(el);
      for (const 이름 of Object.keys(여백태그)) {
        const v = (패치 as Record<string, unknown>)[이름] as HwpUnit | undefined;
        if (v === undefined) continue;
        const 태그 = 여백태그[이름]!;
        for (const { 가지, 반값 } of 갈래들) {
          const m = firstChildNamed(가지, 'hh:margin');
          if (!m) continue;
          let 칸 = firstChildNamed(m, 태그);
          if (!칸) {
            칸 = createElement(태그, { value: '0', unit: 'HWPUNIT' });
            appendChild(m, 칸);
            바꿨나 = true;
          }
          const 넣을값 = String(반값 ? 반내림(v) : v);
          if (getAttr(칸, 'value') !== 넣을값) { setAttr(칸, 'value', 넣을값); 바꿨나 = true; }
        }
      }

      if (패치.줄간격 !== undefined) {
        const { 종류, 값 } = 패치.줄간격;
        // 백분율은 길이가 아니다 — 두 갈래가 같은 값이다 (실측)
        const 길이인가 = 종류 !== 'PERCENT';
        for (const { 가지, 반값 } of 갈래들) {
          let ls = firstChildNamed(가지, 'hh:lineSpacing');
          if (!ls) {
            ls = createElement('hh:lineSpacing', { type: 종류, value: '0', unit: 'HWPUNIT' });
            appendChild(가지, ls);
            바꿨나 = true;
          }
          const 넣을값 = String(길이인가 && 반값 ? 반내림(값) : 값);
          if (getAttr(ls, 'type') !== 종류) { setAttr(ls, 'type', 종류); 바꿨나 = true; }
          if (getAttr(ls, 'value') !== 넣을값) { setAttr(ls, 'value', 넣을값); 바꿨나 = true; }
        }
      }

      return 바꿨나;
    });
  }

  // ── 테두리·채움 ─────────────────────────────────────────────────────────

  /**
   * 테두리와 배경색.
   *
   * 실측(borderFill 4632개) — 자식 순서가 규격이다:
   *
   * ```
   * hh:slash  hh:backSlash  hh:leftBorder  hh:rightBorder  hh:topBorder  hh:bottomBorder
   * [hh:diagonal]  [hc:fillBrush]
   * ```
   *
   * `hc:fillBrush` 는 **맨 뒤**다 (1886개가 그 자리). 색을 채운 것이 1387개.
   *
   * 굵기 값에는 **공백이 들어간다** (`"0.12 mm"`). 빼면 한글이 못 읽는다.
   */
  borderFill확보(바탕id: string, 패치: 테두리패치): 결과<{ id: string; 새로만듦: boolean }> {
    if (Object.keys(패치).length === 0) return 됨({ id: 바탕id, 새로만듦: false });

    return this.확보('hh:borderFills', 바탕id, (el) => {
      let 바꿨나 = false;

      const 면들 = 패치.면 ?? ['all'];
      const 걸면 = new Set(
        면들.includes('all') ? ['left', 'right', 'top', 'bottom'] : 면들,
      );
      for (const 면 of ['left', 'right', 'top', 'bottom'] as const) {
        if (!걸면.has(면)) continue;
        const 태그 = `hh:${면}Border`;
        let b = firstChildNamed(el, 태그);
        if (!b) {
          b = createElement(태그, { type: 'NONE', width: '0.1 mm', color: '#000000' });
          appendChild(el, b);
          바꿨나 = true;
        }
        if (패치.종류 !== undefined && getAttr(b, 'type') !== 패치.종류) {
          setAttr(b, 'type', 패치.종류); 바꿨나 = true;
        }
        if (패치.굵기 !== undefined) {
          const 값 = 굵기맞추기(패치.굵기);
          if (getAttr(b, 'width') !== 값) { setAttr(b, 'width', 값); 바꿨나 = true; }
        }
        if (패치.색 !== undefined) {
          const 값 = 색맞추기(패치.색);
          if (getAttr(b, 'color') !== 값) { setAttr(b, 'color', 값); 바꿨나 = true; }
        }
      }

      if (패치.채움 !== undefined) {
        let 붓통 = firstChildNamed(el, 'hc:fillBrush');
        if (패치.채움 === 'none') {
          if (붓통) { removeNode(붓통); 바꿨나 = true; }
        } else {
          const 색 = 색맞추기(패치.채움);
          if (!붓통) {
            // 맨 뒤에 붙인다 — 실측에서 fillBrush 는 늘 마지막이다
            붓통 = createElement('hc:fillBrush', {}, [
              createElement('hc:winBrush', { faceColor: 색, hatchColor: '#999999', alpha: '0' }),
            ]);
            appendChild(el, 붓통);
            바꿨나 = true;
          } else {
            const 붓 = firstChildNamed(붓통, 'hc:winBrush');
            if (붓 && getAttr(붓, 'faceColor') !== 색) { setAttr(붓, 'faceColor', 색); 바꿨나 = true; }
          }
        }
      }

      return 바꿨나;
    });
  }

  // ── 글꼴 ────────────────────────────────────────────────────────────────

  /**
   * 글꼴을 **7개 언어 전부에** 넣고 그 id 를 돌려준다.
   *
   * 한 언어에만 넣으면 그 언어 글자만 바뀌고 나머지는 그대로다.
   * 실측: 161편 가운데 HANGUL 은 161편, 나머지는 159편에 있었다.
   * **7개가 늘 다 있다고 보면 안 된다** — 없으면 만든다.
   */
  글꼴확보(이름: string): 결과<{ id: string; 새로만듦: boolean }> {
    const 목 = this.목록('hh:fontfaces');
    let 새로만듦 = false;
    const ids: string[] = [];

    for (const 언어 of 언어들) {
      let 무리 = childrenNamed(목, 'hh:fontface').find((f) => getAttr(f, 'lang') === 언어);
      if (!무리) {
        무리 = createElement('hh:fontface', { lang: 언어, fontCnt: '0' });
        appendChild(목, 무리);
        setAttr(목, 'itemCnt', String(childrenNamed(목, 'hh:fontface').length));
        새로만듦 = true;
        this.손댔나 = true;
      }
      const 글꼴들 = childrenNamed(무리, 'hh:font');
      const 있는것 = 글꼴들.find((f) => getAttr(f, 'face') === 이름);
      if (있는것) { ids.push(getAttr(있는것, 'id') ?? '0'); continue; }

      const 최대 = 글꼴들.reduce((m, f) => Math.max(m, Number(getAttr(f, 'id') ?? -1)), -1);
      const 새id = String(최대 + 1);
      const 새글꼴 = createElement('hh:font', { id: 새id, face: 이름, type: 'TTF', isEmbedded: '0' });
      appendChild(새글꼴, createElement('hh:typeInfo', {
        familyType: 'FCAT_GOTHIC', weight: '6', proportion: '4', contrast: '0',
        strokeVariation: '1', armStyle: '1', letterform: '1', midline: '1', xHeight: '1',
      }));
      appendChild(무리, 새글꼴);
      setAttr(무리, 'fontCnt', String(글꼴들.length + 1));
      ids.push(새id);
      새로만듦 = true;
      this.손댔나 = true;
    }

    // 언어마다 번호가 갈리면 fontRef 를 언어별로 달리 써야 한다.
    // 지금은 그 경우를 **못 한다고 말한다.** 조용히 한 언어만 바꾸는 것보다 낫다.
    const 다름 = [...new Set(ids)];
    if (다름.length > 1) {
      return 안됨(
        `글꼴 '${이름}' 의 번호가 언어마다 다르다 (${ids.join(', ')})`,
        '언어별 글꼴 번호가 갈리는 문서다. charPr 의 fontRef 를 직접 지정해야 한다.',
      );
    }
    return 됨({ id: 다름[0] ?? '0', 새로만듦 });
  }

  /** 글꼴이 이미 있나 */
  글꼴있나(이름: string): boolean {
    const 목 = firstChildNamed(this.refList, 'hh:fontfaces');
    if (!목) return false;
    return childrenNamed(목, 'hh:fontface')
      .some((f) => childrenNamed(f, 'hh:font').some((x) => getAttr(x, 'face') === 이름));
  }
}

/** 복제본만 담은 글. 복제본은 전부 dirty 라 자리(span)를 안 쓴다 */
function 복제본조각(el: ElementNode): string {
  return serializeNode(el, '');
}

/**
 * `hp:case` 쪽은 값이 **절반**이다. 내림한다.
 *
 * 실측에서 default 1601 → case 800, default 101 → case 50 이었다.
 * 올림이 아니라 내림이다.
 */
function 반내림(v: number): number {
  return Math.floor(v / 2);
}

/**
 * `hp:switch` 의 두 갈래. 없으면 요소 자체를 하나의 갈래로 본다.
 *
 * 161편 가운데 68개 paraPr 은 switch 없이 `hh:margin` 을 바로 갖고 있었다.
 * 두 꼴이 다 있으니 둘 다 다룬다.
 */
function 여백갈래(paraPr: ElementNode): { 가지: ElementNode; 반값: boolean }[] {
  const sw = firstChildNamed(paraPr, 'hp:switch');
  if (!sw) return [{ 가지: paraPr, 반값: false }];
  const out: { 가지: ElementNode; 반값: boolean }[] = [];
  const kase = firstChildNamed(sw, 'hp:case');
  const def = firstChildNamed(sw, 'hp:default');
  // hp:case 가 한글이 읽는 쪽이고, 값이 절반이다
  if (kase) out.push({ 가지: kase, 반값: true });
  if (def) out.push({ 가지: def, 반값: false });
  return out;
}

/** `1F4E9C` / `#1f4e9c` → `#1F4E9C` */
export function 색맞추기(v: string): string {
  if (v === 'none') return 'none';
  const m = /^#?([0-9a-fA-F]{6})$/.exec(v.trim());
  if (!m) throw new Error(`색은 #RRGGBB 여야 한다: ${v}`);
  return `#${m[1]!.toUpperCase()}`;
}
