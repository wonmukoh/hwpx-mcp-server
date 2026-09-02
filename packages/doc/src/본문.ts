/**
 * 본문 — 구역·문단·글.
 *
 * ## 문단은 이렇게 생겼다 (실측)
 *
 * ```xml
 * <hp:p id="…" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
 *   <hp:run charPrIDRef="0"><hp:t>글자</hp:t></hp:run>
 *   <hp:linesegarray><hp:lineseg …/></hp:linesegarray>
 * </hp:p>
 * ```
 *
 * - 글은 `hp:run > hp:t` 안에 있다. 한 문단에 런이 여럿일 수 있고, 런마다 서식이 다르다.
 * - `hp:linesegarray` 는 한글이 **계산해 넣은 줄 배치**다. 우리가 글을 바꾸면 낡은 값이 된다.
 *   한글이 열 때 다시 계산하니 그냥 둔다. 우리가 흉내 내면 더 틀린다.
 *
 * ## 글을 바꿀 때 서식을 잃을 수 있다
 *
 * 런이 여럿인 문단의 글을 통째로 바꾸면 런마다 달랐던 서식이 사라진다.
 * **그것을 말한다.** 조용히 잃으면 모델이 모르고, 사용자는 나중에 안다.
 */

import {
  getAttr, setAttr, textOf, setText, appendChild, createElement, createText,
  removeNode, insertBefore, insertAfter, childrenNamed, firstChildNamed, findAll,
  복제하기, 못쓰는제어문자,
  type ElementNode,
} from '@hwpx/owpml';
import { 됨, 안됨, type 결과 } from './결과.js';

/** 글이 든 곳 — 본문이든 표 셀 안이든 */
export type 글통 = ElementNode;   // hp:sec 또는 hp:subList

export class 문단 {
  /**
   * `source` 는 이 노드가 살던 글이다 (`XmlDocument.source`).
   *
   * 복제할 때 꼭 있어야 한다 — 안 고친 노드는 원본 조각으로 직렬화되기 때문이다.
   * 없이 복제하면 **빈 복제본**이 나온다.
   */
  constructor(readonly el: ElementNode, readonly source: string) {}

  get 런들(): ElementNode[] {
    return childrenNamed(this.el, 'hp:run');
  }

  /** 문단의 글. 런 여럿이면 이어 붙인다 */
  get 글(): string {
    return this.런들
      .flatMap((r) => childrenNamed(r, 'hp:t'))
      .map((t) => textOf(t))
      .join('');
  }

  get 비었나(): boolean {
    return this.글.length === 0;
  }

  get 문단모양(): string {
    return getAttr(this.el, 'paraPrIDRef') ?? '0';
  }

  문단모양주기(id: string): void {
    setAttr(this.el, 'paraPrIDRef', id);
  }

  get 스타일(): string {
    return getAttr(this.el, 'styleIDRef') ?? '0';
  }

  스타일주기(id: string): void {
    setAttr(this.el, 'styleIDRef', id);
  }

  /** 런마다의 글자모양 id */
  get 글자모양들(): string[] {
    return this.런들.map((r) => getAttr(r, 'charPrIDRef') ?? '0');
  }

  /**
   * 문단 전체의 글을 바꾼다.
   *
   * ## 글이 아닌 것은 **절대 지우지 않는다**
   *
   * 런에는 글만 들어 있는 게 아니다. 실측(런 49168개):
   *
   * | 런 안에 든 것 | 런 수 |
   * |---|---|
   * | `hp:t` (글) | 38143 |
   * | `hp:ctrl` | 1294 |
   * | **`hp:tbl` (표)** | 1269 |
   * | **`hp:secPr` (쪽 설정)** | 172 |
   * | `hp:pic` (그림) | 153 |
   * | 도형·수식 | 100 남짓 |
   *
   * 그리고 **글과 표가 같은 런에 든 것이 1134개**다.
   *
   * 처음엔 "첫 런만 남기고 나머지를 지운다" 고 짰다.
   * 그러면 표가 든 문단의 글을 바꿀 때 **표가 통째로 사라진다.**
   * 시험은 다 통과했지만 한글 수용 시험에서 표 갈래가 한 번도 안 돌아 들통났다.
   *
   * 그래서 지금은 **`hp:t` 만 건드린다.** 런은 글만 들어 있다가 텅 빈 것만 지운다.
   */
  글바꾸기(새글: string): 결과<{ 바뀐수: number; 잃은서식: number }> {
    // **XML 이 못 쓰는 글자는 여기서 막는다.**
    //
    // 넣으면 저장까지는 되는데 **한글이 그 파일을 못 연다** — 실제로 겪었다.
    // 규격이 어떤 방법으로도 못 쓰게 한 글자라 이스케이프로도 못 넘긴다.
    // 말없이 빼 버리면 글이 조용히 달라지니, 어디에 있는지 짚어 주고 멈춘다.
    const 나쁜것 = 못쓰는제어문자(새글);
    if (나쁜것) {
      return 안됨(
        `${나쁜것.자리}번째 글자 ${나쁜것.글자} 는 XML 이 못 쓰는 제어문자다`,
        '이 글자가 든 파일은 한글이 못 연다. 빼고 다시 줘라 (줄바꿈·탭은 써도 된다).',
      );
    }
    const 런들 = this.런들;
    const 글칸들 = 런들.flatMap((r) => childrenNamed(r, 'hp:t'));

    if (글칸들.length === 0) {
      const 든것 = [...new Set(런들.flatMap((r) =>
        r.children.filter((c): c is ElementNode => c.kind === 'element').map((c) => c.name)))];
      if (든것.length > 0) {
        // 표·그림만 든 문단이다. 여기에 글을 끼워 넣으면 배치가 어긋난다.
        return 안됨(
          `이 문단에는 글이 없고 ${든것.join(', ')} 이 들어 있다`,
          '표 안에 쓰려면 셀 ID(cell_…)로 가리켜라. 새 글은 문단을 새로 만들어 넣어라.',
        );
      }
      // 정말 빈 문단이면 글칸을 만들어 넣는다
      const 런 = createElement('hp:run', { charPrIDRef: '0' }, [createElement('hp:t', {}, [createText(새글)])]);
      const 배치 = firstChildNamed(this.el, 'hp:linesegarray');
      if (배치) insertBefore(배치, 런);
      else appendChild(this.el, 런);
      return 됨({ 바뀐수: 1, 잃은서식: 0 });
    }

    const 옛글 = this.글;
    if (옛글 === 새글) return 됨({ 바뀐수: 0, 잃은서식: 0 });

    // 글이 든 런들의 서식이 여러 가지였으면 그만큼 잃는다
    const 글든런들 = 런들.filter((r) => childrenNamed(r, 'hp:t').length > 0);
    const 서식가짓수 = new Set(글든런들.map((r) => getAttr(r, 'charPrIDRef') ?? '0')).size;
    const 잃은서식 = 서식가짓수 > 1 ? 서식가짓수 - 1 : 0;

    // 첫 글칸에 새 글을 넣고, 나머지 **글칸만** 지운다
    setText(글칸들[0]!, 새글);
    for (const t of 글칸들.slice(1)) removeNode(t);

    // 글만 들어 있다가 텅 빈 런을 치운다. 표·그림이 남은 런은 그대로 둔다.
    for (const r of 글든런들) {
      const 남은것 = r.children.filter((c) => c.kind === 'element');
      if (남은것.length === 0) removeNode(r);
    }

    if (!짜임같나(옛글, 새글)) 줄정보지우기(this.el);
    return 됨({ 바뀐수: 1, 잃은서식 });
  }

  /**
   * **어구만 바꾼다 — 서식을 안 부순다.**
   *
   * `글바꾸기` 는 문단 글을 통째로 갈아서, 런이 여럿이면 **첫 런의 서식으로 합쳐진다.**
   * 문장 가운데 굵은 낱말이 있으면 그 굵기가 날아간다. 실제로 그랬다:
   *
   *     <hp:t>2026학년도 </hp:t><hp:t>한빛초등학교</hp:t><hp:t> 운영 계획</hp:t>
   *                                ↑ 이것만 굵다
   *
   *     글바꾸기 뒤 → 런 1개, 굵은 것 0개
   *
   * 여기서는 **글자 칸 하나 안에서** 찾아 바꾼다. 런을 안 건드리니 서식이 온전하다.
   * 칸 경계를 넘는 어구는 못 찾는다 — 그건 `못찾음: true` 로 알린다.
   * **찾은 척하고 서식을 부수는 것보다, 못 찾았다고 말하는 편이 낫다.**
   */
  어구바꾸기(찾을글: string, 새글: string, 한도 = Number.MAX_SAFE_INTEGER): 결과<{ 바뀐수: number; 못찾음: boolean }> {
    if (찾을글.length === 0) {
      return 안됨('찾을 글이 비었다', '무엇을 바꿀지 적어라.');
    }
    // **여기도 막는다.** `글바꾸기` 만 막았더니 `replace` 로는 그냥 들어갔다.
    // 저장 길목이 잡아 주긴 하지만 그때는 **어느 고침이 나빴는지** 알 수 없다.
    // 막는 자리는 글이 들어오는 길목마다 있어야 한다.
    const 나쁜것 = 못쓰는제어문자(새글);
    if (나쁜것) {
      return 안됨(
        `바꿀 글의 ${나쁜것.자리}번째 글자 ${나쁜것.글자} 는 XML 이 못 쓰는 제어문자다`,
        '이 글자가 든 파일은 한글이 못 연다. 빼고 다시 줘라 (줄바꿈·탭은 써도 된다).',
      );
    }
    let 바뀐수 = 0;
    for (const r of this.런들) {
      for (const t of childrenNamed(r, 'hp:t')) {
        if (바뀐수 >= 한도) break;
        const 지금 = textOf(t);
        if (!지금.includes(찾을글)) continue;
        setText(t, 지금.split(찾을글).join(새글));
        바뀐수++;
      }
    }
    if (바뀐수 > 0 && !짜임같나(찾을글, 새글)) 줄정보지우기(this.el);
    // 칸 안에서는 못 찾았는데 문단 전체로 보면 있다 → 칸 경계를 넘는 어구다
    return 됨({ 바뀐수, 못찾음: 바뀐수 === 0 && this.글.includes(찾을글) });
  }

  /**
   * 문단 전체에 글자모양을 건다 (런 전부).
   *
   * 문단 안 **어구만** 바꾸는 것은 `강조하기` 가 한다.
   */
  글자모양주기(charPrId: string): 결과<{ 바뀐수: number }> {
    let 바뀐수 = 0;
    for (const r of this.런들) {
      if (getAttr(r, 'charPrIDRef') === charPrId) continue;
      setAttr(r, 'charPrIDRef', charPrId);
      바뀐수++;
    }
    if (바뀐수 === 0) {
      return 안됨(
        '이미 그 글자모양이라 바뀐 것이 없다',
        '다른 모양을 주거나, 지금 모양을 먼저 확인하라.',
      );
    }
    return 됨({ 바뀐수 });
  }

  /**
   * 문단 안의 **어구만** 다른 글자모양으로.
   *
   * 정부 문서가 줄마다 쓴다 — 「제목」 부분만 굵게 같은 것.
   * 런을 셋으로 쪼갠다: 앞 / 찾은 것 / 뒤.
   */
  강조하기(찾을글: string, charPrId: string): 결과<{ 바뀐수: number }> {
    if (찾을글.length === 0) {
      return 안됨('빈 글은 찾을 수 없다', '강조할 어구를 적어라.');
    }

    let 바뀐수 = 0;
    for (const 런 of [...this.런들]) {
      const 글들 = childrenNamed(런, 'hp:t');
      if (글들.length !== 1) continue;         // 조각난 런은 건드리지 않는다
      // 표·그림이 같이 든 런은 복제하면 그것까지 복제된다. 건드리지 않는다.
      // 실측: 글과 표가 같은 런에 든 것이 1134개 있다.
      const 아이들 = 런.children.filter((c) => c.kind === 'element');
      if (아이들.length !== 1) continue;
      const 글 = textOf(글들[0]!);
      const i = 글.indexOf(찾을글);
      if (i === -1) continue;

      const 앞 = 글.slice(0, i);
      const 뒤 = 글.slice(i + 찾을글.length);
      const 본서식 = getAttr(런, 'charPrIDRef') ?? '0';

      // 찾은 것을 담을 런
      const 가운데 = 복제하기(런, this.source);
      setAttr(가운데, 'charPrIDRef', charPrId);
      setText(childrenNamed(가운데, 'hp:t')[0]!, 찾을글);
      insertAfter(런, 가운데);

      if (뒤.length > 0) {
        const 뒷런 = 복제하기(런, this.source);
        setAttr(뒷런, 'charPrIDRef', 본서식);
        setText(childrenNamed(뒷런, 'hp:t')[0]!, 뒤);
        insertAfter(가운데, 뒷런);
      }

      if (앞.length > 0) setText(글들[0]!, 앞);
      else removeNode(런);

      바뀐수++;
    }

    if (바뀐수 === 0) {
      // 왜 못 했는지 갈라서 말한다. "못 찾았다" 만 하면 글이 보이는데도
      // 안 되는 까닭을 모른다.
      const 건너뛴것 = this.런들.filter((r) => {
        const 아이들 = r.children.filter((c) => c.kind === 'element');
        return childrenNamed(r, 'hp:t').length === 1 && 아이들.length > 1
          && textOf(childrenNamed(r, 'hp:t')[0]!).includes(찾을글);
      });
      if (건너뛴것.length) {
        const 든것 = [...new Set(건너뛴것.flatMap((r) =>
          r.children.filter((c): c is ElementNode => c.kind === 'element')
            .map((c) => c.name).filter((n) => n !== 'hp:t')))];
        return 안됨(
          `'${찾을글}' 이 ${든것.join(', ')} 과 같은 런에 있어 건드리지 않았다`,
          '그 런을 쪼개면 표나 그림이 복제된다. 그 글을 따로 문단으로 옮긴 뒤에 강조하라.',
        );
      }
      return 안됨(
        `문단에서 '${찾을글}' 을 못 찾았다`,
        `이 문단의 글: '${this.글.slice(0, 60)}${this.글.length > 60 ? '…' : ''}'`,
      );
    }
    return 됨({ 바뀐수 });
  }

  /**
   * 낡은 줄 배치를 지운다.
   *
   * 글을 바꾸면 `hp:linesegarray` 가 낡는다. 한글은 열 때 다시 계산하니
   * 보통은 그냥 둬도 된다. 다만 **줄 수가 크게 바뀌면** 낡은 값이 남아
   * 첫 그리기에서 어긋나 보인다. 그럴 때 쓴다.
   */
  줄배치지우기(): boolean {
    const a = firstChildNamed(this.el, 'hp:linesegarray');
    if (!a) return false;
    removeNode(a);
    return true;
  }
}

/** 구역 하나 (`Contents/sectionN.xml` 의 뿌리) */
export class 구역 {
  constructor(
    readonly root: ElementNode,
    readonly 이름: string,
    /** 이 구역이 살던 글. 복제할 때 쓴다 */
    readonly source: string,
  ) {}

  /** 본문 바로 아래 문단들. **표 안 문단은 안 센다** */
  get 문단들(): 문단[] {
    return childrenNamed(this.root, 'hp:p').map((p) => new 문단(p, this.source));
  }

  /** 표 안까지 다 (`hp:subList` 안의 것 포함) */
  get 모든문단들(): 문단[] {
    return findAll(this.root, 'hp:p').map((p) => new 문단(p, this.source));
  }

  get 표들(): ElementNode[] {
    return findAll(this.root, 'hp:tbl');
  }

  /** 쪽 설정 (`hp:secPr`). 첫 문단 안에 들어 있다 */
  get 쪽설정(): ElementNode | undefined {
    return findAll(this.root, 'hp:secPr')[0];
  }

  /**
   * 쪽 여백. 값은 HWPUNIT.
   *
   * 실측 — 왜 이게 있어야 하나:
   * 우리 빈 문서는 좌우 여백이 8504, 교육부 업무계획은 5669 다.
   * 차이 2835 HWPUNIT = **28.35pt**, 좌우 합쳐 글 너비가 56.7pt 좁아진다.
   * 그래서 같은 글을 넣어도 줄이 다르게 끊긴다. 재현하려면 이걸 맞춰야 한다.
   */
  get 쪽여백(): Record<string, number> | undefined {
    const pp = this.쪽설정 && firstChildNamed(this.쪽설정, 'hp:pagePr');
    const m = pp && firstChildNamed(pp, 'hp:margin');
    if (!m) return undefined;
    const 나온것: Record<string, number> = {};
    for (const k of ['left', 'right', 'top', 'bottom', 'header', 'footer', 'gutter']) {
      const v = getAttr(m, k);
      if (v !== undefined) 나온것[k] = Number(v);
    }
    return 나온것;
  }

  쪽여백주기(여백: Partial<Record<string, number>>): 결과<{ 바뀐수: number }> {
    const pp = this.쪽설정 && firstChildNamed(this.쪽설정, 'hp:pagePr');
    const m = pp && firstChildNamed(pp, 'hp:margin');
    if (!m) {
      return 안됨(
        '이 구역에 쪽 설정(hp:secPr/hp:pagePr/hp:margin)이 없다',
        '한글이 만든 문서라면 늘 있다. 깨진 문서이거나 빈 구역이다.',
      );
    }
    let 바뀐수 = 0;
    for (const [k, v] of Object.entries(여백)) {
      if (v === undefined) continue;
      const 값 = String(Math.round(v));
      if (getAttr(m, k) === 값) continue;
      setAttr(m, k, 값);
      바뀐수++;
    }
    if (바뀐수 === 0) {
      return 안됨('이미 그 여백이라 바뀐 것이 없다', '다른 값을 주거나 지금 값을 먼저 읽어 보라.');
    }
    return 됨({ 바뀐수 });
  }

  /** 용지 크기 (HWPUNIT). A4 세로는 59528 × 84188 */
  get 용지크기(): { 너비: number; 높이: number } | undefined {
    const pp = this.쪽설정 && firstChildNamed(this.쪽설정, 'hp:pagePr');
    if (!pp) return undefined;
    return { 너비: Number(getAttr(pp, 'width')), 높이: Number(getAttr(pp, 'height')) };
  }

  /** 글이 놓이는 너비 = 용지 너비 − 좌우 여백. 표 폭을 잡을 때 쓴다 */
  get 본문너비(): number | undefined {
    const 크기 = this.용지크기;
    const 여백 = this.쪽여백;
    if (!크기 || !여백) return undefined;
    return 크기.너비 - (여백['left'] ?? 0) - (여백['right'] ?? 0);
  }

  /**
   * 쪽 번호가 이미 있나.
   *
   * 실측: 쪽 번호를 쓰는 문서 52편 가운데 **46편이 `hp:pageNum`** 을 쓴다.
   * 머리말·꼬리말을 쓰는 것은 드물다.
   */
  get 쪽번호있나(): boolean {
    return findAll(this.root, 'hp:pageNum').length > 0;
  }

  /** 첫 문단의 첫 런. 쪽 번호 같은 조종 문자를 넣을 자리 */
  get 첫런(): ElementNode | undefined {
    for (const p of childrenNamed(this.root, 'hp:p')) {
      const r = childrenNamed(p, 'hp:run')[0];
      if (r) return r;
    }
    return undefined;
  }

  /**
   * 문단을 새로 만든다. **쓰던 문단을 복제해서** 만든다.
   *
   * 맨땅에서 짜면 빠진 자식이 생기고, 한글은 그걸 알려 주지 않고 무시한다.
   */
  문단만들기(바탕: 문단, 글: string): 결과<문단> {
    const 새것 = 복제하기(바탕.el, 바탕.source);
    const p = new 문단(새것, 바탕.source);
    // 복제본에 남은 줄 배치는 바탕 문단의 것이라 뜻이 없다
    p.줄배치지우기();
    const r = p.글바꾸기(글);
    if (!r.ok) return r;
    return 됨(p);
  }
}

/**
 * **묵은 줄 정보를 지운다.**
 *
 * `hp:linesegarray` 는 한글이 그릴 때 재어 적어 둔 것이다 —
 * "이 문단은 두 줄이고, 둘째 줄은 8번째 글자부터" 같은 것.
 *
 * 글을 갈면 그 값이 **틀린 값이 된다.** 59자를 넣었는데 8자까지만 적혀 있으면
 * 한글이 그 말을 믿고 글자를 한 줄에 겹쳐 그린다. 실제로 그랬다 —
 * 셀에 긴 글을 넣으니 글자가 뭉개졌다.
 *
 * 지우면 한글이 열 때 다시 잰다. **없는 것이 틀린 것보다 낫다.**
 */
function 줄정보지우기(문단el: ElementNode): void {
  for (const arr of childrenNamed(문단el, 'hp:linesegarray')) removeNode(arr);
}

/**
 * 글자 하나의 **폭 갈래**. 줄이 어디서 넘어가는지는 이것으로 갈린다.
 *
 * `W` 한글·한자·전각 (두 칸 폭) · `S` 빈칸 (여기서 줄이 넘어간다) · `N` 그 밖
 */
function 폭갈래(c: string): 'W' | 'S' | 'N' {
  if (c === ' ' || c === '	') return 'S';
  const n = c.codePointAt(0) ?? 0;
  if ((n >= 0x1100 && n <= 0x115f) || (n >= 0x2e80 && n <= 0xa4cf)
    || (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff)
    || (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6)) return 'W';
  return 'N';
}

/**
 * 두 글의 **자리 짜임**이 같은가 — 글자 수도 폭 갈래도 같은가.
 *
 * 같으면 줄이 똑같은 자리에서 넘어가니, 원래 `hp:linesegarray` 가 여전히 맞다.
 * 그때는 **그대로 두는 편이 낫다.** 지우면 한글이 다시 재는데,
 * 다시 잰 값이 원래 값과 달라 **쪽이 늘어난다** — 정부 문서 427칸을
 * 같은 길이 글로 채웠더니 23쪽이 26쪽이 됐다 (자료/실측.md 15장).
 *
 * 다르면 지운다. 틀린 줄 정보를 믿고 한글이 글자를 겹쳐 그리기 때문이다.
 */
function 짜임같나(옛: string, 새: string): boolean {
  const a = [...옛];
  const b = [...새];
  if (a.length !== b.length) return false;
  return a.every((c, i) => 폭갈래(c) === 폭갈래(b[i] ?? ''));
}
