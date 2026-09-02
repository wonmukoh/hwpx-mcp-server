/**
 * 조판 — 블록 목록을 문서로.
 *
 * ## 맨땅에서 XML 을 짜지 않는다
 *
 * 문단·표·셀은 전부 [`조각.ts`](조각.ts) 에서 복제해 쓴다.
 * 그 조각들은 **한글이 저장한 문서에서 오려 낸 것**이다.
 * 손으로 짜면 빠진 자식이 생기고, 한글은 그걸 알려 주지 않고 뒤를 무시한다.
 *
 * ## 서식은 문서가 쓰던 것에서 갈라 나온다
 *
 * 새 `charPr` 을 짜 넣지 않는다. 문서가 쓰던 것을 복제해 요청분만 덮어쓰고,
 * 같은 모양이 이미 있으면 그걸 쓴다 (`머리글.확보`).
 * 그래서 100개 블록을 써도 header 가 안 부푼다.
 *
 * ## 줄 배치는 안 넣는다
 *
 * `hp:linesegarray` 는 한글이 계산해 넣는 것이다. 우리가 흉내 내면 더 틀린다.
 * 빼 두면 한글이 열 때 다시 계산한다.
 */

import {
  parseXml, findAll, childrenNamed, firstChildNamed,
  getAttr, setAttr, setText, appendChild, removeNode, insertAfter, 복제하기,
  pt, ptToHwp, hwp,
  type ElementNode, textOf, createElement, insertBefore, 못쓰는제어문자,
} from '@hwpx/owpml';
import {
  문서, 문단, 구역, 표, 셀, 그림들이기,
  됨, 안됨, type 결과,
  type 글자모양패치, type 문단모양패치, 표자식넣기 } from '@hwpx/doc';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as 조각 from './조각.js';
import {
  정렬맞추기, 블록종류,
  type 블록, type 개조식항목,
} from './블록.js';
import { 꾸밈풀기, 꾸밈걷기 } from './꾸밈.js';

/** 개조식 수준별 머리표와 들여쓰기 (pt). 정부 문서를 보고 정했다 */
const 개조식꼴 = [
  { 머리: '□ ', 들여: 0, 크기: 13, 굵게: true },
  { 머리: '○ ', 들여: 15, 크기: 12, 굵게: false },
  { 머리: '- ', 들여: 30, 크기: 11, 굵게: false },
  { 머리: '· ', 들여: 45, 크기: 11, 굵게: false },
];

export interface 조판설정 {
  /** 제목 글꼴. 안 주면 문서가 쓰던 것 */
  title_font?: string;
  /** `[[…]]` 에 쓸 강조색. 안 주면 파랑(`#0000FF`) — 실측에서 정부 문서가 267번 쓴 색 */
  highlight_color?: string;
  /** 본문 글꼴 */
  body_font?: string;
  /** 표 기본 폭 (pt). 안 주면 **구역에서 재서** 본문 너비에 맞춘다 */
  table_width?: number;
  /**
   * 쪽 여백 (pt). 안 주면 문서가 쓰던 값 그대로.
   *
   * 실측 — 이걸 안 맞추면 같은 글도 줄이 다르게 끊긴다:
   * 우리 빈 문서는 좌우 8504 HWPUNIT(=85pt), 교육부 업무계획은 5669(=56.7pt).
   * 20mm = 56.7pt / 30mm = 85pt 다.
   */
  page?: {
    margin_left?: number;
    margin_right?: number;
    margin_top?: number;
    margin_bottom?: number;
    /**
     * 머리말·꼬리말 자리의 높이 (pt).
     *
     * **이게 없으면 쪽에 들어가는 줄 수가 달라진다.** 본문 높이는
     * `쪽높이 - 위 - 아래 - 머리말 - 꼬리말` 이기 때문이다.
     * 교육부 문서는 2834 HWPUNIT(=10mm) 인데 빈 문서 틀은 4252 다 —
     * 그 차이만큼(위아래 합쳐 28pt) 우리 쪽이 좁아 **세로로 넘쳤다.**
     */
    margin_header?: number;
    margin_footer?: number;
  };
  /**
   * 머리말에 넣을 글. 실측: 문서 161편 가운데 12편(7%)이 쓴다.
   * 학교 가정통신문·공문은 거의 다 쓴다.
   */
  header_text?: string;
  /** 꼬리말에 넣을 글 */
  footer_text?: string;
  /**
   * 쪽 번호를 넣을까.
   *
   * 실측: 쪽 번호를 쓰는 문서 52편 가운데 **46편이 `hp:pageNum`** 을 쓴다
   * (머리말·꼬리말이 아니다). 우리도 그렇게 넣는다.
   */
  page_number?: 'bottom-center' | 'bottom-left' | 'bottom-right' | false;
  /** 본문 줄 간격 (%). 안 주면 160 */
  line_spacing?: number;
  /** 본문 자간 (%). 안 주면 0 */
  letter_spacing?: number;
}

export interface 만든것 {
  블록: number;
  kind: string;
  ids: string[];
}

/** A4 세로, 좌우 여백 20mm 일 때 본문 너비 (HWPUNIT 실측: ref-blank 의 lineseg horzsize) */
const 기본본문너비 = 42520;

/** 조각에서 새 노드를 뜬다. 전부 dirty 라 어느 나무에 붙여도 안전하다 */
export function 뜨기(글: string): ElementNode {
  const doc = parseXml(글);
  더럽히기(doc.root);
  return doc.root;
}

function 더럽히기(n: ElementNode): void {
  n.dirty = true;
  for (const c of n.children) {
    c.dirty = true;
    if (c.kind === 'element') 더럽히기(c);
  }
}

export class 조판기 {
  private readonly 만든것들: 만든것[] = [];

  constructor(
    private readonly d: 문서,
    private readonly 설정: 조판설정 = {},
  ) {}

  /**
   * 블록들을 구역 끝에 쓴다.
   *
   * 하나라도 실패하면 **거기서 멈추고** 무엇까지 됐는지 말한다.
   * 반쯤 쓰고 "됐다" 고 하면 안 된다.
   */
  쓰기(블록들: 블록[], 구역이름?: string): 결과<{ 만든것: 만든것[]; 문단수: number }> {
    if (블록들.length === 0) {
      return 안됨('블록이 하나도 없다', '무엇을 쓸지 blocks 에 적어라.');
    }

    let s = 구역이름 ? this.d.구역(구역이름) : this.d.구역들[this.d.구역들.length - 1];
    if (!s) return 안됨('구역이 없다', '깨진 문서다.');

    // 블록을 쓰기 **전에** 쪽을 잡는다. 여백이 바뀌면 줄이 다르게 끊기기 때문이다.
    const 쪽 = this.쪽잡기(s);
    if (!쪽.ok) return 쪽;

    let 문단수 = 0;
    for (const [i, b] of 블록들.entries()) {
      // 구역 나눔은 **고리 안에서** 다룬다 — 그 뒤 블록이 새 구역에 들어가야 하기 때문이다.
      // 쪽 나눔과 다르다. 구역은 쪽 설정을 따로 가진다.
      if (b.kind === 'section_break') {
        const 새구역 = this.d.구역더하기();
        if (!새구역.ok) {
          return 안됨(`${i}번째 블록(section_break)에서 멈췄다: ${새구역.이유}`, 새구역.어떻게);
        }
        s = this.d.구역(새구역.value.이름);
        const 새쪽 = this.쪽잡기(s);
        if (!새쪽.ok) return 새쪽;
        this.만든것들.push({ 블록: i, kind: 'section_break', ids: [] });
        continue;
      }
      const r = this.블록쓰기(s, b, i);
      if (!r.ok) {
        return 안됨(
          `${i}번째 블록(${b.kind})에서 멈췄다: ${r.이유}`,
          `${i}번째 앞의 ${i}개는 이미 들어갔다. ${r.어떻게}`,
        );
      }
      문단수 += r.value.ids.length;
      this.만든것들.push(r.value);
    }
    return 됨({ 만든것: this.만든것들, 문단수 });
  }

  private 블록쓰기(s: 구역, b: 블록, 번호: number): 결과<만든것> {
    switch (b.kind) {
      case 'title': return this.제목(s, b, 번호);
      case 'band': return this.띠(s, b, 번호);
      case 'outline': return this.개조식(s, b, 번호);
      case 'box': return this.상자(s, b, 번호);
      case 'table': return this.표(s, b, 번호);
      case 'image': return this.그림(s, b, 번호);
      case 'body': return this.본문(s, b, 번호);
      case 'heading': return this.소제목(s, b, 번호);
      case 'note': return this.주석(s, b, 번호);
      case 'text': return this.글(s, b, 번호);
      case 'shape': return this.도형(s, b, 번호);
      case 'page_break': return this.쪽나눔(s, 번호);
      default: {
        const 모르는것 = b as { kind?: string };
        return 안됨(
          `모르는 블록 종류: ${모르는것.kind}`,
          `${블록종류.join(' ')} 가운데 하나여야 한다.`,
        );
      }
    }
  }

  // ── 문단 만들기 ─────────────────────────────────────────────────────────

  /**
   * 문단 하나를 만들어 구역 끝에 붙이고 ID 를 돌려준다.
   *
   * 서식은 **문서가 쓰던 것에서 갈라 나온다.**
   *
   * `글` 에 `**굵게**` `[[강조]]` 표시가 있으면 **런을 쪼갠다.**
   * 정부 문서 본문은 한 문단이 런 28개로 쪼개져 있기도 하다 —
   * 그걸 도구 호출 28번으로 만들 수는 없으니 글 안에 표시해서 한 번에 받는다.
   */
  private 문단넣기(
    s: 구역,
    글: string,
    글자: 글자모양패치 = {},
    문단서식: 문단모양패치 = {},
    바탕: { charPr?: string; paraPr?: string } = {},
  ): 결과<string> {
    const el = 뜨기(조각.문단);

    const 첫런 = childrenNamed(el, 'hp:run')[0];
    if (!첫런) return 안됨('문단 조각에 런이 없다', '조각을 다시 구워라 (node 검증/조각굽기.mjs).');
    if (childrenNamed(첫런, 'hp:t').length === 0) {
      return 안됨('문단 조각에 글자 칸이 없다', '조각을 다시 구워라.');
    }

    const 글자바탕 = 바탕.charPr ?? this.d.머리.첫id('hh:charProperties') ?? '0';

    // 표시를 푼다. 안 닫힌 표시가 있으면 여기서 멈춘다.
    const 조각들r = 꾸밈풀기(글, { 강조색: this.설정.highlight_color ?? undefined });
    if (!조각들r.ok) return 조각들r;
    const 글조각들 = 조각들r.value;

    // 조각마다 글자모양을 확보한다. 바탕 패치 위에 조각의 굵기·색을 얹는다.
    const 런들: { 글: string; charPrId: string }[] = [];
    for (const 조각글 of 글조각들) {
      const 패치: 글자모양패치 = {
        ...글자,
        ...(조각글.굵게 ? { 굵게: true } : {}),
        ...(조각글.색 !== undefined ? { 색: 조각글.색 } : {}),
      };
      if (Object.keys(패치).length === 0) {
        런들.push({ 글: 조각글.글, charPrId: 글자바탕 });
        continue;
      }
      const r = this.d.머리.charPr확보(글자바탕, this.글꼴채우기(패치));
      if (!r.ok) return r;
      런들.push({ 글: 조각글.글, charPrId: r.value.id });
    }

    // 첫 런에 첫 조각을 넣고, 나머지는 첫 런을 복제해 뒤에 붙인다.
    // (맨땅에서 짜지 않는다 — 조각에서 복제하는 것이 이 프로젝트의 규칙이다)
    setText(childrenNamed(첫런, 'hp:t')[0]!, 런들[0]!.글);
    setAttr(첫런, 'charPrIDRef', 런들[0]!.charPrId);

    let 앞런 = 첫런;
    for (const 뒤 of 런들.slice(1)) {
      // 복제하기() 를 쓴다 — 빈 복제본이 나오면 소리 내어 막아 준다.
      // serializeNode(node, '') 를 직접 쓰다가 조각이 통째로 비어 나온 적이 있다.
      const 새런 = 복제하기(첫런, '');
      setText(childrenNamed(새런, 'hp:t')[0]!, 뒤.글);
      setAttr(새런, 'charPrIDRef', 뒤.charPrId);
      insertAfter(앞런, 새런);
      앞런 = 새런;
    }

    // 탭. 실측: 문서 161편 가운데 15편이 쓴다 (103개).
    // `	` 를 글에 그대로 두면 한글이 안 읽는다 — `hp:tab` 요소로 갈라 넣어야 한다.
    // 너비는 0 으로 둔다. 한글이 문단의 탭 설정(`tabPrIDRef`)을 보고 스스로 잡는다.
    for (const 런 of [...childrenNamed(el, 'hp:run')]) {
      const 글칸 = childrenNamed(런, 'hp:t')[0];
      if (!글칸) continue;
      const 글 = textOf(글칸);
      if (!글.includes('	')) continue;

      const 토막 = 글.split('	');
      setText(글칸, 토막[0]!);
      let 뒤에 = 런;
      for (const 조각글 of 토막.slice(1)) {
        const 탭런 = 복제하기(런, '');
        const 탭칸 = childrenNamed(탭런, 'hp:t')[0]!;
        // hp:t 를 비우고 그 자리에 hp:tab 을 넣는다
        setText(탭칸, '');
        appendChild(탭칸, createElement('hp:tab', { width: '0', leader: '0', type: '0' }));
        insertAfter(뒤에, 탭런);
        뒤에 = 탭런;

        const 글런 = 복제하기(런, '');
        setText(childrenNamed(글런, 'hp:t')[0]!, 조각글);
        insertAfter(뒤에, 글런);
        뒤에 = 글런;
      }
    }

    // 문단 모양
    const 문단바탕 = 바탕.paraPr ?? this.d.머리.첫id('hh:paraProperties') ?? '0';
    if (Object.keys(문단서식).length > 0) {
      const r = this.d.머리.paraPr확보(문단바탕, 문단서식);
      if (!r.ok) return r;
      setAttr(el, 'paraPrIDRef', r.value.id);
    } else {
      setAttr(el, 'paraPrIDRef', 문단바탕);
    }

    appendChild(s.root, el);
    return 됨(this.d.이름표.아이디(el));
  }

  /** 설정에 글꼴이 있으면 채워 준다 */
  /**
   * 블록이 들고 온 글자 꾸밈을 패치로 옮긴다.
   *
   * 문서 층에는 밑줄·기울임·음영·장평이 다 있었는데 **입구가 없어 못 썼다.**
   * 있는 것과 쓸 수 있는 것은 다르다 — 기능표가 그걸 잡아 준다.
   */
  private 글자꾸밈(b: {
    italic?: boolean; underline?: boolean | string; shade?: string; width_ratio?: number;
  }): 글자모양패치 {
    return {
      ...(b.italic !== undefined ? { 기울임: b.italic } : {}),
      // 밑줄은 자리를 고를 수 있다. true 면 아래에 긋는다.
      ...(b.underline !== undefined
        ? { 밑줄: b.underline === true ? 'BOTTOM' : b.underline === false ? 'NONE' : String(b.underline) }
        : {}),
      ...(b.shade !== undefined ? { 배경색: b.shade } : {}),
      ...(b.width_ratio !== undefined ? { 장평: b.width_ratio } : {}),
    };
  }

  private 글꼴채우기(패치: 글자모양패치, 제목인가 = false): 글자모양패치 {
    if (패치.글꼴 !== undefined) return 패치;
    const 글꼴 = 제목인가 ? this.설정.title_font : this.설정.body_font;
    return 글꼴 ? { ...패치, 글꼴 } : 패치;
  }

  /**
   * 테두리를 갈라 낼 바탕 id.
   *
   * 문서마다 번호가 다르다 — 빈 문서 템플릿은 **1부터** 시작한다.
   * '0' 을 못 박았다가 띠 블록이 통째로 멈춘 적이 있다.
   */
  private 테두리바탕(): 결과<string> {
    const id = this.d.머리.첫id('hh:borderFills');
    if (id === undefined) {
      return 안됨(
        '문서에 테두리 모양(borderFill)이 하나도 없다',
        '한글이 만든 문서라면 늘 하나는 있다. 깨진 문서이거나 우리가 잘못 읽은 것이다.',
      );
    }
    return 됨(id);
  }

  /** 쪽 여백과 쪽 번호를 건다. 블록을 쓰기 전에 한 번만 */
  private 쪽잡기(s: 구역): 결과<{ 여백바뀜: number; 쪽번호넣음: boolean }> {
    let 여백바뀜 = 0;
    const p = this.설정.page;
    if (p) {
      const 줄 = (v?: number) => (v === undefined ? undefined : ptToHwp(pt(v)));
      const r = s.쪽여백주기({
        left: 줄(p.margin_left), right: 줄(p.margin_right),
        top: 줄(p.margin_top), bottom: 줄(p.margin_bottom),
        header: 줄(p.margin_header), footer: 줄(p.margin_footer),
      });
      // "이미 그 여백" 은 탈이 아니다 — 그대로 두면 된다
      if (r.ok) 여백바뀜 = r.value.바뀐수;
      else if (!r.이유.includes('바뀐 것이 없다')) return r;
    }

    // 머리말·꼬리말. 구역 **첫 문단의 런**에 ctrl 로 넣는다.
    // 조각을 손으로 짜지 않는다 — 자식이 빠지면 한글이 그 뒤를 통째로 무시한다.
    for (const [글, 조각이름, 태그] of [
      [this.설정.header_text, 조각.머리말, 'hp:header'],
      [this.설정.footer_text, 조각.꼬리말, 'hp:footer'],
    ] as const) {
      if (글 === undefined) continue;
      if (findAll(s.root, 태그).length > 0) continue;   // 이미 있으면 손대지 않는다

      const ctrl = 뜨기(조각이름);
      const 글칸 = findAll(ctrl, 'hp:t')[0];
      if (!글칸) return 안됨(`${태그} 조각에 글자 칸이 없다`, '조각을 다시 구워라.');
      setText(글칸, 글);

      // 담을 문단이 없으면 하나 만든다
      let 첫문단 = childrenNamed(s.root, 'hp:p')[0];
      if (!첫문단) {
        const r = this.문단넣기(s, '');
        if (!r.ok) return 안됨(r.이유, r.어떻게);
        첫문단 = childrenNamed(s.root, 'hp:p')[0]!;
      }
      let 런 = childrenNamed(첫문단, 'hp:run')[0];
      if (!런) { 런 = 뜨기(조각.표런); appendChild(첫문단, 런); }
      // ctrl 은 런의 **맨 앞**에 온다 — 글 뒤에 붙이면 한글이 자리를 못 잡는다
      const 앞 = 런.children.find((c) => c.kind === 'element');
      if (앞) insertBefore(앞 as ElementNode, ctrl);
      else appendChild(런, ctrl);
    }

    let 쪽번호넣음 = false;
    if (this.설정.page_number) {
      const r = this.쪽번호넣기(s, this.설정.page_number);
      if (!r.ok) return r;
      쪽번호넣음 = r.value;
    }
    return 됨({ 여백바뀜, 쪽번호넣음 });
  }

  /**
   * 쪽 번호를 첫 문단의 첫 런 **맨 앞**에 넣는다.
   *
   * 조각은 `ref-pagenum.hwpx` 에서 오려 낸 것이다:
   * `<hp:ctrl><hp:pageNum pos="…" formatType="DIGIT" sideChar="-"/></hp:ctrl>`
   */
  private 쪽번호넣기(s: 구역, 자리: string): 결과<boolean> {
    if (s.쪽번호있나) return 됨(false);

    const 런 = s.첫런;
    if (!런) {
      return 안됨(
        '쪽 번호를 넣을 문단이 없다',
        '블록을 먼저 하나 넣고 쪽 번호를 켜라.',
      );
    }

    const 자리표 : Record<string, string> = {
      'bottom-center': 'BOTTOM_CENTER',
      'bottom-left': 'BOTTOM_LEFT',
      'bottom-right': 'BOTTOM_RIGHT',
    };
    const pos = 자리표[자리];
    if (!pos) {
      return 안됨(
        `쪽 번호 자리를 모른다: ${자리}`,
        `${Object.keys(자리표).join(', ')} 가운데 하나여야 한다.`,
      );
    }

    const ctrl = 뜨기(조각.쪽번호);
    const pn = findAll(ctrl, 'hp:pageNum')[0];
    if (!pn) return 안됨('쪽번호 조각이 깨졌다', 'node 검증/조각굽기.mjs 로 다시 구워라.');
    setAttr(pn, 'pos', pos);

    // 런 맨 앞에 넣는다 (글보다 앞)
    런.children.unshift(ctrl);
    ctrl.parent = 런;
    let 위 : ElementNode | undefined = 런;
    while (위) { 위.dirty = true; 위 = 위.parent; }
    return 됨(true);
  }

  // ── 블록별 ──────────────────────────────────────────────────────────────

  private 제목(s: 구역, b: { text: string; date?: string; org?: string }, 번호: number): 결과<만든것> {
    const ids: string[] = [];
    const 줄 = (글: string, 글자: 글자모양패치, 문단: 문단모양패치): 결과<만든것> | null => {
      const r = this.문단넣기(s, 글, this.글꼴채우기(글자, true), 문단);
      if (!r.ok) return 안됨(r.이유, r.어떻게);
      ids.push(r.value);
      return null;
    };

    const 탈 = 줄(b.text, { 크기: pt(20), 굵게: true },
      { 정렬: 'CENTER', 위여백: hwp(600), 아래여백: hwp(400) });
    if (탈) return 탈;

    if (b.date) {
      const t = 줄(b.date, { 크기: pt(12) }, { 정렬: 'CENTER', 아래여백: hwp(200) });
      if (t) return t;
    }
    if (b.org) {
      const t = 줄(b.org, { 크기: pt(14), 굵게: true }, { 정렬: 'CENTER', 아래여백: hwp(800) });
      if (t) return t;
    }
    return 됨({ 블록: 번호, kind: 'title', ids });
  }

  private 띠(s: 구역, b: { text: string; background?: string; color?: string }, 번호: number): 결과<만든것> {
    const 배경 = b.background ?? '#1F4E9C';
    const 글자색 = b.color ?? '#FFFFFF';

    // 배경색은 문단 테두리(borderFill)에 채워 넣는다
    const 바탕 = this.테두리바탕();
    if (!바탕.ok) return 바탕;
    const bf = this.d.머리.borderFill확보(바탕.value, { 채움: 배경, 종류: 'NONE' });
    if (!bf.ok) return bf;

    const 띠줄 = this.문단넣기(s, b.text,
      { 크기: pt(14), 굵게: true, 색: 글자색 },
      { 정렬: 'LEFT', 위여백: hwp(500), 아래여백: hwp(300), 왼쪽여백: hwp(200) });
    if (!띠줄.ok) return 띠줄;

    const 띠붙임 = this.문단테두리걸기(띠줄.value, bf.value.id);
    if (!띠붙임.ok) return 띠붙임;

    return 됨({ 블록: 번호, kind: 'band', ids: [띠줄.value] });
  }

  /**
   * 문단 모양의 `hh:border` 가 가리키는 테두리를 바꾼다.
   *
   * paraPr 을 **복제해서** 바꾼다 — 원래 것을 고치면 그걸 쓰는 다른 문단까지 바뀐다.
   */
  private 문단테두리걸기(문단id: string, borderFillId: string): 결과<{ paraPrId: string }> {
    const p = this.d.문단찾기(문단id);
    if (!p.ok) return p;

    const 확보 = this.d.머리.확보('hh:paraProperties', p.value.문단모양, (el) => {
      const bd = firstChildNamed(el, 'hh:border');
      if (!bd) return false;
      if (getAttr(bd, 'borderFillIDRef') === borderFillId) return false;
      setAttr(bd, 'borderFillIDRef', borderFillId);
      return true;
    });
    if (!확보.ok) return 확보;
    p.value.문단모양주기(확보.value.id);
    return 됨({ paraPrId: 확보.value.id });
  }

  private 개조식(s: 구역, b: { items: 개조식항목[]; emphasize?: string[] }, 번호: number): 결과<만든것> {
    if (b.items.length === 0) {
      return 안됨('개조식 항목이 하나도 없다', 'items 에 적어도 한 줄을 적어라.');
    }
    const ids: string[] = [];
    for (const [i, it] of b.items.entries()) {
      const 수준 = Math.max(1, Math.min(개조식꼴.length, Math.floor(it.level || 1)));
      const 꼴 = 개조식꼴[수준 - 1]!;
      const r = this.문단넣기(s, `${꼴.머리}${it.text}`,
        { 크기: pt(꼴.크기), 굵게: it.bold ?? 꼴.굵게 },
        { 왼쪽여백: ptToHwp(pt(꼴.들여)), 아래여백: hwp(100) });
      if (!r.ok) return 안됨(`${i}번째 항목에서 멈췄다: ${r.이유}`, r.어떻게);
      ids.push(r.value);
    }

    // 강조 — **그 말이 실제로 있는 줄에만** 건다.
    //
    // 처음엔 모든 줄에 다 걸어 보고 되는 것만 셌다. 그러면 안 되는 시도가
    // 연산 기록에 실패로 쌓인다. 기록이 지저분해지면 **진짜 실패를 못 찾는다** —
    // 그 기록은 조용한 실패를 잡으려고 두는 것이다.
    if (b.emphasize?.length) {
      let 강조한수 = 0;
      for (const id of ids) {
        const p = this.d.문단찾기(id);
        if (!p.ok) continue;
        for (const 말 of b.emphasize) {
          if (!p.value.글.includes(말)) continue;
          if (this.d.강조하기(id, 말, { 굵게: true }).ok) 강조한수++;
        }
      }
      if (강조한수 === 0) {
        return 안됨(
          `강조할 어구를 한 줄에서도 못 찾았다: ${b.emphasize.join(', ')}`,
          '개조식 글 안에 실제로 있는 말을 적어라. 머리표(□ ○ -)는 우리가 붙이니 빼고 적는다.',
        );
      }
    }

    return 됨({ 블록: 번호, kind: 'outline', ids });
  }

  private 상자(
    s: 구역,
    b: { text?: string; title?: string; items?: string[]; background?: string },
    번호: number,
  ): 결과<만든것> {
    const 줄들 = [
      ...(b.title ? [{ 글: b.title, 머리인가: true }] : []),
      ...(b.text ? b.text.split('\n').map((t) => ({ 글: t, 머리인가: false })) : []),
      ...(b.items ?? []).map((t) => ({ 글: `· ${t}`, 머리인가: false })),
    ];
    if (줄들.length === 0) {
      return 안됨('상자에 넣을 글이 없다', 'text · title · items 가운데 하나는 있어야 한다.');
    }

    const 바탕 = this.테두리바탕();
    if (!바탕.ok) return 바탕;

    // 줄마다 네 면을 다 두르면 **상자가 아니라 표처럼** 보인다.
    // 첫 줄에 위, 끝 줄에 아래, 모든 줄에 좌우만 건다.
    // (처음엔 네 면을 다 둘렀다가 렌더를 보고서야 알았다)
    const 면짓기 = (면: ('left' | 'right' | 'top' | 'bottom')[]) =>
      this.d.머리.borderFill확보(바탕.value, {
        면, 종류: 'SOLID', 굵기: '0.12 mm', 색: '#000000',
        ...(b.background ? { 채움: b.background } : {}),
      });

    const 홑줄 = 줄들.length === 1;
    const 테두리 = {
      첫줄: 면짓기(홑줄 ? ['left', 'right', 'top', 'bottom'] : ['left', 'right', 'top']),
      가운데: 면짓기(['left', 'right']),
      끝줄: 면짓기(['left', 'right', 'bottom']),
    };
    for (const r of Object.values(테두리)) if (!r.ok) return r;

    const ids: string[] = [];
    for (const [i, 줄] of 줄들.entries()) {
      const 첫줄 = i === 0, 끝줄 = i === 줄들.length - 1;
      const r = this.문단넣기(s, 줄.글,
        { 크기: pt(줄.머리인가 ? 12 : 11), 굵게: 줄.머리인가 },
        {
          정렬: 줄.머리인가 ? 'CENTER' : 'LEFT',
          왼쪽여백: hwp(300), 오른쪽여백: hwp(300),
          ...(첫줄 ? { 위여백: hwp(300) } : {}),
          ...(끝줄 ? { 아래여백: hwp(300) } : {}),
        });
      if (!r.ok) return 안됨(`상자 ${i}번째 줄에서 멈췄다: ${r.이유}`, r.어떻게);
      ids.push(r.value);

      const 쓸것 = 첫줄 ? 테두리.첫줄 : 끝줄 ? 테두리.끝줄 : 테두리.가운데;
      if (!쓸것.ok) return 쓸것;
      const 붙임 = this.문단테두리걸기(r.value, 쓸것.value.id);
      if (!붙임.ok) return 붙임;
    }
    return 됨({ 블록: 번호, kind: 'box', ids });
  }

  private 글(
    s: 구역,
    b: { text: string; size?: number; align?: string; bold?: boolean; color?: string; font?: string;
      italic?: boolean; underline?: boolean | string; shade?: string; width_ratio?: number },
    번호: number,
  ): 결과<만든것> {
    let 정렬: string | undefined;
    try { 정렬 = 정렬맞추기(b.align); } catch (e) { return 안됨((e as Error).message, '정렬 이름을 고쳐라.'); }

    const 줄들 = b.text.split('\n');
    const ids: string[] = [];
    for (const 줄 of 줄들) {
      const r = this.문단넣기(s, 줄,
        {
          ...(b.size !== undefined ? { 크기: pt(b.size) } : {}),
          ...(b.font ? { 글꼴: b.font } : {}),
          ...this.글자꾸밈(b),
          ...(b.bold !== undefined ? { 굵게: b.bold } : {}),
          ...(b.color !== undefined ? { 색: b.color } : {}),
        },
        정렬 ? { 정렬 } : {});
      if (!r.ok) return 안됨(r.이유, r.어떻게);
      ids.push(r.value);
    }
    return 됨({ 블록: 번호, kind: 'text', ids });
  }

  /**
   * 본문 문단.
   *
   * 첫 줄 들여쓰기는 **글 앞에 공백 두 칸**을 넣어 한다.
   * 실측에서 정부 문서가 그렇게 했다 (41문단이 공백, `hc:intent` 는 개조식·주석에만).
   */
  private 본문(
    s: 구역,
    b: {
      text: string; indent?: boolean; size?: number; align?: string; font?: string;
      italic?: boolean; underline?: boolean | string; shade?: string; width_ratio?: number;
      line_spacing?: number; letter_spacing?: number; space_before?: number; space_after?: number;
      indent_left?: number; hanging?: number;
    },
    번호: number,
  ): 결과<만든것> {
    let 정렬: string | undefined;
    try { 정렬 = 정렬맞추기(b.align); } catch (e) { return 안됨((e as Error).message, '정렬 이름을 고쳐라.'); }

    const ids: string[] = [];
    for (const 줄 of b.text.split('\n')) {
      const 앞머리 = (b.indent ?? true) ? '  ' : '';
      const 자간 = b.letter_spacing ?? this.설정.letter_spacing;
      const 줄간 = b.line_spacing ?? this.설정.line_spacing ?? 160;
      const r = this.문단넣기(s, 앞머리 + 줄,
        { 크기: pt(b.size ?? 14), ...(b.font ? { 글꼴: b.font } : {}), ...this.글자꾸밈(b), ...(자간 !== undefined ? { 자간 } : {}) },
        {
          정렬: 정렬 ?? 'JUSTIFY',
          위여백: hwp(b.space_before !== undefined ? ptToHwp(pt(b.space_before)) : 1000),
          ...(b.indent_left !== undefined ? { 왼쪽여백: ptToHwp(pt(b.indent_left)) } : {}),
          ...(b.hanging !== undefined ? { 들여쓰기: ptToHwp(pt(b.hanging)) } : {}),
          ...(b.space_after !== undefined ? { 아래여백: ptToHwp(pt(b.space_after)) } : {}),
          줄간격: { 종류: 'PERCENT', 값: 줄간 },
        });
      if (!r.ok) return 안됨(r.이유, r.어떻게);
      ids.push(r.value);
    }
    return 됨({ 블록: 번호, kind: 'body', ids });
  }

  /** 소제목. `(3) …` 같은 줄. 14pt 굵게, 위 여백 1400 (실측 paraPr 70) */
  private 소제목(
    s: 구역,
    b: {
      text: string; size?: number; align?: string; font?: string;
      italic?: boolean; underline?: boolean | string; shade?: string; width_ratio?: number;
      line_spacing?: number; letter_spacing?: number; space_before?: number; space_after?: number;
      indent_left?: number; hanging?: number;
    },
    번호: number,
  ): 결과<만든것> {
    const 자간 = b.letter_spacing ?? this.설정.letter_spacing;
    const 줄간 = b.line_spacing ?? this.설정.line_spacing ?? 160;
    let 정렬: string | undefined;
    try { 정렬 = 정렬맞추기(b.align); } catch (e) { return 안됨((e as Error).message, '정렬 이름을 고쳐라.'); }
    const r = this.문단넣기(s, b.text,
      { 크기: pt(b.size ?? 14), 굵게: true, ...(b.font ? { 글꼴: b.font } : {}), ...this.글자꾸밈(b), ...(자간 !== undefined ? { 자간 } : {}) },
      {
        정렬: 정렬 ?? 'JUSTIFY',
        위여백: hwp(b.space_before !== undefined ? ptToHwp(pt(b.space_before)) : 1400),
        ...(b.indent_left !== undefined ? { 왼쪽여백: ptToHwp(pt(b.indent_left)) } : {}),
        ...(b.hanging !== undefined ? { 들여쓰기: ptToHwp(pt(b.hanging)) } : {}),
        ...(b.space_after !== undefined ? { 아래여백: ptToHwp(pt(b.space_after)) } : {}),
        줄간격: { 종류: 'PERCENT', 값: 줄간 },
      });
    if (!r.ok) return 안됨(r.이유, r.어떻게);
    return 됨({ 블록: 번호, kind: 'heading', ids: [r.value] });
  }

  /** 주석. 작은 글씨에 **내어쓰기** — 둘째 줄이 첫 줄보다 들어간다 (실측 paraPr 58) */
  private 주석(
    s: 구역,
    b: {
      text: string; size?: number; hanging?: number; font?: string;
      italic?: boolean; underline?: boolean | string; shade?: string; width_ratio?: number;
      line_spacing?: number; letter_spacing?: number; space_before?: number; space_after?: number;
    },
    번호: number,
  ): 결과<만든것> {
    const ids: string[] = [];
    for (const 줄 of b.text.split('\n')) {
      const 자간 = b.letter_spacing ?? this.설정.letter_spacing;
      const 줄간 = b.line_spacing ?? this.설정.line_spacing ?? 160;
      const 내어 = b.hanging !== undefined ? ptToHwp(pt(b.hanging)) : -3216;
      const r = this.문단넣기(s, 줄,
        { 크기: pt(b.size ?? 11), ...(b.font ? { 글꼴: b.font } : {}), ...this.글자꾸밈(b), ...(자간 !== undefined ? { 자간 } : {}) },
        {
          정렬: 'JUSTIFY', 들여쓰기: hwp(내어),
          ...(b.space_before !== undefined ? { 위여백: ptToHwp(pt(b.space_before)) } : {}),
          ...(b.space_after !== undefined ? { 아래여백: ptToHwp(pt(b.space_after)) } : {}),
          줄간격: { 종류: 'PERCENT', 값: 줄간 },
        });
      if (!r.ok) return 안됨(r.이유, r.어떻게);
      ids.push(r.value);
    }
    return 됨({ 블록: 번호, kind: 'note', ids });
  }

  /**
   * 그림.
   *
   * 크기가 **일곱 군데**에 적힌다: orgSz · curSz · rotationInfo · imgRect(네 점) ·
   * imgClip · imgDim · sz. 한 곳만 고치면 한글이 그림을 잘라 그리거나 비율을 뭉갠다.
   * 그래서 한 함수에서 다 맞춘다.
   */
  private 그림(
    s: 구역,
    b: { path: string; width?: number; height?: number; caption?: string; align?: string },
    번호: number,
  ): 결과<만든것> {
    if (!fs.existsSync(b.path)) {
      return 안됨(
        `${b.path} 파일이 없다`,
        '그림 경로를 **절대 경로**로 적어라. 앱이 열어 준 폴더 밖은 못 읽을 수도 있다.',
      );
    }

    let 바이트: Buffer;
    try { 바이트 = fs.readFileSync(b.path); }
    catch (e) { return 안됨(`${b.path} 를 못 읽었다: ${(e as Error).message.split('\n')[0]}`, '읽을 수 있는 파일인지 보라.'); }

    const 들임 = 그림들이기(this.d.컨테이너, 바이트, path.basename(b.path));
    if (!들임.ok) return 들임;

    // 픽셀 → HWPUNIT. 그림은 72dpi 로 본다 (1px = 1pt = 100 HWPUNIT)
    const 본디너비 = ptToHwp(pt(들임.value.너비px));
    const 본디높이 = ptToHwp(pt(들임.value.높이px));
    // 여기서부터는 HWPUNIT 숫자로 다룬다 (크기맞추기 가 숫자를 받는다)
    let 너비: number = b.width !== undefined ? ptToHwp(pt(b.width)) : 본디너비;
    let 높이: number = b.height !== undefined ? ptToHwp(pt(b.height))
      : (b.width !== undefined ? Math.round(본디높이 * (너비 / 본디너비)) : 본디높이);

    // 쪽 너비를 넘으면 줄인다 — 넘치면 한글이 잘라 그린다
    const 쓸수있는너비 = s.본문너비 ?? 기본본문너비;
    if (너비 > 쓸수있는너비) {
      높이 = Math.round(높이 * (쓸수있는너비 / 너비));
      너비 = 쓸수있는너비;
    }

    const el = 뜨기(조각.문단);
    for (const r of childrenNamed(el, 'hp:run')) removeNode(r);
    const 런 = 뜨기(조각.표런);
    appendChild(el, 런);

    const pic = 뜨기(조각.그림);
    크기맞추기(pic, 너비, 높이, 들임.value.항목id);
    appendChild(런, pic);

    let 정렬: string | undefined;
    try { 정렬 = 정렬맞추기(b.align ?? 'center'); }
    catch (e) { return 안됨((e as Error).message, '정렬 이름을 고쳐라.'); }

    const 문단서식 = this.d.머리.paraPr확보(this.d.머리.첫id('hh:paraProperties') ?? '0',
      { 정렬: 정렬 ?? 'CENTER', 위여백: hwp(300), 아래여백: hwp(200) });
    if (!문단서식.ok) return 문단서식;
    setAttr(el, 'paraPrIDRef', 문단서식.value.id);

    appendChild(s.root, el);
    const ids = [this.d.이름표.아이디(pic)];

    if (b.caption) {
      const c = this.문단넣기(s, b.caption,
        { 크기: pt(10) },
        { 정렬: 'CENTER', 아래여백: hwp(300) });
      if (!c.ok) return 안됨(c.이유, c.어떻게);
      ids.push(c.value);
    }

    return 됨({ 블록: 번호, kind: 'image', ids });
  }

  private 쪽나눔(s: 구역, 번호: number): 결과<만든것> {
    const r = this.문단넣기(s, '');
    if (!r.ok) return 안됨(r.이유, r.어떻게);
    const p = this.d.문단찾기(r.value);
    if (!p.ok) return p;
    setAttr(p.value.el, 'pageBreak', '1');
    return 됨({ 블록: 번호, kind: 'page_break', ids: [r.value] });
  }

  /**
   * 사각형 도형.
   *
   * 실측: 도형을 쓰는 34편 가운데 **33편이 `hp:rect`** 를 쓴다 (254개).
   * 정부 문서의 제목 상자·강조 상자가 거의 다 이것이다.
   *
   * 크기가 **세 군데**에 적힌다: `hp:orgSz` · `hp:sz` · 네 꼭짓점(`hc:pt0~3`).
   * 한 곳만 고치면 한글이 도형을 딴 크기로 그린다 — 그림에서 겪은 것과 같다.
   */
  private 도형(
    s: 구역,
    b: {
      text?: string; width?: number; height?: number;
      border_color?: string; line_width?: number; background?: string;
      size?: number; align?: string; bold?: boolean; font?: string;
    },
    번호: number,
  ): 결과<만든것> {
    const 너비 = ptToHwp(pt(b.width ?? 300));
    const 높이 = ptToHwp(pt(b.height ?? 60));

    const 문단el = 뜨기(조각.문단);
    for (const r of childrenNamed(문단el, 'hp:run')) removeNode(r);
    const 런 = 뜨기(조각.표런);           // 개체를 담는 빈 런 (표런과 같은 꼴이다)
    appendChild(문단el, 런);

    const rect = 뜨기(조각.사각형);
    appendChild(런, rect);

    // 크기를 적히는 곳 **전부**에 맞춘다
    const w = String(Math.round(너비)), h = String(Math.round(높이));
    for (const [태그, 값] of [
      ['hp:orgSz', { width: w, height: h }],
      ['hp:curSz', { width: w, height: h }],
      ['hp:sz', { width: w, height: h }],
    ] as const) {
      const e = firstChildNamed(rect, 태그);
      if (e) for (const [k, v] of Object.entries(값)) setAttr(e, k, v);
    }
    const 회전 = firstChildNamed(rect, 'hp:rotationInfo');
    if (회전) {
      setAttr(회전, 'centerX', String(Math.round(너비 / 2)));
      setAttr(회전, 'centerY', String(Math.round(높이 / 2)));
    }
    for (const [태그, x, y] of [
      ['hc:pt0', '0', '0'], ['hc:pt1', w, '0'], ['hc:pt2', w, h], ['hc:pt3', '0', h],
    ] as const) {
      const p = firstChildNamed(rect, 태그);
      if (p) { setAttr(p, 'x', x); setAttr(p, 'y', y); }
    }

    // 선과 채움
    const 선 = firstChildNamed(rect, 'hp:lineShape');
    if (선) {
      if (b.border_color) setAttr(선, 'color', b.border_color);
      if (b.line_width !== undefined) setAttr(선, 'width', String(Math.round(ptToHwp(pt(b.line_width)))));
    }
    const 붓 = firstChildNamed(firstChildNamed(rect, 'hc:fillBrush') ?? rect, 'hc:winBrush');
    if (붓 && b.background) setAttr(붓, 'faceColor', b.background);

    // 글 안에 놓는다 — 문단 정렬을 따르게
    const pos = firstChildNamed(rect, 'hp:pos');
    if (pos) setAttr(pos, 'treatAsChar', '1');

    // 글은 **상자 안**에 넣는다. `hp:drawText` 를 손으로 짜지 않고 조각에서 뜬다 —
    // 자식이 하나라도 빠지면 한글이 그 뒤를 통째로 무시한다.
    if (b.text) {
      const 글자리 = 뜨기(조각.글자리);
      const 안문단 = findAll(글자리, 'hp:p')[0];
      const 안런 = 안문단 && childrenNamed(안문단, 'hp:run')[0];
      const 글칸 = 안런 && childrenNamed(안런, 'hp:t')[0];
      if (!안문단 || !안런 || !글칸) return 안됨('글자리 조각이 깨졌다', '조각을 다시 구워라.');
      setText(글칸, b.text);

      const 글자 = this.d.머리.charPr확보(this.d.머리.첫id('hh:charProperties') ?? '0',
        this.글꼴채우기({ 크기: pt(b.size ?? 14), 굵게: b.bold ?? false,
          ...(b.font ? { 글꼴: b.font } : {}) }));
      if (!글자.ok) return 글자;
      setAttr(안런, 'charPrIDRef', 글자.value.id);

      const 문단서식 = this.d.머리.paraPr확보(this.d.머리.첫id('hh:paraProperties') ?? '0',
        { 정렬: 정렬맞추기(b.align) ?? 'CENTER' });
      if (!문단서식.ok) return 문단서식;
      setAttr(안문단, 'paraPrIDRef', 문단서식.value.id);

      appendChild(rect, 글자리);
    }

    appendChild(s.root, 문단el);
    return 됨({ 블록: 번호, kind: 'shape', ids: [this.d.이름표.아이디(문단el)] });
  }

  // ── 표 ──────────────────────────────────────────────────────────────────

  private 표(
    s: 구역,
    b: {
      headers?: string[]; rows: string[][]; widths?: number[]; width?: number;
      repeat_header?: boolean; font?: string;
      align?: string; outer_margin?: number; caption?: string; caption_side?: string;
      merges?: { row: number; col: number; rowspan?: number; colspan?: number }[];
      col_align?: string[]; cell_size?: number; cell_padding?: number;
      header_background?: string; border_width?: string;
    },
    번호: number,
  ): 결과<만든것> {
    const 줄들 = [...(b.headers ? [b.headers] : []), ...b.rows];
    if (줄들.length === 0) return 안됨('표에 줄이 하나도 없다', 'rows 에 적어도 한 줄을 적어라.');

    const 칸수 = Math.max(...줄들.map((r) => r.length));
    if (칸수 === 0) return 안됨('표에 칸이 하나도 없다', 'rows 의 각 줄에 값을 적어라.');

    const 어긋난줄 = 줄들.findIndex((r) => r.length !== 칸수);
    if (어긋난줄 !== -1) {
      return 안됨(
        `${어긋난줄}번째 줄의 칸이 ${줄들[어긋난줄]!.length}개인데 다른 줄은 ${칸수}개다`,
        '줄마다 칸 수를 같게 맞춰라. 합칠 자리는 빈 칸("")으로 두고 나중에 합쳐라.',
      );
    }

    // 열 폭
    // 표 폭은 **구역에서 재서** 본문 너비에 맞춘다.
    // 못 박은 값을 쓰면 쪽 여백이 다른 문서에서 표가 삐져나온다.
    const 온폭 = b.width !== undefined ? ptToHwp(pt(b.width))
      : this.설정.table_width !== undefined ? ptToHwp(pt(this.설정.table_width))
        : (s.본문너비 ?? 기본본문너비);
    let 폭들: number[];
    if (b.widths) {
      if (b.widths.length !== 칸수) {
        return 안됨(
          `열이 ${칸수}개인데 widths 를 ${b.widths.length}개 줬다`,
          `widths 를 ${칸수}개 주거나 빼라 (빼면 고르게 나눈다).`,
        );
      }
      폭들 = b.widths.map((w) => ptToHwp(pt(w)));
    } else {
      const 한칸 = Math.floor(온폭 / 칸수);
      폭들 = new Array(칸수).fill(한칸);
      폭들[칸수 - 1] = 온폭 - 한칸 * (칸수 - 1);   // 나머지를 마지막 칸에
    }

    // 표를 담을 문단과 런
    const 문단el = 뜨기(조각.문단);
    for (const r of childrenNamed(문단el, 'hp:run')) removeNode(r);
    const 표런 = 뜨기(조각.표런);
    appendChild(문단el, 표런);

    const 표el = 뜨기(조각.표뼈대);
    setAttr(표el, 'rowCnt', String(줄들.length));
    setAttr(표el, 'colCnt', String(칸수));
    appendChild(표런, 표el);

    // ── 테두리 번호를 **반드시 갈아 끼운다** ────────────────────────────
    //
    // 구운 조각은 원본 문서의 `borderFillIDRef` 를 그대로 들고 있다.
    // 딴 문서에 붙이면 그 번호가 **딴 것**을 가리킨다.
    // 실제로 표 본문이 통째로 남색이 됐다 — 띠 블록이 만든 배경색을 가리키고 있었다.
    // XML 도 맞고 기하도 맞아서 검사에 안 걸렸다. **눈으로 보고서야 알았다.**
    const 테두리바탕 = this.테두리바탕();
    if (!테두리바탕.ok) return 테두리바탕;

    const 몸테두리 = this.d.머리.borderFill확보(테두리바탕.value, {
      종류: 'SOLID', 굵기: b.border_width ?? '0.12 mm', 색: '#000000', 채움: 'none',
    });
    if (!몸테두리.ok) return 몸테두리;
    setAttr(표el, 'borderFillIDRef', 몸테두리.value.id);

    let 머리테두리: string | undefined;
    if (b.headers) {
      const bf = this.d.머리.borderFill확보(몸테두리.value.id,
        { 채움: b.header_background ?? '#E8EEF7' });
      if (!bf.ok) return bf;
      머리테두리 = bf.value.id;
    }

    // 셀 채우기
    const 셀높이 = 282;
    for (const [r, 줄] of 줄들.entries()) {
      const tr = 뜨기('<hp:tr></hp:tr>');
      for (const [c, 값] of 줄.entries()) {
        const tcEl = 뜨기(조각.셀);
        const cell = new 셀(tcEl);
        const addr = firstChildNamed(tcEl, 'hp:cellAddr')!;
        setAttr(addr, 'rowAddr', String(r));
        setAttr(addr, 'colAddr', String(c));
        cell.크기주기(폭들[c]!, 셀높이);

        const 머리칸 = b.headers !== undefined && r === 0;
        // 셀도 조각이 들고 온 번호를 그대로 두면 안 된다
        cell.테두리주기(머리칸 && 머리테두리 ? 머리테두리 : 몸테두리.value.id);
        if (머리칸) cell.머리칸주기(true);

        // 셀 안 글
        const 안문단 = findAll(tcEl, 'hp:p')[0];
        if (!안문단) return 안됨('셀 조각에 문단이 없다', '조각을 다시 구워라.');
        const 안런 = childrenNamed(안문단, 'hp:run')[0]!;
        setText(childrenNamed(안런, 'hp:t')[0]!, 값);

        const 글자 = this.d.머리.charPr확보(
          this.d.머리.첫id('hh:charProperties') ?? '0',
          this.글꼴채우기({ 크기: pt(b.cell_size ?? 10), 굵게: 머리칸,
            ...(b.font ? { 글꼴: b.font } : {}) }));
        if (!글자.ok) return 글자;
        setAttr(안런, 'charPrIDRef', 글자.value.id);

        // 열마다 정렬. 정부 문서 표는 칸마다가 아니라 **열마다** 정렬이 다르다
        // (첫 열은 왼쪽, 숫자 열은 가운데). 칸마다 객체로 받으면 중첩이
        // 한 겹 더 깊어져 모델이 틀린다. 그래서 열 단위로 받는다.
        const 열정렬 = b.col_align?.[c];
        const 정렬 = 머리칸 ? 'CENTER'
          : 열정렬 ? 열정렬.toUpperCase() : 'LEFT';
        const 문단서식 = this.d.머리.paraPr확보(
          this.d.머리.첫id('hh:paraProperties') ?? '0', { 정렬 });
        if (!문단서식.ok) return 문단서식;
        setAttr(안문단, 'paraPrIDRef', 문단서식.value.id);

        appendChild(tr, tcEl);
      }
      appendChild(표el, tr);
    }

    const t = new 표(표el);
    const 폭맞춤 = t.열폭주기(폭들);
    if (!폭맞춤.ok) return 폭맞춤;
    t.높이맞추기();
    t.머리행반복주기(b.repeat_header ?? (b.headers !== undefined));
    // 칸 합치기. 실측: 문서 161편 가운데 122편(76%)이 셀을 합친다.
    // **열 폭을 잡은 뒤에 합친다** — 합친 셀 너비가 덮는 열 폭의 합이어야 하기 때문이다.
    for (const [k, m] of (b.merges ?? []).entries()) {
      const r = t.합치기(m.row, m.col, m.rowspan ?? 1, m.colspan ?? 1);
      if (!r.ok) return 안됨(`merges[${k}] 를 못 합쳤다: ${r.이유}`, r.어떻게);
    }
    // 표 캡션. 실측: 문서 161편 가운데 8편(5%)이 단다.
    // `hp:caption` 은 표 **안**에 살고, 자식 순서가 정해져 있다 —
    // 아무 데나 붙이면 한글이 그 뒤를 무시한다. 그래서 표자식넣기() 를 쓴다.
    if (b.caption) {
      const cap = 뜨기(조각.표캡션);
      setAttr(cap, 'side', (b.caption_side ?? 'top').toUpperCase());
      const 글칸 = findAll(cap, 'hp:t')[0];
      if (!글칸) return 안됨('표캡션 조각에 글자 칸이 없다', '조각을 다시 구워라.');
      setText(글칸, b.caption);
      표자식넣기(표el, cap);
    }
    if (b.align) t.가로정렬주기(b.align.toUpperCase() as 'LEFT' | 'CENTER' | 'RIGHT');
    if (b.outer_margin !== undefined) {
      const v = ptToHwp(pt(b.outer_margin));
      t.바깥여백주기({ left: v, right: v, top: v, bottom: v });
    }
    if (b.cell_padding !== undefined) {
      // 안여백주기가 hasMargin 을 같이 켠다 — 안 켜면 써 놓고도 표 여백이 쓰인다 (실측 8장)
      const v = ptToHwp(pt(b.cell_padding));
      t.안여백주기({ left: v, right: v, top: v, bottom: v });
    }

    appendChild(s.root, 문단el);

    const 탈 = t.탈만;
    if (탈.length) {
      return 안됨(
        `만든 표의 기하가 어긋났다: ${탈.slice(0, 3).join(' / ')}`,
        '이건 우리 잘못이다. 표 만드는 코드를 고쳐야 한다.',
      );
    }

    return 됨({ 블록: 번호, kind: 'table', ids: [this.d.이름표.아이디(표el)] });
  }
}

/**
 * 그림 크기를 **적히는 곳 전부**에 맞춘다.
 *
 * 한 곳만 고치면 한글이 그림을 잘라 그리거나 비율을 뭉갠다.
 * 실측에서 크기가 나오는 자리는 일곱이다.
 */
export function 크기맞추기(pic: ElementNode, 너비: number, 높이: number, 항목id: string): void {
  const w = String(Math.round(너비));
  const h = String(Math.round(높이));

  const 손대기 = (태그: string, 값: Record<string, string>) => {
    const e = firstChildNamed(pic, 태그);
    if (!e) return;
    for (const [k, v] of Object.entries(값)) setAttr(e, k, v);
  };

  손대기('hp:orgSz', { width: w, height: h });
  손대기('hp:curSz', { width: w, height: h });
  손대기('hp:imgDim', { dimwidth: w, dimheight: h });
  손대기('hp:imgClip', { left: '0', right: w, top: '0', bottom: h });
  손대기('hp:sz', { width: w, height: h });
  손대기('hp:rotationInfo', {
    centerX: String(Math.round(너비 / 2)), centerY: String(Math.round(높이 / 2)),
  });

  // imgRect 는 네 점이다. 왼위 → 오른위 → 오른아래 → 왼아래
  const rect = firstChildNamed(pic, 'hp:imgRect');
  if (rect) {
    const 점들: [string, string, string][] = [
      ['hc:pt0', '0', '0'], ['hc:pt1', w, '0'], ['hc:pt2', w, h], ['hc:pt3', '0', h],
    ];
    for (const [태그, x, y] of 점들) {
      const p = firstChildNamed(rect, 태그);
      if (p) { setAttr(p, 'x', x); setAttr(p, 'y', y); }
    }
  }

  // 어느 그림 파일을 가리키나
  const img = firstChildNamed(pic, 'hc:img');
  if (img) setAttr(img, 'binaryItemIDRef', 항목id);

  // 글 안에 놓는다 (treatAsChar=1) — 문단 정렬을 따르게
  const pos = firstChildNamed(pic, 'hp:pos');
  if (pos) setAttr(pos, 'treatAsChar', '1');

  // 원본 그림 이름이 적힌 주석은 우리 것이 아니니 비운다
  const 주석 = firstChildNamed(pic, 'hp:shapeComment');
  if (주석) removeNode(주석);
}

/** 한 번에 쓰는 통로 */
/**
 * 블록에 든 글에 **XML 이 못 쓰는 글자**가 있나 훑는다.
 *
 * 저장 길목이 잡아 주기는 한다. 그런데 그때는 「이 문서에 있다」 까지만 알고
 * **몇 번째 블록인지** 모른다 — 서른 블록을 짜 넣었으면 찾기 어렵다.
 * 짜기 전에 훑어 **어느 블록의 어느 자리**인지 짚어 준다.
 */
function 블록속나쁜글자(블록들: 블록[]): string | undefined {
  const 볼것 = (b: Record<string, unknown>, 자리: string): string | undefined => {
    for (const [열쇠, 값] of Object.entries(b)) {
      if (typeof 값 === 'string') {
        const 나쁜것 = 못쓰는제어문자(값);
        if (나쁜것) return `${자리}.${열쇠} 의 ${나쁜것.자리}번째 글자 ${나쁜것.글자}`;
        continue;
      }
      if (!Array.isArray(값)) continue;
      for (const [i, x] of 값.entries()) {
        if (typeof x === 'string') {
          const 나쁜것 = 못쓰는제어문자(x);
          if (나쁜것) return `${자리}.${열쇠}[${i}] 의 ${나쁜것.자리}번째 글자 ${나쁜것.글자}`;
        } else if (Array.isArray(x)) {
          for (const [j, y] of x.entries()) {
            if (typeof y !== 'string') continue;
            const 나쁜것 = 못쓰는제어문자(y);
            if (나쁜것) return `${자리}.${열쇠}[${i}][${j}] 의 ${나쁜것.자리}번째 글자 ${나쁜것.글자}`;
          }
        } else if (x && typeof x === 'object') {
          const r = 볼것(x as Record<string, unknown>, `${자리}.${열쇠}[${i}]`);
          if (r) return r;
        }
      }
    }
    return undefined;
  };
  for (const [i, b] of 블록들.entries()) {
    const r = 볼것(b as unknown as Record<string, unknown>, `blocks[${i}]`);
    if (r) return r;
  }
  return undefined;
}

export function 조판(
  d: 문서,
  블록들: 블록[],
  설정: 조판설정 = {},
  구역이름?: string,
): 결과<{ 만든것: 만든것[]; 문단수: number }> {
  // **짜기 전에 막는다.** 반쯤 짜 놓고 저장 길목에서 걸리면 문서가 어정쩡해진다.
  const 나쁜것 = 블록속나쁜글자(블록들)
    ?? (['header_text', 'footer_text'] as const)
      .map((k) => {
        const v = 설정[k];
        if (typeof v !== 'string') return undefined;
        const x = 못쓰는제어문자(v);
        return x ? `${k} 의 ${x.자리}번째 글자 ${x.글자}` : undefined;
      })
      .find((x) => x !== undefined);
  if (나쁜것) {
    return 안됨(
      `${나쁜것} 는 XML 이 못 쓰는 제어문자다`,
      '이 글자가 든 파일은 한글이 못 연다. 빼고 다시 줘라 (줄바꿈·탭은 써도 된다).',
    );
  }
  return new 조판기(d, 설정).쓰기(블록들, 구역이름);
}
