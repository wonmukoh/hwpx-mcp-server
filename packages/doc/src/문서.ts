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
  parseXml, serializeXml, findAll, getAttr,
  type ElementNode, type XmlDocument, childrenNamed, removeNode, setText,
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
      for (const t of s.표들) {
        for (const x of new 표(t).탈만) 탈.push(`${s.이름}: ${x}`);
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
function 안에있나(root: ElementNode, node: ElementNode): boolean {
  let p: ElementNode | undefined = node;
  while (p) {
    if (p === root) return true;
    p = p.parent;
  }
  return false;
}
