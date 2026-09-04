/**
 * 표.
 *
 * ## 실측으로 알아낸 것 (표 1292개 / 셀 21411개)
 *
 * 자식 순서 — **순서가 규격이다:**
 *
 * ```
 * hp:sz  hp:pos  hp:outMargin  [hp:caption]  hp:inMargin  [hp:cellzoneList]  hp:tr…  [hp:label]
 * ```
 *
 * `hp:caption` 은 `outMargin` 과 `inMargin` **사이**에 온다 (21/21).
 * 뒤에 붙이면 한글이 못 읽는다.
 *
 * 셀(`hp:tc`)은 자식 다섯을 **언제나** 갖고 있다 (21411/21411):
 * `hp:subList` `hp:cellAddr` `hp:cellSpan` `hp:cellSz` `hp:cellMargin`
 *
 * | 잰 것 | 값 |
 * |---|---|
 * | 덮은 칸 셀 폭 = 열 폭의 합 | 맞음 736 / 틀림 4 — **규칙이다** |
 * | 표 높이 = 줄 높이의 합 | 맞음 843 / 틀림 271 — **규칙이 아니다** |
 * | `hasMargin=0` | 18055개. 셀 여백을 안 쓰고 표의 `inMargin` 을 쓴다 |
 * | `hasMargin=1` | 3356개. 그 가운데 3229개가 표 여백과 다르다 |
 * | `repeatHeader` | 1이 1240 / 0이 52 |
 * | 세로 정렬 | `hp:subList/@vertAlign` — CENTER 21337 / TOP 64 / BOTTOM 10 |
 *
 * **셀 여백을 주려면 `hasMargin="1"` 도 같이 켜야 한다.**
 * 안 켜면 `cellMargin` 을 써 놓고도 표 여백이 쓰인다 — 조용한 실패다.
 */

import {
  getAttr, setAttr, appendChild, createElement, removeNode,
  childrenNamed, firstChildNamed, findAll, setText, insertAfter, insertBefore, 복제하기,
  type ElementNode, type HwpUnit,
} from '@hwpx/owpml';
import { 됨, 안됨, type 결과 } from './결과.js';

/** `hp:tbl` 자식 순서. 여기 없는 것은 맨 뒤로 */
export const 표자식순서 = [
  'hp:sz', 'hp:pos', 'hp:outMargin', 'hp:caption', 'hp:inMargin',
  'hp:cellzoneList', 'hp:tr', 'hp:label',
] as const;

/**
 * 표 검사에서 나온 것.
 *
 * **탈**: 격자가 깨졌다. 한글이 표를 잘못 그린다.
 * **주의**: 한글은 눈감아 주지만 우리가 만든 표라면 맞춰야 한다.
 */
export interface 표탈 {
  급: '탈' | '주의';
  말: string;
}

export interface 셀자리 {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

export interface 여백넷 {
  left: HwpUnit;
  right: HwpUnit;
  top: HwpUnit;
  bottom: HwpUnit;
}

/** 셀 하나 */
export class 셀 {
  constructor(readonly el: ElementNode) {}

  get 자리(): 셀자리 {
    const addr = firstChildNamed(this.el, 'hp:cellAddr');
    const span = firstChildNamed(this.el, 'hp:cellSpan');
    return {
      row: Number(getAttr(addr!, 'rowAddr') ?? 0),
      col: Number(getAttr(addr!, 'colAddr') ?? 0),
      rowSpan: Number(getAttr(span!, 'rowSpan') ?? 1),
      colSpan: Number(getAttr(span!, 'colSpan') ?? 1),
    };
  }

  get 너비(): number {
    return Number(getAttr(firstChildNamed(this.el, 'hp:cellSz')!, 'width') ?? 0);
  }

  get 높이(): number {
    return Number(getAttr(firstChildNamed(this.el, 'hp:cellSz')!, 'height') ?? 0);
  }

  크기주기(너비?: number, 높이?: number): void {
    const sz = firstChildNamed(this.el, 'hp:cellSz')!;
    if (너비 !== undefined) setAttr(sz, 'width', String(Math.round(너비)));
    if (높이 !== undefined) setAttr(sz, 'height', String(Math.round(높이)));
  }

  /** 이 칸을 덮고 있나 */
  덮나(row: number, col: number): boolean {
    const a = this.자리;
    return row >= a.row && row < a.row + a.rowSpan && col >= a.col && col < a.col + a.colSpan;
  }

  get subList(): ElementNode {
    return firstChildNamed(this.el, 'hp:subList')!;
  }

  /** 세로 정렬은 subList 에 있다 (`TOP` `CENTER` `BOTTOM`) */
  세로정렬주기(값: 'TOP' | 'CENTER' | 'BOTTOM'): void {
    setAttr(this.subList, 'vertAlign', 값);
  }

  get 세로정렬(): string {
    return getAttr(this.subList, 'vertAlign') ?? 'CENTER';
  }

  /**
   * 셀 안쪽 여백.
   *
   * **`hasMargin="1"` 을 같이 켠다.** 안 켜면 써 놓고도 표 여백이 쓰인다.
   * 실측: `hasMargin=0` 인 셀 18055개는 표의 `inMargin` 을 따른다.
   */
  안여백주기(여백: Partial<여백넷>): void {
    const cm = firstChildNamed(this.el, 'hp:cellMargin')!;
    for (const [k, v] of Object.entries(여백)) {
      if (v !== undefined) setAttr(cm, k, String(Math.round(v)));
    }
    setAttr(this.el, 'hasMargin', '1');
  }

  get 안여백(): 여백넷 {
    const cm = firstChildNamed(this.el, 'hp:cellMargin')!;
    const v = (k: string) => Number(getAttr(cm, k) ?? 0) as HwpUnit;
    return { left: v('left'), right: v('right'), top: v('top'), bottom: v('bottom') };
  }

  /** 표의 안여백을 따르나 */
  get 표여백따르나(): boolean {
    return getAttr(this.el, 'hasMargin') !== '1';
  }

  테두리주기(borderFillIDRef: string): void {
    setAttr(this.el, 'borderFillIDRef', borderFillIDRef);
  }

  get 테두리(): string | undefined {
    return getAttr(this.el, 'borderFillIDRef');
  }

  /** 머리 칸인가 (`header="1"`). 여러 쪽에 걸칠 때 되풀이된다 */
  머리칸주기(맞나: boolean): void {
    setAttr(this.el, 'header', 맞나 ? '1' : '0');
  }
}

/** 표 하나 */
export class 표 {
  /**
   * `source` 는 이 표가 살던 글이다. 줄을 복제할 때 꼭 있어야 한다 —
   * 안 고친 노드는 원본 조각으로 직렬화되기 때문에, 없으면 **빈 복제본**이 나온다.
   */
  constructor(readonly el: ElementNode, readonly source?: string) {}

  get 줄수(): number {
    return Number(getAttr(this.el, 'rowCnt') ?? 0);
  }

  get 칸수(): number {
    return Number(getAttr(this.el, 'colCnt') ?? 0);
  }

  get 줄들(): ElementNode[] {
    return childrenNamed(this.el, 'hp:tr');
  }

  get 셀들(): 셀[] {
    return this.줄들.flatMap((tr) => childrenNamed(tr, 'hp:tc').map((tc) => new 셀(tc)));
  }

  /**
   * (줄, 칸)에 있는 셀. **덮은 칸도 찾는다.**
   *
   * 표를 합치면 그 자리에 `hp:tc` 가 없다. 그래도 덮고 있는 셀을 준다.
   * 안 그러면 합친 표에서 "그 칸이 없다" 는 말이 나온다.
   */
  셀(row: number, col: number): 셀 | undefined {
    return this.셀들.find((c) => c.덮나(row, col));
  }

  /** 그 자리에서 시작하는 셀 (덮인 칸이면 undefined) */
  시작셀(row: number, col: number): 셀 | undefined {
    return this.셀들.find((c) => {
      const a = c.자리;
      return a.row === row && a.col === col;
    });
  }

  /**
   * 열 폭. 덮은 칸이 하나인 셀에서 모은다.
   *
   * 어느 줄에서도 홀로 선 셀이 없는 칸은 `undefined` 가 된다 (드물다).
   */
  get 열폭(): (number | undefined)[] {
    const 폭: (number | undefined)[] = new Array(this.칸수).fill(undefined);
    for (const c of this.셀들) {
      const a = c.자리;
      if (a.colSpan === 1 && 폭[a.col] === undefined) 폭[a.col] = c.너비;
    }
    return 폭;
  }

  /** 줄 높이. 덮은 줄이 하나인 셀에서 모은다 */
  get 줄높이(): (number | undefined)[] {
    const 높이: (number | undefined)[] = new Array(this.줄수).fill(undefined);
    for (const c of this.셀들) {
      const a = c.자리;
      if (a.rowSpan === 1 && 높이[a.row] === undefined) 높이[a.row] = c.높이;
    }
    return 높이;
  }

  /**
   * 칸을 **합친다.**
   *
   * 실측: 문서 161편 가운데 **122편(76%)이 셀을 합친다.** 정부 문서 표는
   * 합침 없이는 못 만든다.
   *
   * 합치는 일은 세 가지를 한꺼번에 해야 한다. 하나라도 빠지면 표가 깨진다:
   *   1. 시작 셀의 `hp:cellSpan` 을 키운다
   *   2. **덮이는 셀들을 지운다** — 안 지우면 같은 칸을 둘이 덮는다
   *   3. 시작 셀 너비를 **덮는 열 폭의 합**으로 다시 잡는다
   *      (실측 규칙 — 안 맞추면 합친 셀이 표 밖으로 삐져나온다)
   *
   * 이미 합쳐진 칸이 끼어 있으면 **거절한다.** 겹쳐 합치면 기하가 무너지는데,
   * 그건 우리 검사에 걸리기 전에 한글이 파일을 이상하게 그린다.
   */
  합치기(row: number, col: number, rowSpan: number, colSpan: number): 결과<{ 지운수: number }> {
    if (rowSpan < 1 || colSpan < 1 || (rowSpan === 1 && colSpan === 1)) {
      return 안됨(
        `합칠 것이 없다 (${rowSpan}줄 × ${colSpan}칸)`,
        'rowspan 이나 colspan 가운데 하나는 2 이상이어야 한다.',
      );
    }
    if (row + rowSpan > this.줄수 || col + colSpan > this.칸수) {
      return 안됨(
        `표 밖으로 나간다 — (${row},${col})에서 ${rowSpan}×${colSpan} 인데 표는 ${this.줄수}줄 ${this.칸수}칸이다`,
        `줄은 0~${this.줄수 - 1}, 칸은 0~${this.칸수 - 1} 이다.`,
      );
    }
    const 시작 = this.시작셀(row, col);
    if (!시작) {
      return 안됨(
        `(${row},${col}) 에서 시작하는 셀이 없다 — 이미 합쳐진 자리다`,
        '합침은 겹칠 수 없다. 다른 자리를 고르거나 합치는 범위를 줄여라.',
      );
    }

    // 덮일 셀들을 모은다. 시작 셀은 빼고.
    const 덮일것: 셀[] = [];
    for (let r = row; r < row + rowSpan; r++) {
      for (let c = col; c < col + colSpan; c++) {
        const it = this.시작셀(r, c);
        if (!it || it.el === 시작.el) continue;
        const a = it.자리;
        // 밖으로 삐져나가게 합쳐진 셀이 끼어 있으면 손대지 않는다
        if (a.row + a.rowSpan > row + rowSpan || a.col + a.colSpan > col + colSpan) {
          return 안됨(
            `(${a.row},${a.col}) 셀이 이미 ${a.rowSpan}×${a.colSpan} 로 합쳐져 범위 밖까지 덮는다`,
            '먼저 그 셀의 합침을 풀거나, 합치는 범위를 그 셀까지 넓혀라.',
          );
        }
        덮일것.push(it);
      }
    }

    const 폭들 = this.열폭;
    for (const it of 덮일것) removeNode(it.el);

    const span = firstChildNamed(시작.el, 'hp:cellSpan')!;
    setAttr(span, 'rowSpan', String(rowSpan));
    setAttr(span, 'colSpan', String(colSpan));

    // 너비는 덮는 열 폭의 합이어야 한다 (실측 규칙)
    let 합 = 0;
    let 다있나 = true;
    for (let c = col; c < col + colSpan; c++) {
      const w = 폭들[c];
      if (w === undefined) { 다있나 = false; break; }
      합 += w;
    }
    if (다있나) 시작.크기주기(합, undefined);

    return 됨({ 지운수: 덮일것.length });
  }

  /**
   * 열 폭을 새로 준다.
   *
   * 덮은 칸이 여럿인 셀은 **덮는 열 폭의 합**으로 다시 잡는다.
   * 이걸 안 하면 합친 셀이 표 밖으로 삐져나온다 (실측: 이 규칙이 736/740 에서 지켜졌다).
   *
   * 표 전체 폭(`hp:sz/@width`)도 같이 맞춘다.
   */
  열폭주기(폭들: number[]): 결과<{ 바뀐수: number }> {
    if (폭들.length !== this.칸수) {
      return 안됨(
        `열이 ${this.칸수}개인데 폭을 ${폭들.length}개 줬다`,
        `폭을 ${this.칸수}개 주거나, 표의 열 수를 먼저 맞춰라.`,
      );
    }
    if (폭들.some((w) => !Number.isFinite(w) || w <= 0)) {
      return 안됨('폭은 0보다 커야 한다', `준 값: ${폭들.join(', ')}`);
    }

    let 바뀐수 = 0;
    for (const c of this.셀들) {
      const a = c.자리;
      let 합 = 0;
      for (let i = a.col; i < a.col + a.colSpan; i++) 합 += 폭들[i] ?? 0;
      if (c.너비 !== Math.round(합)) { c.크기주기(합); 바뀐수++; }
    }

    const sz = firstChildNamed(this.el, 'hp:sz');
    if (sz) {
      const 온폭 = String(Math.round(폭들.reduce((a, b) => a + b, 0)));
      if (getAttr(sz, 'width') !== 온폭) { setAttr(sz, 'width', 온폭); 바뀐수++; }
    }
    return 됨({ 바뀐수 });
  }

  /**
   * 표 높이를 줄 높이의 합으로 맞춘다.
   *
   * **이건 규칙이 아니다.** 실측에서 843/1114 만 맞았다.
   * 그래도 **우리가 만든 표는 맞춰 준다** — 한글이 해 주지 않아서
   * 안 맞추면 표 아래가 잘리거나 빈 칸이 남는다.
   */
  /**
   * **줄을 넣는다.**
   *
   * Draftsmith 지침이 못박은 것: "줄이 모자라면 줄을 넣는다. 표를 새로 만들지 않는다."
   * 양식의 표를 새로 만들면 테두리·열 폭·서식이 다 날아간다.
   *
   * 넣는 줄은 **바로 위(또는 아래) 줄을 복제**한다 — 맨땅에서 짜지 않는다.
   * 셀의 테두리·여백·서식이 딸려 와야 표가 안 어긋난다.
   * 복제한 뒤 **글은 비우고**, 줄 주소(`rowAddr`)를 다시 매기고,
   * 표 높이(`hp:sz/@height`)를 다시 잡는다.
   *
   * 세로로 합쳐진 셀이 걸치는 자리에는 못 넣는다 — 넣으면 기하가 무너진다.
   */
  줄넣기(자리: number, 몇줄 = 1): 결과<{ 넣은수: number }> {
    if (몇줄 < 1) return 안됨(`${몇줄}줄을 넣으라 한다`, '1 이상이어야 한다.');
    if (자리 < 0 || 자리 > this.줄수) {
      return 안됨(
        `${자리}번 자리에 못 넣는다 (표는 ${this.줄수}줄이다)`,
        `0~${this.줄수} 사이여야 한다 (${this.줄수} 은 맨 뒤에 붙이는 것이다).`,
      );
    }

    // 세로로 합쳐진 셀이 이 자리를 가로지르면 손대지 않는다
    for (const c of this.셀들) {
      const a = c.자리;
      if (a.rowSpan > 1 && a.row < 자리 && 자리 < a.row + a.rowSpan) {
        return 안됨(
          `(${a.row},${a.col}) 셀이 ${a.rowSpan}줄에 걸쳐 있어 ${자리}번 자리를 가로지른다`,
          '합친 셀 안으로는 줄을 못 넣는다. 합침을 먼저 풀거나 다른 자리를 골라라.',
        );
      }
    }

    // 본뜰 줄 — 바로 위, 없으면 바로 아래
    const 줄들 = this.줄들;
    const 본 = 줄들[자리 > 0 ? 자리 - 1 : 0];
    if (!본) return 안됨('본뜰 줄이 없다 (빈 표다)', '줄이 하나는 있어야 한다.');

    let 앞 = 본;
    let 넣은수 = 0;
    for (let k = 0; k < 몇줄; k++) {
      const 새줄 = 복제하기(본, this.source ?? '');

      // **안쪽 표·그림은 통째로 뺀다.**
      //
      // 본뜬 줄에 표가 또 들어 있으면 그것까지 복제된다. 학교 가정통신문이 그 꼴이다 —
      // 바깥 표 2x3 의 한 칸에 안쪽 표 3x7 이 들어 있다.
      // 복제하면 안쪽 표가 하나 더 생기고, 아래에서 `hp:cellSpan` 을 훑을 때
      // **안쪽 표의 합침까지 풀어 버려** 기하가 무너진다.
      // 실제로 그랬다 — 저장 길목이 "(1,6) 칸을 덮는 셀이 없다" 로 잡았다.
      for (const 안것 of childrenNamed(새줄, 'hp:tc')) {
        for (const p of findAll(안것, 'hp:p')) {
          for (const r of childrenNamed(p, 'hp:run')) {
            const 개체 = r.children.some((c) => c.kind === 'element'
              && !['hp:t', 'hp:ctrl', 'hp:linesegarray'].includes((c as ElementNode).name));
            if (개체) removeNode(r);
          }
        }
      }

      // 글을 비운다 — 본뜬 줄의 글이 딸려 오면 안 된다
      for (const t of findAll(새줄, 'hp:t')) setText(t, '');

      // 합쳐진 셀이 딸려 오면 새 줄이 어긋난다. 하나씩 서게 만든다.
      // **이 줄의 셀만** 본다 — findAll 로 훑으면 안쪽 표의 합침까지 푼다.
      for (const tc of childrenNamed(새줄, 'hp:tc')) {
        const span = firstChildNamed(tc, 'hp:cellSpan');
        if (span) setAttr(span, 'rowSpan', '1');
      }
      if (자리 > 0) { insertAfter(앞, 새줄); 앞 = 새줄; }
      else { insertBefore(본, 새줄); }
      넣은수++;
    }

    // 줄 주소를 다시 매긴다 — 안 하면 표 검사에 걸린다.
    // **이 표의 줄만** 본다 (childrenNamed 는 바로 아래 자식만 준다).
    // 안쪽 표까지 훑으면 그 표의 주소를 바깥 표 기준으로 덮어써 버린다.
    for (const [r, tr] of childrenNamed(this.el, 'hp:tr').entries()) {
      for (const tc of childrenNamed(tr, 'hp:tc')) {
        const addr = firstChildNamed(tc, 'hp:cellAddr');
        if (addr) setAttr(addr, 'rowAddr', String(r));
      }
    }
    setAttr(this.el, 'rowCnt', String(childrenNamed(this.el, 'hp:tr').length));
    this.높이맞추기();

    return 됨({ 넣은수 });
  }

  /**
   * **줄을 지운다.** `줄넣기` 의 짝이다.
   *
   * 양식에는 넉넉히 만들어 둔 줄이 있다 — 예산 표에 다섯 줄인데 쓸 것이 셋이면
   * 둘이 남는다. 빈 줄을 그대로 두면 결재 문서로는 어설프다.
   * 그런데 **줄을 넣을 수만 있고 뺄 수는 없었다.** 짝이 안 맞았다.
   *
   * 막는 것 셋 —
   *
   *   - **마지막 줄은 못 지운다.** 줄 없는 표는 한글이 안 연다.
   *   - **세로로 합쳐진 셀이 걸치면 못 지운다.** 지우면 기하가 무너진다.
   *   - **글이 든 줄은 기본으로 못 지운다.** 실수로 내용을 날리는 것이
   *     빈 줄이 남는 것보다 훨씬 나쁘다. 정말 지우려면 `비어야만: false` 로 부른다.
   */
  줄지우기(자리: number, 몇줄 = 1, 비어야만 = true): 결과<{ 지운수: number }> {
    if (몇줄 < 1) return 안됨(`${몇줄}줄을 지우라 한다`, '1 이상이어야 한다.');
    if (자리 < 0 || 자리 >= this.줄수) {
      return 안됨(
        `${자리}번 줄이 없다 (표는 ${this.줄수}줄이다)`,
        `0~${this.줄수 - 1} 사이여야 한다.`,
      );
    }
    const 끝 = Math.min(자리 + 몇줄, this.줄수);
    if (끝 - 자리 >= this.줄수) {
      return 안됨(
        `${this.줄수}줄짜리 표에서 ${끝 - 자리}줄을 지우면 남는 줄이 없다`,
        '줄 없는 표는 한글이 안 연다. 표를 통째로 지우려면 표를 지워라.',
      );
    }

    // 세로로 합쳐진 셀이 지울 자리를 드나들면 손대지 않는다
    for (const c of this.셀들) {
      const a = c.자리;
      if (a.rowSpan <= 1) continue;
      const 셀끝 = a.row + a.rowSpan;
      const 걸치나 = a.row < 끝 && 자리 < 셀끝;
      const 통째로드나 = 자리 <= a.row && 셀끝 <= 끝;
      if (걸치나 && !통째로드나) {
        return 안됨(
          `(${a.row},${a.col}) 셀이 ${a.rowSpan}줄에 걸쳐 있어 ${자리}~${끝 - 1}번 줄에 반쯤 든다`,
          '합친 셀을 반만 지울 수 없다. 합침을 먼저 풀거나 지울 자리를 맞춰라.',
        );
      }
    }

    const 줄들 = childrenNamed(this.el, 'hp:tr');
    if (비어야만) {
      for (let r = 자리; r < 끝; r++) {
        const tr = 줄들[r];
        if (!tr) continue;
        const 글 = findAll(tr, 'hp:t')
          .map((t) => (t.children[0] as { raw?: string } | undefined)?.raw ?? '')
          .join('').trim();
        if (글) {
          return 안됨(
            `${r}번 줄에 글이 있다: «${글.slice(0, 30)}»`,
            '빈 줄만 지운다. 정말 지우려면 비어야만 을 false 로 줘라 — '
            + '지운 글은 되돌릴 수 없다.',
          );
        }
      }
    }

    let 지운수 = 0;
    for (let r = 끝 - 1; r >= 자리; r--) {
      const tr = 줄들[r];
      if (!tr) continue;
      removeNode(tr);
      지운수++;
    }

    // 줄 주소를 다시 매긴다 — 안 하면 표 검사에 걸린다.
    // **이 표의 줄만** 본다. 안쪽 표까지 훑으면 그 표 주소를 덮어쓴다.
    for (const [r, tr] of childrenNamed(this.el, 'hp:tr').entries()) {
      for (const tc of childrenNamed(tr, 'hp:tc')) {
        const addr = firstChildNamed(tc, 'hp:cellAddr');
        if (addr) setAttr(addr, 'rowAddr', String(r));
      }
    }
    setAttr(this.el, 'rowCnt', String(childrenNamed(this.el, 'hp:tr').length));
    this.높이맞추기();

    return 됨({ 지운수 });
  }

  /**
   * **칸 주소를 다시 매긴다.** 칸을 넣거나 뺀 뒤에는 꼭 불러야 한다.
   *
   * 그냥 0,1,2… 로 매기면 안 된다. `colAddr` 은 **절대 열 번호**이고,
   * 위 줄에서 세로로 덮은 자리는 **건너뛴다.** 실측 —
   *
   *     줄3: col0(×1/3) col1 col2(×1/3) col3(×1/3) col4(×1/3) col5 col6
   *     줄4: col1              col5 col6          ← 0·2·3·4 는 위가 덮었다
   *
   * 그래서 자리표를 만들어 놓고 빈 자리에만 셀을 앉힌다.
   */
  private 칸주소다시(): void {
    const 줄들 = childrenNamed(this.el, 'hp:tr');
    /** 위에서 덮어 내려온 자리. `덮임[r][c]` */
    const 덮임: boolean[][] = 줄들.map(() => []);
    let 넓이 = 0;

    for (const [r, tr] of 줄들.entries()) {
      let c = 0;
      for (const tc of childrenNamed(tr, 'hp:tc')) {
        while (덮임[r]?.[c]) c++;
        const addr = firstChildNamed(tc, 'hp:cellAddr');
        if (addr) {
          setAttr(addr, 'rowAddr', String(r));
          setAttr(addr, 'colAddr', String(c));
        }
        const span = firstChildNamed(tc, 'hp:cellSpan');
        const cs = Math.max(1, Number(span && getAttr(span, 'colSpan')) || 1);
        const rs = Math.max(1, Number(span && getAttr(span, 'rowSpan')) || 1);
        for (let rr = r; rr < r + rs && rr < 줄들.length; rr++) {
          for (let cc = c; cc < c + cs; cc++) {
            const 줄 = 덮임[rr];
            if (줄) 줄[cc] = true;
          }
        }
        c += cs;
        if (c > 넓이) 넓이 = c;
      }
    }

    // **`칸수` 를 그대로 쓰면 안 된다.** 그것은 `colCnt` 를 읽는 것이라
    // `colCnt = 칸수` 는 제자리를 맴돈다 — 칸을 지워도 수가 안 줄어,
    // 폭을 다시 나눌 때 「열이 3개인데 폭을 2개 줬다」 로 걸렸다.
    // 격자를 훑어 **실제로 몇 칸인지** 세서 넣는다.
    setAttr(this.el, 'colCnt', String(넓이));
  }

  /**
   * 한 줄에서 **주어진 칸 번호 이후 첫 셀**을 찾는다. 없으면 `undefined`.
   *
   * 칸을 넣을 때 어느 셀 **앞**에 끼울지 잡는 데 쓴다.
   */
  private 줄에서칸(tr: ElementNode, 칸: number): ElementNode | undefined {
    for (const tc of childrenNamed(tr, 'hp:tc')) {
      const addr = firstChildNamed(tc, 'hp:cellAddr');
      const c = Number(addr && getAttr(addr, 'colAddr'));
      if (Number.isFinite(c) && c >= 칸) return tc;
    }
    return undefined;
  }

  /** 셀 하나를 본떠 **빈 1×1 셀**로 만든다 */
  private 빈셀본뜨기(본: ElementNode): ElementNode {
    const 새칸 = 복제하기(본, this.source ?? '');
    // 본뜬 셀에 든 개체(안쪽 표·그림)는 통째로 뺀다 — 딸려 오면 격자가 무너진다
    for (const p of findAll(새칸, 'hp:p')) {
      for (const run of childrenNamed(p, 'hp:run')) {
        const 개체 = run.children.some((x) => x.kind === 'element'
          && !['hp:t', 'hp:ctrl', 'hp:linesegarray'].includes((x as ElementNode).name));
        if (개체) removeNode(run);
      }
    }
    for (const t of findAll(새칸, 'hp:t')) setText(t, '');
    const span = firstChildNamed(새칸, 'hp:cellSpan');
    if (span) { setAttr(span, 'colSpan', '1'); setAttr(span, 'rowSpan', '1'); }
    return 새칸;
  }

  /**
   * **칸(열)을 넣는다.** `줄넣기` 의 가로 짝이다.
   *
   * 줄은 넣고 뺄 수 있는데 **칸은 아무것도 없었다.** 양식에 항목이 하나 늘면
   * 열을 더해야 하는데 그럴 길이 없어 표를 통째로 새로 짜야 했다.
   *
   * ## 표 전체 폭은 그대로 두고 **나눠 가진다**
   *
   * 새 칸에 이웃 폭을 그대로 주면 표가 그만큼 넓어져 **쪽 밖으로 나간다.**
   * 양식은 폭이 정해진 것이라, 있던 폭을 줄여 자리를 낸다.
   *
   * ## 막는 것
   *
   * **가로로 합쳐진 셀이 그 자리를 가로지르면** 손대지 않는다.
   * 넣으면 그 셀이 몇 칸을 덮는지가 어긋나 격자가 무너진다.
   */
  칸넣기(자리: number, 몇칸 = 1): 결과<{ 넣은수: number }> {
    if (몇칸 < 1) return 안됨(`${몇칸}칸을 넣으라 한다`, '1 이상이어야 한다.');
    if (자리 < 0 || 자리 > this.칸수) {
      return 안됨(
        `${자리}번 자리에 못 넣는다 (표는 ${this.칸수}칸이다)`,
        `0~${this.칸수} 사이여야 한다 (${this.칸수} 는 맨 뒤에 붙이는 것이다).`,
      );
    }
    const 줄들 = this.줄들;
    if (줄들.length === 0) return 안됨('빈 표다 (줄이 없다)', '줄이 하나는 있어야 한다.');

    for (const c of this.셀들) {
      const a = c.자리;
      if (a.colSpan > 1 && a.col < 자리 && 자리 < a.col + a.colSpan) {
        return 안됨(
          `(${a.row},${a.col}) 셀이 ${a.colSpan}칸에 걸쳐 있어 ${자리}번 자리를 가로지른다`,
          '합친 셀 안으로는 칸을 못 넣는다. 합침을 먼저 풀거나 다른 자리를 골라라.',
        );
      }
    }

    const 옛폭 = this.열폭;
    const 총폭 = 옛폭.reduce<number>((a, b) => a + (b ?? 0), 0);

    for (const tr of 줄들) {
      const 뒤 = this.줄에서칸(tr, 자리);
      const 이줄셀들 = childrenNamed(tr, 'hp:tc');
      const 본 = 뒤 ?? 이줄셀들[이줄셀들.length - 1];
      if (!본) continue;   // 셀이 하나도 없는 줄은 안 건드린다
      for (let k = 0; k < 몇칸; k++) {
        const 새칸 = this.빈셀본뜨기(본);
        if (뒤) insertBefore(뒤, 새칸);
        else appendChild(tr, 새칸);
      }
    }

    this.칸주소다시();

    // 폭을 다시 나눈다 — 표 전체 폭은 그대로
    if (총폭 > 0 && 옛폭.every((w) => w !== undefined)) {
      const 새수 = this.칸수;
      const 고르게 = Math.floor(총폭 / 새수);
      const 새폭: number[] = new Array<number>(새수).fill(고르게);
      // 마지막 칸이 나머지를 받는다 — 합이 총폭과 어긋나면 표가 삐져나온다
      새폭[새수 - 1] = 총폭 - 고르게 * (새수 - 1);
      const r = this.열폭주기(새폭);
      if (!r.ok) return 안됨(`칸은 넣었는데 폭을 못 맞췄다: ${r.이유}`, r.어떻게);
    }

    return 됨({ 넣은수: 몇칸 });
  }

  /**
   * **칸(열)을 지운다.** `칸넣기` 의 짝이다.
   *
   * 되돌릴 수 없어 `줄지우기` 와 같은 셋을 막는다 —
   * 마지막 칸, 합친 칸을 반만 지우는 것, **글이 든 칸**.
   */
  칸지우기(자리: number, 몇칸 = 1, 비어야만 = true): 결과<{ 지운수: number }> {
    if (몇칸 < 1) return 안됨(`${몇칸}칸을 지우라 한다`, '1 이상이어야 한다.');
    if (자리 < 0 || 자리 >= this.칸수) {
      return 안됨(
        `${자리}번 칸이 없다 (표는 ${this.칸수}칸이다)`,
        `0~${this.칸수 - 1} 사이여야 한다.`,
      );
    }
    const 끝 = Math.min(자리 + 몇칸, this.칸수);
    if (끝 - 자리 >= this.칸수) {
      return 안됨(
        '표의 칸을 다 지우려 한다',
        '칸이 하나도 없는 표는 한글이 안 연다. 표를 통째로 없애려면 다른 길을 써라.',
      );
    }

    for (const c of this.셀들) {
      const a = c.자리;
      if (a.colSpan === 1) continue;
      const 셀끝 = a.col + a.colSpan;
      const 겹침 = a.col < 끝 && 자리 < 셀끝;
      const 다덮임 = 자리 <= a.col && 셀끝 <= 끝;
      if (겹침 && !다덮임) {
        return 안됨(
          `(${a.row},${a.col}) 셀이 ${a.colSpan}칸에 걸쳐 있어 반만 지우게 된다`,
          '합침을 먼저 풀거나, 지우는 범위를 그 셀까지 넓혀라.',
        );
      }
    }

    if (비어야만) {
      for (const c of this.셀들) {
        const a = c.자리;
        if (a.col < 자리 || a.col >= 끝) continue;
        const 글 = findAll(c.el, 'hp:t')
          .map((t) => t.children.map((x) => (x.kind === 'text' ? x.raw : '')).join(''))
          .join('').trim();
        if (글 !== '') {
          return 안됨(
            `(${a.row},${a.col}) 칸에 글이 있다 — «${글.slice(0, 20)}»`,
            '지운 글은 못 되돌린다. 정말 지우려면 force 를 켜라.',
          );
        }
      }
    }

    const 옛폭 = this.열폭;
    const 총폭 = 옛폭.reduce<number>((a, b) => a + (b ?? 0), 0);

    let 지운수 = 0;
    for (const c of this.셀들) {
      const a = c.자리;
      if (a.col >= 자리 && a.col < 끝) { removeNode(c.el); 지운수++; }
    }

    this.칸주소다시();

    if (총폭 > 0 && 옛폭.every((w) => w !== undefined)) {
      const 남은 = 옛폭.filter((_, i) => i < 자리 || i >= 끝) as number[];
      const 남은합 = 남은.reduce((a, b) => a + b, 0);
      const 새폭 = 남은합 > 0
        ? 남은.map((w) => Math.round(w * 총폭 / 남은합))
        : new Array<number>(this.칸수).fill(Math.floor(총폭 / this.칸수));
      const 마지막 = 새폭.length - 1;
      if (마지막 >= 0) {
        새폭[마지막] = 총폭 - 새폭.slice(0, 마지막).reduce((a, b) => a + b, 0);
      }
      const r = this.열폭주기(새폭);
      if (!r.ok) return 안됨(`칸은 지웠는데 폭을 못 맞췄다: ${r.이유}`, r.어떻게);
    }

    return 됨({ 지운수 });
  }

  /**
   * **합친 셀을 도로 푼다.** `합치기` 의 짝이다.
   *
   * 합칠 수만 있고 풀 수는 없었다. 고치다 잘못 합치면 되돌릴 길이 없어
   * 표를 새로 짜야 했다.
   *
   * 덮여 있던 자리마다 셀을 다시 세운다. 새 셀은 합친 셀을 본뜨되 **글은 비운다** —
   * 글은 합친 셀에 그대로 남는다. 나눠 담을 방법이 없어 지어내지 않는다.
   */
  합침풀기(row: number, col: number): 결과<{ 세운수: number }> {
    const 시작 = this.시작셀(row, col);
    if (!시작) {
      return 안됨(
        `(${row},${col}) 에서 시작하는 셀이 없다`,
        '덮인 자리가 아니라 **합친 셀의 왼쪽 위**를 가리켜라.',
      );
    }
    const a = 시작.자리;
    if (a.rowSpan === 1 && a.colSpan === 1) {
      return 안됨(
        `(${row},${col}) 은 합쳐진 셀이 아니다 (1×1)`,
        '풀 것이 없다. 합친 셀의 왼쪽 위 칸을 가리켜라.',
      );
    }

    const 폭들 = this.열폭;
    const 줄들 = this.줄들;
    const span = firstChildNamed(시작.el, 'hp:cellSpan')!;
    setAttr(span, 'rowSpan', '1');
    setAttr(span, 'colSpan', '1');
    const 제폭 = 폭들[a.col];
    if (제폭 !== undefined) 시작.크기주기(제폭, undefined);

    let 세운수 = 0;
    for (let r = a.row; r < a.row + a.rowSpan; r++) {
      const tr = 줄들[r];
      if (!tr) continue;
      for (let c = a.col; c < a.col + a.colSpan; c++) {
        if (r === a.row && c === a.col) continue;
        const 새칸 = this.빈셀본뜨기(시작.el);
        const w = 폭들[c];
        if (w !== undefined) new 셀(새칸).크기주기(w, undefined);
        const 뒤 = this.줄에서칸(tr, c);
        if (뒤) insertBefore(뒤, 새칸);
        else appendChild(tr, 새칸);
        세운수++;
      }
    }

    this.칸주소다시();
    return 됨({ 세운수 });
  }

  높이맞추기(): 결과<{ 바뀐수: number }> {
    const 높이 = this.줄높이;
    if (높이.some((h) => h === undefined)) {
      return 안됨(
        '줄 높이를 다 알 수 없다 (모든 줄이 세로로 합쳐져 있다)',
        '세로로 안 합쳐진 셀이 줄마다 하나는 있어야 높이를 잴 수 있다.',
      );
    }
    const 합 = (높이 as number[]).reduce((a, b) => a + b, 0);
    const sz = firstChildNamed(this.el, 'hp:sz');
    if (!sz) return 안됨('표에 hp:sz 가 없다', '깨진 표다. 다시 만들어야 한다.');
    if (getAttr(sz, 'height') === String(합)) return 됨({ 바뀐수: 0 });
    setAttr(sz, 'height', String(합));
    return 됨({ 바뀐수: 1 });
  }

  /** 머리 줄을 쪽마다 되풀이할까 */
  머리행반복주기(맞나: boolean): void {
    setAttr(this.el, 'repeatHeader', 맞나 ? '1' : '0');
    // 첫 줄 셀들에 header 도 같이 켠다 — 이것까지 해야 실제로 되풀이된다
    const 첫줄 = this.줄들[0];
    if (!첫줄) return;
    for (const tc of childrenNamed(첫줄, 'hp:tc')) setAttr(tc, 'header', 맞나 ? '1' : '0');
  }

  get 머리행반복(): boolean {
    return getAttr(this.el, 'repeatHeader') === '1';
  }

  /** 표 바깥 여백 */
  바깥여백주기(여백: Partial<여백넷>): void {
    const m = firstChildNamed(this.el, 'hp:outMargin')!;
    for (const [k, v] of Object.entries(여백)) if (v !== undefined) setAttr(m, k, String(Math.round(v)));
  }

  /** 표 안쪽 여백 (셀이 `hasMargin=0` 이면 이걸 따른다) */
  안여백주기(여백: Partial<여백넷>): void {
    const m = firstChildNamed(this.el, 'hp:inMargin')!;
    for (const [k, v] of Object.entries(여백)) if (v !== undefined) setAttr(m, k, String(Math.round(v)));
  }

  /**
   * 표 자리잡기 — 가로 정렬.
   *
   * `hp:pos/@horzAlign` 이 `LEFT` `CENTER` `RIGHT` 를 받는다.
   */
  가로정렬주기(값: 'LEFT' | 'CENTER' | 'RIGHT'): void {
    const pos = firstChildNamed(this.el, 'hp:pos');
    if (pos) setAttr(pos, 'horzAlign', 값);
  }

  /**
   * 캡션(표 이름).
   *
   * **`hp:outMargin` 과 `hp:inMargin` 사이**에 넣는다.
   * 실측 21/21 이 그 자리였다. 뒤에 붙이면 한글이 못 읽는다.
   */
  캡션자리(): { 이미있나: ElementNode | undefined; 넣을자리: number } {
    const 이미있나 = firstChildNamed(this.el, 'hp:caption');
    const 아이들 = this.el.children;
    const inMargin = firstChildNamed(this.el, 'hp:inMargin');
    const 넣을자리 = inMargin ? 아이들.indexOf(inMargin) : 아이들.length;
    return { 이미있나, 넣을자리 };
  }

  /**
   * 표 검사.
   *
   * **탈**과 **주의**를 나눈다. 안 나누면 남의 문서를 열 때마다
   * "이 표는 잘못됐다" 고 하게 된다 — 그러면 검사를 아무도 안 본다.
   */
  검사(): 표탈[] {
    const 탈: 표탈[] = [];
    const 줄수 = this.줄수, 칸수 = this.칸수;
    if (this.줄들.length !== 줄수) {
      탈.push({ 급: '탈', 말: `rowCnt 가 ${줄수} 인데 실제 줄은 ${this.줄들.length}개다` });
    }

    // 칸이 빠짐없이 덮이나 — 여기가 깨지면 한글이 표를 잘못 그린다
    for (let r = 0; r < 줄수; r++) {
      for (let c = 0; c < 칸수; c++) {
        const 덮는것 = this.셀들.filter((x) => x.덮나(r, c));
        if (덮는것.length === 0) 탈.push({ 급: '탈', 말: `(${r},${c}) 칸을 덮는 셀이 없다` });
        else if (덮는것.length > 1) {
          탈.push({ 급: '탈', 말: `(${r},${c}) 칸을 셀 ${덮는것.length}개가 겹쳐 덮는다` });
        }
      }
    }

    // 덮은 칸 셀의 폭 = 열 폭의 합.
    // 한글은 어긋나도 읽는다 (실제 문서 1292개 가운데 4개가 어긋나 있었다). 그래서 주의다.
    const 폭 = this.열폭;
    for (const cell of this.셀들) {
      const a = cell.자리;
      if (a.colSpan < 2) continue;
      let 합 = 0, 다있나 = true;
      for (let i = a.col; i < a.col + a.colSpan; i++) {
        if (폭[i] === undefined) { 다있나 = false; break; }
        합 += 폭[i]!;
      }
      if (다있나 && 합 !== cell.너비) {
        탈.push({ 급: '주의', 말: `(${a.row},${a.col}) 셀 폭이 ${cell.너비} 인데 덮는 열 폭의 합은 ${합} 이다` });
      }
    }

    // 셀 여백과 hasMargin 은 **검사하지 않는다.**
    //
    // 처음엔 "셀 여백을 써 놓고 hasMargin=0 이면 조용한 실패" 라고 잡았다.
    // 실제 문서 1292개를 훑으니 **5748건**이 걸렸다. 내 규칙이 틀린 것이다.
    // 한글은 hasMargin=0 이어도 cellMargin 을 그냥 남겨 둔다 — 죽은 값이다.
    // 남의 문서를 열고 "이 표는 잘못됐다" 고 하면 못 쓴다.
    //
    // 규칙 자체는 맞다 (자료/실측.md 7항, 검증/셀여백단위.mjs 로 한글에게 확인했다):
    // 셀 여백을 **주려면** hasMargin 을 1 로 켜야 한다. 그건 안여백주기() 가 한다.

    return 탈;
  }

  /** 반드시 고쳐야 하는 것만 (남의 문서를 읽을 때는 이걸 본다) */
  get 탈만(): string[] {
    return this.검사().filter((t) => t.급 === '탈').map((t) => t.말);
  }
}

/**
 * 표 자식을 **규격 순서에 맞는 자리**에 넣는다.
 *
 * 순서가 틀리면 한글이 못 읽는다. 캡션을 뒤에 붙이는 실수가 흔하다.
 */
export function 표자식넣기(표el: ElementNode, 새것: ElementNode): void {
  const 내자리 = 표자식순서.indexOf(새것.name as (typeof 표자식순서)[number]);
  if (내자리 === -1) { appendChild(표el, 새것); return; }

  const 뒤에올것 = 표el.children.find((c) => {
    if (c.kind !== 'element') return false;
    const i = 표자식순서.indexOf(c.name as (typeof 표자식순서)[number]);
    return i !== -1 && i > 내자리;
  });
  if (!뒤에올것) { appendChild(표el, 새것); return; }

  표el.children.splice(표el.children.indexOf(뒤에올것), 0, 새것);
  새것.parent = 표el;
  let p: ElementNode | undefined = 표el;
  while (p) { p.dirty = true; p = p.parent; }
}

/** 여백 넷을 요소로 */
export function 여백요소(태그: string, 여백: 여백넷): ElementNode {
  return createElement(태그, {
    left: String(Math.round(여백.left)),
    right: String(Math.round(여백.right)),
    top: String(Math.round(여백.top)),
    bottom: String(Math.round(여백.bottom)),
  });
}
