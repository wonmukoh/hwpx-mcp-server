/**
 * 문서 — 이 계층의 얼굴.
 *
 * 컨테이너(zip)·머리글(서식)·본문(구역)을 하나로 묶고,
 * **안정 ID** 로 요소를 가리키게 한다.
 *
 * ## 왜 ID 인가
 *
 * 지금 쓰는 MCP 는 `paragraphIndex: 12` 로 가리킨다.
 * 앞에 문단 하나를 넣으면 12번이 13번이 된다. 모델은 그걸 모르고 엉뚱한 곳을 고친다.
 *
 * 여기서는 노드 객체 자체에 ID 를 매긴다. 앞에 무엇을 넣든 **ID 가 안 밀린다.**
 *
 * ## 연산 기록
 *
 * 무엇을 했는지 남긴다. 나중에 "됐다는데 왜 안 바뀌었나" 를 따질 수 있어야 한다.
 * 실패한 것도 남긴다 — 실패를 안 남기면 조용한 실패가 된다.
 */

import { HwpxContainer, 부품 } from '@hwpx/container';
import {
  parseXml, serializeXml, serializeNode, findAll, getAttr, textOf,
  createElement, appendChild,
  type ElementNode, type XmlDocument, childrenNamed, removeNode, setText, 못쓰는제어문자,
} from '@hwpx/owpml';
import { 됨, 안됨, type 결과 } from './결과.js';
import { 이름표, 셀아이디, 셀아이디풀기 } from './식별자.js';
import { 머리글, type 글자모양패치, type 문단모양패치 } from './머리글.js';
import { 구역, 문단 } from './본문.js';
import { 표, 셀 } from './표.js';

export interface 연산기록 {
  무엇: string;
  대상?: string;
  됐나: boolean;
  말: string;
}

/** ID 로 가리킬 수 있는 것 */
export type 가리킨것 =
  | { 갈래: '문단'; 문단: 문단; 구역: 구역 }
  | { 갈래: '표'; 표: 표; 구역: 구역 }
  | { 갈래: '셀'; 셀: 셀; 표: 표; 구역: 구역 };

export class 문서 {
  private readonly 구역doc = new Map<string, XmlDocument>();
  readonly 이름표 = new 이름표();
  readonly 기록: 연산기록[] = [];

  /**
   * 열 때 **이미 있던** 흠.
   *
   * 저장을 막을 때 우리가 낸 것만 막으려고 찍어 둔다.
   * 남이 만든 문서에도 흠이 있다 — 161편을 훑으니 표 기하만 64건 나왔고,
   * 교육부 문서에도 '셀 폭과 열 폭 합이 다르다' 가 있다.
   * 그걸 이유로 **열고 그대로 저장하는 것까지 막으면 쓸 수 없는 도구**가 된다.
   *
   * 그래서 재는 것은 흠의 있고 없고가 아니라 **늘었나**다.
   */
  private 처음탈: ReadonlySet<string> = new Set();

  private constructor(
    private readonly 통: HwpxContainer,
    readonly 머리: 머리글,
  ) {}

  private static 찍어서(통: HwpxContainer): 문서 {
    const d = new 문서(통, new 머리글(통.readText(부품.header)));
    d.처음탈 = new Set(d.검사());
    return d;
  }

  static 열기(바이트: Buffer): 문서 {
    return 문서.찍어서(HwpxContainer.open(바이트));
  }

  /** 빈 문서. 템플릿은 한글이 저장한 것 그대로다 */
  static 새로(): 문서 {
    return 문서.찍어서(HwpxContainer.빈문서());
  }

  // ── 구역 ────────────────────────────────────────────────────────────────

  get 구역이름들(): string[] {
    return this.통.sectionNames();
  }

  구역(이름: string): 구역 {
    let doc = this.구역doc.get(이름);
    if (!doc) {
      doc = parseXml(this.통.readText(이름));
      this.구역doc.set(이름, doc);
    }
    return new 구역(doc.root, 이름, doc.source);
  }

  get 구역들(): 구역[] {
    return this.구역이름들.map((n) => this.구역(n));
  }

  // ── ID 로 가리키기 ──────────────────────────────────────────────────────

  /**
   * 문서를 훑어 ID 를 매긴다.
   *
   * 부르지 않으면 ID 가 없다 — 게으르게 매기면 `문단들()` 을 부른 순서에 따라
   * ID 가 달라져서 헷갈린다. 한 번에 매기고 그 뒤로는 안 바뀐다.
   */
  ID매기기(): { 문단: number; 표: number } {
    let 문단수 = 0, 표수 = 0;
    for (const s of this.구역들) {
      for (const p of s.모든문단들) { this.이름표.아이디(p.el); 문단수++; }
      for (const t of s.표들) { this.이름표.아이디(t); 표수++; }
    }
    return { 문단: 문단수, 표: 표수 };
  }

  /**
   * ID 로 찾는다. 셀 ID(`cell_xxx_0_2`)는 표에서 계산해 준다.
   *
   * 못 찾으면 **무엇이 있는지 몇 개 보여 준다.** 그냥 "없다" 만 하면
   * 모델이 같은 실수를 되풀이한다.
   */
  찾기(id: string): 결과<가리킨것> {
    // 모델이 주는 값이다 — 글이 아닐 수도 있다. 여기서 터지면 서버가 통째로 죽는다.
    if (typeof id !== 'string' || id.length === 0) {
      return 안됨(`ID 가 글이 아니다 (${typeof id})`, 'get_outline 이나 find 가 돌려준 id 를 그대로 써라.');
    }
    const 셀주소 = 셀아이디풀기(id);
    if (셀주소) {
      const 표것 = this.찾기(셀주소.표아이디);
      if (!표것.ok) return 표것;
      if (표것.value.갈래 !== '표') {
        return 안됨(`${셀주소.표아이디} 는 표가 아니다`, '셀은 표 안에만 있다.');
      }
      const t = 표것.value.표;
      const c = t.셀(셀주소.row, 셀주소.col);
      if (!c) {
        return 안됨(
          `${id} — 그 자리에 셀이 없다 (표는 ${t.줄수}줄 ${t.칸수}칸이다)`,
          `줄은 0~${t.줄수 - 1}, 칸은 0~${t.칸수 - 1} 이다.`,
        );
      }

      // **덮인 자리는 칸이 아니다.**
      //
      // 합친 칸이 있으면 그 아래·옆 자리는 눈에만 있고 실체가 없다.
      // 전에는 덮는 칸을 그대로 돌려줘서 — 같은 글이 두 자리에 있는 것처럼 보이고,
      // 거기 글을 쓰면 「이미 같은 글이라 바뀐 것이 없다」 는 알 수 없는 말이 났다.
      // 어느 칸을 가리켜야 하는지 짚어 준다.
      const 자리 = c.자리;
      if (자리.row !== 셀주소.row || 자리.col !== 셀주소.col) {
        const 덮는것 = 셀아이디(셀주소.표아이디, 자리.row, 자리.col);
        return 안됨(
          `${id} 는 **덮인 자리**다 — (${자리.row},${자리.col}) 칸이 `
          + `${자리.rowSpan}줄 ${자리.colSpan}칸을 덮고 있다`,
          `${덮는것} 을 써라. 합친 칸은 시작 자리로만 가리킨다.`,
        );
      }
      return 됨({ 갈래: '셀', 셀: c, 표: t, 구역: 표것.value.구역 });
    }

    const node = this.이름표.노드(id);
    if (!node) {
      const 몇개 = [...this.이름표.같은종류(id.split('_')[0] ?? '')].slice(0, 5);
      return 안됨(
        `${id} 를 못 찾았다`,
        몇개.length
          ? `같은 갈래로 있는 것: ${몇개.join(', ')}…`
          : 'get_outline 이나 find 로 지금 문서의 ID 를 다시 받아라. '
            + '문서를 다시 열면 ID 도 새로 매겨진다.',
      );
    }

    const s = this.구역들.find((x) => 안에있나(x.root, node));
    if (!s) {
      return 안됨(`${id} 가 어느 구역에도 없다 (지워진 것 같다)`, 'ID 를 다시 매겨라.');
    }

    if (node.name === 'hp:tbl') return 됨({ 갈래: '표', 표: new 표(node), 구역: s });
    if (node.name === 'hp:p') return 됨({ 갈래: '문단', 문단: new 문단(node, s.source), 구역: s });
    return 안됨(`${id} 는 다룰 수 있는 것이 아니다 (${node.name})`, '문단·표·셀만 가리킬 수 있다.');
  }

  /** 문단 ID 로 문단만 */
  문단찾기(id: string): 결과<문단> {
    const r = this.찾기(id);
    if (!r.ok) return r;
    if (r.value.갈래 === '문단') return 됨(r.value.문단);
    if (r.value.갈래 === '셀') {
      const 첫문단 = findAll(r.value.셀.subList, 'hp:p')[0];
      if (첫문단) return 됨(new 문단(첫문단, r.value.구역.source));
      return 안됨(`${id} 셀 안에 문단이 없다`, '깨진 셀이다.');
    }
    return 안됨(`${id} 는 문단이 아니다 (${r.value.갈래})`, '문단 ID 를 줘라.');
  }

  /**
   * **칸 안의 문단들을 다 준다.**
   *
   * `문단찾기` 는 칸을 주면 **첫 문단만** 집는다. 그게 조용한 반쪽 쓰기를 만들었다 —
   * 한 칸에 문단이 둘인 양식에서 칸에 글을 넣으면 첫 줄만 갈리고
   * 둘째 줄은 그대로 남았다. 그래 놓고 "1곳이 바뀌었다" 고 말했다.
   *
   * 실제 계획서 양식에 그런 칸이 4개 있었다.
   */
  칸문단들(id: string): 결과<문단[]> {
    const r = this.찾기(id);
    if (!r.ok) return r;
    if (r.value.갈래 !== '셀') {
      return 안됨(`${id} 는 칸이 아니다 (${r.value.갈래})`, 'cell_… 꼴의 ID 를 줘라.');
    }
    const 것들 = findAll(r.value.셀.subList, 'hp:p')
      .map((p) => new 문단(p, r.value.구역.source));
    if (!것들.length) return 안됨(`${id} 칸 안에 문단이 없다`, '깨진 셀이다.');
    return 됨(것들);
  }

  /**
   * **칸 글을 통째로 간다.** 줄바꿈으로 문단을 가른다.
   *
   * 남는 문단은 **비운다** — 안 비우면 옛 글이 뒤에 남는다.
   * 줄이 문단보다 많으면 **거절한다.** 말없이 합치면 줄이 사라진 줄도 모른다.
   */
  칸글바꾸기(id: string, 새글: string): 결과<{ 바뀐수: number; 잃은서식: number }> {
    const 것들 = this.칸문단들(id);
    if (!것들.ok) return this.남기기('칸글바꾸기', id, 것들);
    const 줄들 = 새글.split('\n');
    if (줄들.length > 것들.value.length) {
      return this.남기기('칸글바꾸기', id, 안됨(
        `${id} 에는 문단이 ${것들.value.length}개인데 ${줄들.length}줄을 줬다`,
        '줄을 줄이거나, 문단마다 따로 set_text 를 불러라. '
        + `get_content(id: "${id}") 로 문단 ID 를 볼 수 있다.`,
      ));
    }
    let 바뀐수 = 0;
    let 잃은서식 = 0;
    for (const [i, p] of 것들.value.entries()) {
      const 넣을것 = 줄들[i] ?? '';
      if (p.글 === 넣을것) continue;   // 이미 같으면 안 건드린다
      const r = p.글바꾸기(넣을것);
      if (!r.ok) return this.남기기('칸글바꾸기', id, r);
      바뀐수 += r.value.바뀐수;
      잃은서식 += r.value.잃은서식;
    }
    if (바뀐수 === 0) {
      return this.남기기('칸글바꾸기', id, 안됨(
        '이미 같은 글이라 바뀐 것이 없다',
        '다른 글을 주거나, 지금 글을 먼저 읽어 보라.',
      ));
    }
    return this.남기기('칸글바꾸기', id, 됨({ 바뀐수, 잃은서식 }));
  }

  /** 표의 셀 ID 를 만든다 */
  셀아이디(표아이디: string, row: number, col: number): string {
    return 셀아이디(표아이디, row, col);
  }

  // ── 고치기 ──────────────────────────────────────────────────────────────

  글바꾸기(id: string, 새글: string): 결과<{ 바뀐수: number; 잃은서식: number }> {
    const p = this.문단찾기(id);
    if (!p.ok) return this.남기기('글바꾸기', id, p);
    const r = p.value.글바꾸기(새글);
    if (r.ok && r.value.바뀐수 === 0) {
      return this.남기기('글바꾸기', id, 안됨(
        '이미 같은 글이라 바뀐 것이 없다',
        '다른 글을 주거나, 지금 글을 먼저 읽어 보라.',
      ));
    }
    return this.남기기('글바꾸기', id, r);
  }

  /** 글자 서식. 스타일은 복제·지문 대조를 거친다 */
  글자서식주기(id: string, 패치: 글자모양패치): 결과<{ charPrId: string; 바뀐수: number }> {
    const p = this.문단찾기(id);
    if (!p.ok) return this.남기기('글자서식주기', id, p);

    const 지금 = p.value.글자모양들[0] ?? '0';
    const 확보 = this.머리.charPr확보(지금, 패치);
    if (!확보.ok) return this.남기기('글자서식주기', id, 확보);

    const r = p.value.글자모양주기(확보.value.id);
    if (!r.ok) return this.남기기('글자서식주기', id, r);
    return this.남기기('글자서식주기', id, 됨({ charPrId: 확보.value.id, 바뀐수: r.value.바뀐수 }));
  }

  /** 문단 서식 (정렬·여백·줄간격) */
  문단서식주기(id: string, 패치: 문단모양패치): 결과<{ paraPrId: string }> {
    const p = this.문단찾기(id);
    if (!p.ok) return this.남기기('문단서식주기', id, p);

    const 확보 = this.머리.paraPr확보(p.value.문단모양, 패치);
    if (!확보.ok) return this.남기기('문단서식주기', id, 확보);
    if (확보.value.id === p.value.문단모양) {
      return this.남기기('문단서식주기', id, 안됨(
        '이미 그 서식이라 바뀐 것이 없다',
        '다른 값을 주거나, 지금 서식을 먼저 확인하라.',
      ));
    }
    p.value.문단모양주기(확보.value.id);
    return this.남기기('문단서식주기', id, 됨({ paraPrId: 확보.value.id }));
  }

  /** 문단 안 어구만 강조 */
  강조하기(id: string, 찾을글: string, 패치: 글자모양패치): 결과<{ 바뀐수: number }> {
    const p = this.문단찾기(id);
    if (!p.ok) return this.남기기('강조하기', id, p);

    const 지금 = p.value.글자모양들[0] ?? '0';
    const 확보 = this.머리.charPr확보(지금, 패치);
    if (!확보.ok) return this.남기기('강조하기', id, 확보);

    return this.남기기('강조하기', id, p.value.강조하기(찾을글, 확보.value.id));
  }

  /**
   * **구역을 하나 더 낸다.**
   *
   * 실측: 문서 161편 가운데 10편(6%)이 구역을 나눈다.
   * 표지와 본문의 쪽 설정이 다를 때, 가로·세로가 섞일 때 쓴다.
   *
   * 네 가지를 **다** 해야 한다. 하나라도 빠지면 한글이 새 구역을 통째로 버린다:
   *   1. `Contents/sectionN.xml` 부품 (부품 차례도 맞춘다)
   *   2. manifest 의 `<opf:item>`
   *   3. manifest `<opf:spine>` 안의 `<opf:itemref>`
   *   4. **`header.xml` 의 `<hh:head secCnt>`** ← 이것 하나에 오래 걸렸다
   *
   * 넷째를 찾는 데 한나절이 걸렸다. 1~3 을 다 맞추고 기준 파일과
   * manifest·부품 차례·settings 를 하나씩 대 봐도 전부 같았다.
   * 기준 파일에 우리 부품을 하나씩 바꿔 끼워 보고서야 `header.xml` 이 나왔다.
   * **한글은 `secCnt` 를 믿고 그만큼만 읽는다** (실측 14장).
   *
   * 새 구역의 뼈대는 **지금 마지막 구역에서 뜬다** — 맨땅에서 짜지 않는다.
   * 쪽 설정(`hp:secPr`)이 딸려 와야 한글이 열 수 있다. 글은 비운다.
   */
  /**
   * **글에 하이퍼링크를 건다.**
   *
   * `강조하기` 처럼 문단에서 글을 찾아 그 자리에 건다. 짜임은 `본문.ts` 의
   * `링크걸기` 에 적어 뒀다 — 런 셋이고 id 로 짝을 맺는다.
   *
   * **id 는 문서 전체에서 안 겹쳐야 한다.** 겹치면 한글이 `fieldEnd` 를 엉뚱한
   * `fieldBegin` 에 맺어, 링크가 딴 데서 끊기거나 문서 끝까지 이어진다.
   * 그래서 지금 문서에 있는 id 를 다 모아 놓고 안 겹치는 것을 고른다.
   */
  링크걸기(id: string, 찾을글: string, 주소: string): 결과<{ 바뀐수: number }> {
    const p = this.문단찾기(id);
    if (!p.ok) return this.남기기('링크걸기', id, p);

    const 둘 = this.다음아이디들(2);
    return this.남기기('링크걸기', id, p.value.링크걸기(찾을글, 주소, (n) => 둘[n]!));
  }

  /**
   * **책갈피를 단다.**
   *
   * 하이퍼링크가 갈 곳이고, 목차에서도 쓴다. 요소 하나라 짝이 없다.
   *
   * **이름이 문서 안에서 겹치면 안 된다.** 겹치면 한글이 뒤엣것으로 간다 —
   * 앞엣것을 가리키던 링크가 조용히 딴 데로 간다. 여기서 막는다.
   */
  책갈피달기(id: string, 이름: string): 결과<{ 이름: string }> {
    const p = this.문단찾기(id);
    if (!p.ok) return this.남기기('책갈피달기', id, p);

    const 다듬 = 이름.trim();
    if (this.책갈피들.includes(다듬)) {
      return this.남기기('책갈피달기', id, 안됨(
        `'${다듬}' 책갈피가 이 문서에 이미 있다`,
        '이름이 겹치면 한글이 뒤엣것으로 간다 — 앞엣것을 가리키던 링크가 딴 데로 간다. '
        + '다른 이름을 줘라.',
      ));
    }
    return this.남기기('책갈피달기', id, p.value.책갈피달기(다듬));
  }

  /** 문서 전체의 책갈피 이름들 */
  get 책갈피들(): string[] {
    return this.구역들
      .flatMap((s) => findAll(s.root, 'hp:bookmark'))
      .map((e) => getAttr(e, 'name'))
      .filter((v): v is string => v !== undefined);
  }

  /** 문서 전체의 하이퍼링크 주소들 */
  get 링크들(): string[] {
    return this.구역들.flatMap((s) => s.모든문단들).flatMap((p) => p.링크들);
  }

  /**
   * 지금 문서가 쓰고 있는 밭(field) id 들.
   *
   * `@id` 와 `@fieldid` 를 **둘 다** 모은다. 둘은 다른 이름이지만 같은 우물에서
   * 뽑는 것으로 보이고, 어느 쪽이 겹쳐도 짝이 어긋난다.
   */
  private 쓰인아이디들(): Set<string> {
    const 것 = new Set<string>();
    for (const s of this.구역들) {
      // 밭(링크·메모)과 **주·수식·도형**이 같은 우물을 쓴다.
      // `instId`(주)와 `instid`(도형)는 대소문자가 다르다 — 한글이 그렇게 쓴다.
      for (const 이름 of ['hp:fieldBegin', 'hp:fieldEnd', 'hp:footNote', 'hp:endNote',
        'hp:equation', 'hp:rect', 'hp:ellipse', 'hp:polygon', 'hp:pic']) {
        for (const e of findAll(s.root, 이름)) {
          for (const 키 of ['id', 'fieldid', 'beginIDRef', 'instId', 'instid']) {
            const v = getAttr(e, 키);
            if (v !== undefined) 것.add(v);
          }
        }
      }
    }
    return 것;
  }

  /**
   * **각주·미주를 단다.**
   *
   * 번호는 우리가 센다 — 문서에 이미 달린 같은 갈래의 주 수 + 1 이다.
   * 한글은 열 때 제가 다시 매기지만, **틀린 번호를 적어 두면 저장 전에 읽는
   * 쪽**(우리 `get_content`·render)이 거짓말을 하게 된다.
   *
   * 주석 칸의 문단·글자 모양은 **한글이 쓰는 「각주」·「미주」 스타일**을 찾아
   * 쓴다. 없으면 0 번(바탕글)으로 간다 — 글은 제자리에 들어가고 생김새만 밋밋하다.
   */
  주달기(id: string, 내용: string, 갈래: '각주' | '미주', 찾을글?: string):
  결과<{ 갈래: '각주' | '미주'; 번호: number }> {
    const p = this.문단찾기(id);
    if (!p.ok) return this.남기기('주달기', id, p);

    const 태그 = 갈래 === '각주' ? 'hp:footNote' : 'hp:endNote';
    const 이미 = this.구역들.reduce((n, s) => n + findAll(s.root, 태그).length, 0);
    const 서식 = this.머리.스타일찾기(갈래, 갈래 === '각주' ? 'Footnote' : 'Endnote');
    return this.남기기('주달기', id, p.value.주달기({
      갈래, 내용, 번호: 이미 + 1,
      instId: this.다음아이디들(1)[0]!,
      ...(찾을글 !== undefined ? { 찾을글 } : {}),
      ...서식,
    }));
  }

  /** 문서 전체의 주들 */
  get 주들(): { 갈래: '각주' | '미주'; 번호: string; 글: string }[] {
    return this.구역들.flatMap((s) => s.모든문단들).flatMap((p) => p.주들);
  }

  /**
   * **메모를 단다.**
   *
   * 메모는 본문에 안 찍힌다 — 화면과 「메모 보기」에만 보인다. 그래서 초안에
   * 「여기 숫자 확인」 같은 말을 남겨 두는 데 쓴다.
   *
   * **지은이 기본값을 사람 이름으로 안 둔다.** 한글은 윈도 계정 이름을 넣는데,
   * 그 문서를 남에게 보내면 계정 이름이 같이 간다. 부르는 쪽이 정하게 하고
   * 기본은 도구 이름으로 둔다.
   */
  메모달기(id: string, 찾을글: string, 내용: string, 지은이 = 'hwpx-mcp'):
  결과<{ 바뀐수: number }> {
    const p = this.문단찾기(id);
    if (!p.ok) return this.남기기('메모달기', id, p);

    const 이미 = this.구역들.reduce(
      (n, s) => n + findAll(s.root, 'hp:fieldBegin')
        .filter((e) => getAttr(e, 'type') === 'MEMO').length, 0);
    const 둘 = this.다음아이디들(2);
    const 서식 = this.머리.스타일찾기('메모', 'Memo');
    return this.남기기('메모달기', id, p.value.메모달기({
      내용, 찾을글, 번호: 이미 + 1,
      시작id: 둘[0]!, 밭id: 둘[1]!,
      지은이,
      때: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      ...서식,
    }));
  }

  /** 문서 전체의 메모들 */
  get 메모들(): { 글: string; 지은이: string }[] {
    return this.구역들.flatMap((s) => s.모든문단들).flatMap((p) => p.메모들);
  }

  /**
   * **수식을 넣는다.**
   *
   * 식은 한글 수식 스크립트다 — `{a} over {b}`, `x^2`, `sqrt{2}`, `SIGMA`.
   * 빈칸은 `` ` `` 두 개로 쓴다 (실측: 교육부 기본계획이 그렇게 쓰고 있다).
   */
  수식넣기(id: string, 식: string, 찾을글?: string): 결과<{ 바뀐수: number }> {
    const p = this.문단찾기(id);
    if (!p.ok) return this.남기기('수식넣기', id, p);
    return this.남기기('수식넣기', id, p.value.수식넣기({
      식, instId: this.다음아이디들(1)[0]!,
      ...(찾을글 !== undefined ? { 찾을글 } : {}),
    }));
  }

  /** 문서 전체의 수식들 */
  get 수식들(): string[] {
    return this.구역들.flatMap((s) => s.모든문단들).flatMap((p) => p.수식들);
  }

  /**
   * **문단에 개요 수준을 준다.** 0 이면 끈다.
   *
   * 문단모양 하나를 갈아 끼우는 일이라 `문단서식주기` 와 같은 길로 간다.
   */
  개요수준주기(id: string, 수준: number): 결과<{ paraPrId: string }> {
    if (!Number.isInteger(수준) || 수준 < 0 || 수준 > 10) {
      return this.남기기('개요수준주기', id, 안됨(
        `개요 수준이 이상하다: ${수준}`,
        '0(끔)부터 10 사이의 정수를 줘라. 한글이 지고 있는 수준이 열 벌이다.',
      ));
    }
    return this.문단서식주기(id, { 개요수준: 수준 });
  }

  /**
   * **단을 나눈다.** `구역이름` 을 안 주면 **모든 구역**에 준다.
   *
   * 쪽 테두리(`set_page`)와 같은 결이다 — 한 구역만 바꾸면 뒤 구역에서
   * 조용히 한 단으로 돌아가 있어, 두 쪽짜리 문서가 반만 두 단이 된다.
   */
  단주기(단수: number, 간격?: number, 구역이름?: string):
  결과<{ 구역수: number; 단수: number; 간격: number }> {
    const 것들 = 구역이름 === undefined
      ? this.구역들
      : this.구역들.filter((s) => s.이름 === 구역이름);
    if (것들.length === 0) {
      return this.남기기('단주기', 구역이름 ?? '', 안됨(
        구역이름 === undefined ? '구역이 하나도 없다' : `${구역이름} 구역이 없다`,
        `있는 구역: ${this.구역이름들.join(', ')}`,
      ));
    }
    let 됐수 = 0;
    let 마지막: 결과<{ 단수: number; 간격: number }> | undefined;
    for (const s of 것들) {
      const r = s.단주기(단수, 간격);
      마지막 = r;
      if (r.ok) 됐수++;
    }
    if (됐수 === 0) {
      return this.남기기('단주기', 구역이름 ?? '', 마지막 !== undefined && !마지막.ok
        ? 마지막
        : 안됨('단을 못 나눴다', '구역을 다시 보라.'));
    }
    return this.남기기('단주기', 구역이름 ?? '', 됨({
      구역수: 됐수, 단수, 간격: 간격 ?? (단수 === 1 ? 0 : 2268),
    }));
  }

  /**
   * **바탕쪽에 글을 놓는다.** 모든 쪽 뒤에 깔린다 (워터마크·양식 테두리).
   *
   * ## 바탕쪽은 `hp:secPr` 안에 있는 것이 아니다
   *
   * 규격 문서(HWPML 5.2.6)는 `MASTERPAGE` 의 부모가 `SECDEF` 라고 적어 뒀다.
   * 그대로 `hp:secPr` 안에 넣었더니 **한글이 파일을 아예 못 열었다.** 자리를
   * 다섯 가지로 바꿔 봐도 같았고, `masterPageCnt="1"` 만 세우고 요소를 아예 안
   * 넣어도 못 열었다 — 한글은 그 수만큼 **딴 데서** 찾고 있었던 것이다.
   *
   * 한글에 직접 만들게 해 보고서야 보였다 (`자료/실측.md` 32항):
   *
   *     Contents/masterpage0.xml   ← 부품이 하나 더 생긴다
   *       <masterPage id="masterpage0" type="BOTH" pageNumber="0"
   *                   pageDuplicate="0" pageFront="0">
   *         <hp:subList textWidth="…" textHeight="…"> <hp:p>…</hp:p> </hp:subList>
   *
   *     Contents/section0.xml
   *       <hp:secPr masterPageCnt="1"> … <hp:masterPage idRef="masterpage0"/> </hp:secPr>
   *
   *     Contents/content.hpf
   *       <opf:item id="masterpage0" href="Contents/masterpage0.xml" …/>   (spine 엔 안 넣는다)
   *
   * 셋을 다 해야 한다. 부품만 내고 안 가리키면 한글이 무시하고, 가리키기만 하고
   * 부품이 없으면 **문서를 못 연다.**
   *
   * ## 글 자리 크기는 재서 넣는다
   *
   * `hp:subList` 의 `textWidth`·`textHeight` 는 본문이 놓이는 자리다.
   * 실측한 값과 맞춰 봤다:
   *
   *     textWidth  = 용지 너비 − 왼쪽 − 오른쪽                    42520
   *     textHeight = 용지 높이 − 위 − 아래 − 머리말 − 꼬리말       65762
   *
   * ## 이름공간은 구역에서 뜬다
   *
   * `<masterPage>` 는 **접두사가 없는** 뿌리인데 안쪽은 `hp:` 를 쓴다. 그래서
   * 이름공간 선언이 열넷 다 있어야 한다. 손으로 적지 않고 **구역 뿌리에서 뜬다** —
   * 한글이 저장한 그 목록 그대로다.
   */
  바탕쪽주기(글: string, 구역이름?: string): 결과<{ id: string; 구역수: number }> {
    const 것들 = 구역이름 === undefined
      ? this.구역들
      : this.구역들.filter((s) => s.이름 === 구역이름);
    if (것들.length === 0) {
      return this.남기기('바탕쪽주기', 구역이름 ?? '', 안됨(
        구역이름 === undefined ? '구역이 하나도 없다' : `${구역이름} 구역이 없다`,
        `있는 구역: ${this.구역이름들.join(', ')}`,
      ));
    }

    // **구역마다 부품을 따로 낸다.** 둘이 같은 것을 가리키게 했더니 **한글이
    // 죽었다** — 못 여는 것보다 나쁘다. 한글도 구역마다 하나씩 낸다.
    let 첫id: string | undefined;
    let 됐수 = 0;
    let 마지막: 결과<{ idRef: string }> | undefined;
    for (const s of 것들) {
      const 문단 = s.바탕쪽문단(글);
      if (!문단.ok) return this.남기기('바탕쪽주기', s.이름, 문단);

      const 크기 = s.용지크기;
      const 여백 = s.쪽여백;
      if (크기 === undefined || 여백 === undefined) {
        return this.남기기('바탕쪽주기', s.이름, 안됨(
          `${s.이름} 의 용지 크기나 여백을 못 읽었다`,
          '한글이 만든 문서라면 늘 있다. 깨진 문서다.',
        ));
      }
      // 구역마다 용지·여백이 다를 수 있다 — **그 구역 것으로** 잰다
      const 글너비 = 크기.너비 - (여백['left'] ?? 0) - (여백['right'] ?? 0);
      const 글높이 = 크기.높이 - (여백['top'] ?? 0) - (여백['bottom'] ?? 0)
        - (여백['header'] ?? 0) - (여백['footer'] ?? 0);

      // **부품을 먼저 낸다.** 가리키기부터 하면, 부품 내기가 실패했을 때
      // 「가리키는데 없는」 문서가 남는다 — 그 문서는 한글이 못 연다.
      const 미리id = `masterpage${this.통.바탕쪽이름들().length}`;
      const xml = 바탕쪽XML(s.root, 미리id, 글너비, 글높이, 문단.value);
      const 낸것 = this.통.바탕쪽더하기(xml, s.이름);
      if (낸것.id !== 미리id) {
        // 번호를 잘못 짚었으면 안쪽 id 를 고쳐 다시 쓴다 (이름이 어긋나면 안 열린다)
        this.통.writeText(낸것.이름, xml.replace(`id="${미리id}"`, `id="${낸것.id}"`));
      }
      첫id ??= 낸것.id;

      const r = s.바탕쪽걸기(낸것.id);
      마지막 = r;
      if (r.ok) 됐수++;
    }
    if (됐수 === 0 || 첫id === undefined) {
      return this.남기기('바탕쪽주기', 구역이름 ?? '', 마지막 !== undefined && !마지막.ok
        ? 마지막
        : 안됨('바탕쪽을 못 걸었다', '구역을 다시 보라.'));
    }
    return this.남기기('바탕쪽주기', 구역이름 ?? '', 됨({ id: 첫id, 구역수: 됐수 }));
  }

  /** 문서에 든 바탕쪽 글들 */
  get 바탕쪽들(): string[] {
    return this.통.바탕쪽이름들().map((n) => {
      const doc = parseXml(this.통.readText(n));
      return findAll(doc.root, 'hp:t').map((t) => textOf(t)).join('').trim();
    });
  }

  /**
   * **안 겹치는 식별자를 개수만큼 낸다.**
   *
   * 링크·메모·주·수식이 다 이 우물에서 뽑는다. `id`·`fieldid`·`beginIDRef` 에
   * 더해 **`instId`·`instid` 까지** 센다 — 도형과 주가 같은 우물을 쓰는 것으로
   * 보이고, 어느 쪽이 겹쳐도 한글이 짝을 잘못 맺는다.
   *
   * **아무 수나 뽑지 않는다.** 20억 중 하나를 뽑으면 우연히도 안 겹치니,
   * 「겹침을 막는다」 는 코드가 있으나 없으나 똑같이 통과한다 — 재는 것이
   * 아무것도 안 보게 된다. 바닥 10억은 한글이 쓰는 것과 자리수를 맞춘 것이다.
   */
  private 다음아이디들(개수: number): string[] {
    let 다음 = 1_000_000_000;
    for (const v of this.쓰인아이디들()) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 다음) 다음 = n + 1;
    }
    return Array.from({ length: 개수 }, (_, i) => String(다음 + i));
  }

  /**
   * **문단을 지운다.**
   *
   * 넣는 길은 있는데 빼는 길이 없었다. 양식에 안 쓰는 항목이 남아도 지울 수가
   * 없어서 문서를 통째로 다시 짜야 했다 — 줄·칸에서 겪은 것과 같은 짝 안 맞음이다.
   *
   * 막는 것 셋 —
   *
   *   - **구역의 마지막 문단은 못 지운다.** 문단 없는 구역은 한글이 안 연다.
   *   - **칸 안의 마지막 문단도 못 지운다.** 빈 칸도 문단 하나는 있어야 한다.
   *   - **표·그림이 든 문단은 못 지운다.** 문단만 지우는 줄 알고 불렀다가
   *     표가 통째로 날아가면 되돌릴 길이 없다. 표를 먼저 지우게 한다.
   *
   * 글이 든 문단은 기본으로 막는다. 정말 지우려면 `비어야만: false` 로 부른다 —
   * `줄지우기` 와 같은 규칙이다.
   */
  문단지우기(id: string, 비어야만 = true): 결과<{ 지운글자: number }> {
    const 것 = this.찾기(id);
    if (!것.ok) return this.남기기('문단지우기', id, 것);
    if (것.value.갈래 !== '문단') {
      return this.남기기('문단지우기', id, 안됨(
        `${id} 는 문단이 아니다 (${것.value.갈래})`,
        것.value.갈래 === '표' ? '표는 표지우기로 지운다.' : '문단 ID(p_…)를 줘라.',
      ));
    }
    const p = 것.value.문단;

    // **쪽 설정이 든 문단은 절대 못 지운다.**
    //
    // 구역의 **첫 문단**이 `hp:secPr` 를 담고 있다 — 용지 크기·여백·쪽 번호가
    // 다 거기 있다. 그 문단은 대개 글이 비어 있어서 「빈 문단이니 지워도 되겠지」로
    // 지워진다. 재 봤더니 `ref-text-basic` 에서 실제로 지워졌고,
    // **용지크기가 undefined 가 됐는데 `검사()` 는 탈이 없다고 했다.**
    //
    // 표·그림과 달리 이건 `force` 로도 안 연다. 되돌릴 길이 없고,
    // 「빈 문단을 지웠을 뿐」이라 무엇이 사라졌는지 아무도 모른다.
    if (findAll(p.el, 'hp:secPr').length > 0) {
      return this.남기기('문단지우기', id, 안됨(
        `${id} 는 구역의 쪽 설정(hp:secPr)을 담고 있다`,
        '용지 크기·여백·쪽 번호가 그 안에 있다. 지우면 문서가 쪽 설정을 잃는다. '
        + '글만 비우려면 set_text 로 빈 글을 넣어라.',
      ));
    }

    // 표·그림이 딸려 있나. **딸려 지우면 안 된다** — 무엇이 사라지는지 말해 준다.
    const 안것 = ['hp:tbl', 'hp:pic', 'hp:container', 'hp:equation']
      .flatMap((n) => findAll(p.el, n).map((e) => e.name));
    if (안것.length > 0) {
      const 셈 = [...new Set(안것)].map((n) => `${n} ${안것.filter((x) => x === n).length}개`);
      return this.남기기('문단지우기', id, 안됨(
        `${id} 안에 ${셈.join(' · ')} 가 들어 있다`,
        '문단만 지우려다 그것들이 같이 날아간다. 표라면 표지우기로 먼저 지워라.',
      ));
    }

    const 글 = p.글;
    if (비어야만 && 글.trim() !== '') {
      return this.남기기('문단지우기', id, 안됨(
        `${id} 에 글이 있다 («${글.slice(0, 20)}»)`,
        '정말 지우려면 force 를 켜라. 빈 문단이 남는 것보다 글을 날리는 것이 훨씬 나쁘다.',
      ));
    }

    // 마지막 하나인가 — 구역이든 칸이든
    const 부모 = p.el.parent as ElementNode | undefined;
    if (부모 === undefined) {
      return this.남기기('문단지우기', id, 안됨(`${id} 가 어디에도 안 붙어 있다`, 'ID 를 다시 매겨라.'));
    }
    if (childrenNamed(부모, 'hp:p').length <= 1) {
      const 어디 = 부모.name === 'hp:subList' ? '칸' : '구역';
      return this.남기기('문단지우기', id, 안됨(
        `${id} 는 그 ${어디}의 마지막 문단이다`,
        `문단 없는 ${어디}은 한글이 안 연다. 글만 비우려면 set_text 로 빈 글을 넣어라.`,
      ));
    }

    removeNode(p.el);
    this.이름표.버리기(id);
    return this.남기기('문단지우기', id, 됨({ 지운글자: 글.length }));
  }

  /**
   * **표를 통째로 지운다.**
   *
   * 표는 `hp:p > hp:run > hp:tbl` 로 들어 있다. 표만 빼면 **빈 런과 빈 문단**이
   * 남아 문서에 빈 줄이 생긴다. 그래서 비게 된 런과 문단까지 걷어낸다 —
   * 다만 **그 문단이 마지막 하나면 문단은 남긴다.** 빈 구역·빈 칸은 한글이 안 연다.
   *
   * 글이 든 표는 기본으로 막는다. `줄지우기`·`문단지우기` 와 같은 규칙이다.
   */
  표지우기(id: string, 비어야만 = true): 결과<{ 지운칸: number; 빈문단도지웠나: boolean }> {
    const 것 = this.찾기(id);
    if (!것.ok) return this.남기기('표지우기', id, 것);
    if (것.value.갈래 !== '표') {
      return this.남기기('표지우기', id, 안됨(
        `${id} 는 표가 아니다 (${것.value.갈래})`, '표 ID(tbl_…)를 줘라.',
      ));
    }
    const t = 것.value.표;
    const 칸수 = t.셀들.length;

    if (비어야만) {
      // **글 뽑기를 손으로 하지 않는다.** `hp:t` 의 자식은 `{text}` 가 아니라
      // `{kind,start,end,raw}` 라, 직접 훑으면 늘 빈 글이 나온다 — 그러면
      // 글이 든 표도 「비었다」 로 보고 그냥 지운다. 있는 길(`textOf`)을 쓴다.
      const 든글 = t.셀들
        .flatMap((c) => findAll(c.el, 'hp:t').map((x) => textOf(x)))
        .join('').trim();
      if (든글 !== '') {
        return this.남기기('표지우기', id, 안됨(
          `${id} 에 글이 있다 («${든글.slice(0, 20)}»)`,
          '정말 지우려면 force 를 켜라.',
        ));
      }
    }

    // 표를 담은 런과 문단을 찾아 올라간다
    const 런 = t.el.parent as ElementNode | undefined;
    const 문단el = 런?.parent as ElementNode | undefined;

    removeNode(t.el);
    this.이름표.버리기(id);

    let 빈문단도지웠나 = false;
    if (런 !== undefined && 런.name === 'hp:run' && 런빈것인가(런)) {
      const 문단부모 = 문단el?.parent as ElementNode | undefined;
      removeNode(런);
      // 문단에 성한 런이 하나도 안 남았고, 그 문단이 마지막이 아니면 문단도 걷는다
      if (문단el !== undefined && 문단el.name === 'hp:p'
        && childrenNamed(문단el, 'hp:run').every((r) => 런빈것인가(r))
        && 문단부모 !== undefined && childrenNamed(문단부모, 'hp:p').length > 1) {
        removeNode(문단el);
        빈문단도지웠나 = true;
      }
    }

    return this.남기기('표지우기', id, 됨({ 지운칸: 칸수, 빈문단도지웠나 }));
  }

  구역더하기(): 결과<{ 이름: string }> {
    const 이름들 = this.통.sectionNames();
    if (이름들.length === 0) {
      return 안됨('구역이 하나도 없다', '빈 문서라도 구역 하나는 있어야 한다.');
    }
    const 마지막 = 이름들[이름들.length - 1]!;
    const doc = parseXml(this.통.readText(마지막));

    // 첫 문단만 남긴다 — 거기에 hp:secPr 이 붙어 있다
    const 문단들 = childrenNamed(doc.root, 'hp:p');
    if (문단들.length === 0) {
      return 안됨(`${마지막} 에 문단이 없다`, '깨진 문서다.');
    }
    for (const p of 문단들.slice(1)) removeNode(p);

    // 남긴 문단의 글은 비운다. 개체(표·그림)가 든 런도 지운다 —
    // 새 구역에 남의 표가 딸려 가면 안 된다.
    const 첫 = 문단들[0]!;
    for (const r of childrenNamed(첫, 'hp:run')) {
      const 개체 = r.children.some((c: { kind: string; name?: string }) => c.kind === 'element'
        && !['hp:t', 'hp:ctrl', 'hp:secPr'].includes(c.name ?? ''));
      const secPr든것 = findAll(r, 'hp:secPr').length > 0;
      if (개체 && !secPr든것) { removeNode(r); continue; }
      for (const t of childrenNamed(r, 'hp:t')) setText(t, '');
    }

    const 새이름 = this.통.구역더하기(serializeXml(doc));
    this.구역doc.delete(새이름);

    // **머리글에 구역 수를 적는다.** 이걸 안 하면 한글이 새 구역을 통째로 버린다 —
    // 부품도 manifest 도 다 맞는데 `<hh:head secCnt>` 하나 때문이다 (실측 14장).
    this.머리.구역수적기(this.통.sectionNames().length);

    return 됨({ 이름: 새이름 });
  }

  // ── 검사와 저장 ─────────────────────────────────────────────────────────

  /** 저장 전에 볼 것들 */
  검사(): string[] {
    const 탈: string[] = [...this.머리.itemCnt검사()];
    for (const s of this.구역들) {
      // **구역마다 쪽 설정이 하나 있어야 한다.**
      //
      // 없으면 용지 크기·여백·쪽 번호가 통째로 없는 것이다. 이걸 안 보고 있었다 —
      // 첫 문단을 지워 `hp:secPr` 가 사라진 문서를 두고 **「탈 없음」이라고 답했다.**
      // 문단지우기가 이제 막지만, 딴 길로도 사라질 수 있으니 여기서도 잡는다.
      const 쪽설정수 = findAll(s.root, 'hp:secPr').length;
      if (쪽설정수 === 0) {
        탈.push(`${s.이름}: 쪽 설정(hp:secPr)이 없다 — 용지 크기·여백이 통째로 없다`);
      }
      for (const t of s.표들) {
        for (const x of new 표(t).탈만) 탈.push(`${s.이름}: ${x}`);
      }
    }

    // **XML 이 못 쓰는 글자가 새어 들어갔나** — 마지막 그물이다.
    //
    // 쓰는 길목(글바꾸기)에서 막지만 조판·복제 같은 딴 길도 있다.
    // 그런 글자가 하나라도 들면 **한글이 그 파일을 통째로 못 연다** —
    // 열어 보기 전에는 모르니 저장 길목에서 잡는다.
    for (const s of this.구역들) {
      for (const t of findAll(s.root, 'hp:t')) {
        const 글 = (t.children[0] as { raw?: string } | undefined)?.raw ?? '';
        const 나쁜것 = 못쓰는제어문자(글);
        if (나쁜것) {
          탈.push(`${s.이름}: 글에 XML 이 못 쓰는 제어문자 ${나쁜것.글자} 가 있다 (한글이 못 연다)`);
          break;   // 한 구역에 하나만 알려도 넉넉하다
        }
      }
    }

    탈.push(...this.통.검사());
    return 탈;
  }

  /**
   * 손댄 것이 있나.
   *
   * **읽은 것과 고친 것을 헷갈리면 안 된다.** 구역을 읽기만 해도 파싱은 하지만
   * 그건 고친 것이 아니다. 나무의 `dirty` 표시를 본다 —
   * 고치는 길(`edit.ts`)을 지나야만 켜지는 표시다.
   */
  get dirty(): boolean {
    if (this.머리.dirty || this.통.dirty) return true;
    for (const doc of this.구역doc.values()) if (doc.root.dirty) return true;
    return false;
  }

  /**
   * 파일로. 고친 것만 컨테이너에 되쓴다.
   *
   * 아무것도 안 고쳤으면 원본과 **바이트가 같다.**
   */
  저장(): Buffer {
    // 우리가 **새로 낸** 흠이 있으면 여기서 멈춘다.
    // 규격 검사를 스크립트로만 돌리면 아무도 안 돌린다. 저장 길목에 박아 둔다.
    const 새로난탈 = this.검사().filter((t) => !this.처음탈.has(t));
    if (새로난탈.length) {
      throw new Error([
        `고치기 전에는 없던 흠 ${새로난탈.length}건이 생겨 저장을 멈춘다.`,
        ...새로난탈.slice(0, 3).map((t) => `  ${t}`),
        '→ 마지막에 한 고침을 되짚어 보라. 그것만 물리고 저장하면 된다.',
      ].join('\n'));
    }
    if (this.머리.dirty) this.통.writeText(부품.header, this.머리.toXml());
    for (const [이름, doc] of this.구역doc) {
      if (!doc.root.dirty) continue;
      this.통.writeText(이름, serializeXml(doc));
    }
    return this.통.save();
  }

  /** 안쪽 컨테이너 (그림·manifest 를 다룰 때) */
  get 컨테이너(): HwpxContainer {
    return this.통;
  }

  // ── 기록 ────────────────────────────────────────────────────────────────

  private 남기기<T>(무엇: string, 대상: string, r: 결과<T>): 결과<T> {
    this.기록.push({
      무엇,
      대상,
      됐나: r.ok,
      말: r.ok ? JSON.stringify(r.value) : r.이유,
    });
    return r;
  }

  /** 실패한 것만 (조용한 실패를 찾을 때) */
  get 실패기록(): 연산기록[] {
    return this.기록.filter((x) => !x.됐나);
  }
}

/** node 가 root 아래에 있나 */
/**
 * **이 런은 사실상 비어 있나.**
 *
 * 「자식이 하나도 없나」로 보면 실제 문서에서 거의 안 걸린다. 재 봤다 —
 *
 *     표가 든 런 271개 (표본 33편)
 *       253  표 말고 남는 것: hp:t          ← **빈** hp:t 다
 *         9  (없음)
 *         6  hp:ctrl · hp:line 등
 *       남는 것이 빈 hp:t 뿐인 런 **265개 (98%)**
 *
 * 그러니 「완전히 비면」 규칙은 **271개 중 9개**에만 걸렸다. 규칙은 맞는데
 * 조건이 현실에서 거의 성립하지 않아, 있으면서 아무 일도 안 하고 있었다.
 *
 * 빈 `hp:t` 는 한글이 표 옆에 늘 하나씩 두는 것이라 글이 아니다.
 * `hp:ctrl`·`hp:line` 은 진짜 무언가라 그게 남으면 런을 안 걷는다.
 */
function 런빈것인가(런: ElementNode): boolean {
  return 런.children.every((c) => {
    const 이름 = (c as { name?: string }).name;
    if (이름 === undefined) return false;              // 글월이 그대로 있다
    if (이름 !== 'hp:t') return false;                 // hp:ctrl · hp:line 따위
    return textOf(c as ElementNode).trim() === '';
  });
}

function 안에있나(root: ElementNode, node: ElementNode): boolean {
  let p: ElementNode | undefined = node;
  while (p) {
    if (p === root) return true;
    p = p.parent;
  }
  return false;
}

/**
 * 바탕쪽 부품 한 장을 짓는다.
 *
 * `<masterPage>` 는 **접두사가 없는** 뿌리인데 안쪽은 `hp:` 를 쓴다. 그래서
 * 이름공간 선언이 다 있어야 한다 — 손으로 적지 않고 **구역 뿌리에서 뜬다.**
 * 한글이 저장한 그 목록 그대로다 (열넷이다).
 */
function 바탕쪽XML(
  구역뿌리: ElementNode, id: string, 글너비: number, 글높이: number, 문단: ElementNode,
): string {
  const 이름공간 = 구역뿌리.attrs
    .filter((a) => a.name === 'xmlns' || a.name.startsWith('xmlns:'))
    .map((a) => ` ${a.name}="${a.raw}"`)
    .join('');
  const 속 = createElement('hp:subList', {
    id: '', textDirection: 'HORIZONTAL', lineWrap: 'BREAK', vertAlign: 'TOP',
    linkListIDRef: '0', linkListNextIDRef: '0',
    textWidth: String(Math.max(0, Math.round(글너비))),
    textHeight: String(Math.max(0, Math.round(글높이))),
    hasTextRef: '0', hasNumRef: '0',
  });
  appendChild(속, 문단);
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
    + `<masterPage${이름공간} id="${id}" type="BOTH" pageNumber="0"`
    + ' pageDuplicate="0" pageFront="0">'
    + serializeNode(속, '')
    + '</masterPage>';
}
