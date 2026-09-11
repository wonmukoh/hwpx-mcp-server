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

/**
 * 속에 딸린 문단 목록(`hp:subList`)의 속성.
 *
 * 주·메모·글상자·셀이 **다 같은 열 개**를 쓴다 (실측). 하나라도 빠지면 한글이
 * 그 안을 통째로 안 읽는다 — 주는 달렸는데 글이 없는 꼴이 된다.
 */
const 속목록속성: Record<string, string> = {
  id: '', textDirection: 'HORIZONTAL', lineWrap: 'BREAK', vertAlign: 'TOP',
  linkListIDRef: '0', linkListNextIDRef: '0', textWidth: '0', textHeight: '0',
  hasTextRef: '0', hasNumRef: '0',
};

/** 각주·미주 하나를 다는 데 드는 것 */
export interface 주설정 {
  갈래: '각주' | '미주';
  /** 주석 칸에 들어갈 글 */
  내용: string;
  /** 보일 번호. 문서가 이미 달린 주를 세어 정한다 */
  번호: number;
  /** 문서 안에서 안 겹치는 수 (`instId`) */
  instId: string;
  /** 이 어구 **바로 뒤**에 단다. 안 주면 문단 끝 */
  찾을글?: string;
  /** 주석 칸 문단·글자 모양. 한글은 「각주」·「미주」 스타일을 쓴다 */
  문단모양?: string; 스타일?: string; 글자모양?: string;
}

/** 메모 하나를 다는 데 드는 것 */
export interface 메모설정 {
  /** 메모 칸에 들어갈 글 */
  내용: string;
  /** 이 어구에 메모를 건다 */
  찾을글: string;
  /** 몇 번째 메모인가 (1부터). `ID`·`Number` 에 들어간다 */
  번호: number;
  시작id: string; 밭id: string;
  /** 메모를 단 사람. 한글은 윈도 계정 이름을 넣는다 */
  지은이: string;
  /** 만든 때. `2026-09-10T09:45:44Z` 꼴 */
  때: string;
  문단모양?: string; 스타일?: string; 글자모양?: string;
}

/** 수식 하나를 넣는 데 드는 것 */
export interface 수식설정 {
  /** 한글 수식 스크립트. 빈칸은 `` `` `` 두 개다 */
  식: string;
  /** 이 어구 바로 뒤에 넣는다. 안 주면 문단 끝 */
  찾을글?: string;
  /** 문서 안에서 안 겹치는 수 */
  instId: string;
}

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
   * **글에 하이퍼링크를 건다.**
   *
   * 실물 짜임 (실측 31항) —
   *
   *     hp:run > hp:ctrl > hp:fieldBegin type="HYPERLINK"
   *                          └ hp:parameters > hp:stringParam name="Command"|"Path"
   *     hp:run > hp:t  (링크 글)
   *     hp:run > hp:ctrl > hp:fieldEnd beginIDRef="…"
   *
   * **런 셋이다.** 시작 표시·글·끝 표시가 따로 있고, `fieldEnd/@beginIDRef` 가
   * `fieldBegin/@id` 를, `@fieldid` 끼리도 서로를 가리킨다. 하나라도 어긋나면
   * 한글이 링크를 안 만든다.
   *
   * 글을 찾아 런을 쪼개는 것은 `강조하기` 와 같다 — 표·그림이 같이 든 런은
   * 건드리지 않는다.
   */
  링크걸기(찾을글: string, 주소: string, 아이디들: (n: number) => string):
  결과<{ 바뀐수: number }> {
    if (찾을글.length === 0) return 안됨('빈 글은 찾을 수 없다', '링크를 걸 어구를 적어라.');
    if (주소.trim().length === 0) return 안됨('주소가 비었다', '링크가 갈 곳을 적어라.');

    let 바뀐수 = 0;
    for (const 런 of [...this.런들]) {
      const 글들 = childrenNamed(런, 'hp:t');
      if (글들.length !== 1) continue;
      const 아이들 = 런.children.filter((c) => c.kind === 'element');
      if (아이들.length !== 1) continue;   // 표·그림이 같이 든 런은 안 건드린다
      const 글 = textOf(글들[0]!);
      const i = 글.indexOf(찾을글);
      if (i === -1) continue;

      const 앞 = 글.slice(0, i);
      const 뒤 = 글.slice(i + 찾을글.length);
      const 본서식 = getAttr(런, 'charPrIDRef') ?? '0';

      // **id 는 둘 다 새로 뜬다.** 문서 안에서 겹치면 한글이 짝을 잘못 맺는다.
      const 시작id = 아이디들(0);
      const 밭id = 아이디들(1);

      const 가운데 = 복제하기(런, this.source);
      setText(childrenNamed(가운데, 'hp:t')[0]!, 찾을글);
      insertAfter(런, 가운데);

      const 끝런 = createElement('hp:run', { charPrIDRef: 본서식 });
      const 끝틀 = createElement('hp:ctrl', {});
      appendChild(끝틀, createElement('hp:fieldEnd', { beginIDRef: 시작id, fieldid: 밭id }));
      appendChild(끝런, 끝틀);
      appendChild(끝런, createElement('hp:t', {}));
      insertAfter(가운데, 끝런);

      if (뒤.length > 0) {
        const 뒷런 = 복제하기(런, this.source);
        setAttr(뒷런, 'charPrIDRef', 본서식);
        setText(childrenNamed(뒷런, 'hp:t')[0]!, 뒤);
        insertAfter(끝런, 뒷런);
      }

      const 시작런 = createElement('hp:run', { charPrIDRef: 본서식 });
      const 시작틀 = createElement('hp:ctrl', {});
      const 밭 = createElement('hp:fieldBegin', {
        id: 시작id, type: 'HYPERLINK', name: '', editable: '0',
        dirty: '1', zorder: '-1', fieldid: 밭id,
      });
      // **여섯 개를 다 넣는다.** 실측한 문서가 `cnt="6"` 에 이 여섯이다.
      // Command 만 넣고 Path 를 빼면 한글이 링크를 만들되 주소를 잃는다.
      const 값들 = createElement('hp:parameters', { cnt: '6', name: '' });
      const 셈 = (태그: string, 이름: string, 값: string) => {
        const e = createElement(태그, { name: 이름 });
        appendChild(e, createText(값));
        appendChild(값들, e);
      };
      셈('hp:integerParam', 'Prop', '0');
      셈('hp:stringParam', 'Command', 주소);
      셈('hp:stringParam', 'Path', 주소);
      셈('hp:stringParam', 'Category', 'HWPHYPERLINK_TYPE_HWP');
      셈('hp:stringParam', 'TargetType', 'HWPHYPERLINK_TARGET_BOOKMARK');
      셈('hp:stringParam', 'DocOpenType', 'HWPHYPERLINK_JUMP_CURRENTTAB');
      appendChild(밭, 값들);
      appendChild(시작틀, 밭);
      appendChild(시작런, 시작틀);
      insertBefore(가운데, 시작런);

      if (앞.length > 0) setText(글들[0]!, 앞);
      else removeNode(런);

      바뀐수++;
    }

    if (바뀐수 === 0) {
      // **「못 찾았다」로 뭉뚱그리지 않는다.** 글은 있는데 그 런을 못 건드리는
      // 때가 있다 — 이미 주·메모가 걸려 런이 여러 조각이거나, 표·그림이 같이
      // 든 런이다. 둘을 같은 말로 알리면 부르는 쪽이 어구를 고치며 헤맨다.
      if (this.글.includes(찾을글)) {
        return 안됨(
          `'${찾을글}' 은 있는데 **런을 쪼갤 수 없는 자리**다`,
          '그 어구가 든 런에 표·그림이 같이 있거나, 이미 주·메모가 걸려 조각나 있다. '
          + '앞뒤로 더 넓은 어구를 주거나, 링크를 먼저 걸고 주·메모를 나중에 달아라.',
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
   * **책갈피를 단다.**
   *
   *     hp:run > hp:ctrl > hp:bookmark name="…"
   *
   * 하이퍼링크와 달리 **요소 하나로 끝난다** — 짝도 없고 값도 없다.
   * 문서 안에서 이름이 겹치면 한글이 뒤엣것으로 간다. 겹침은 부르는 쪽이 본다.
   */
  책갈피달기(이름: string): 결과<{ 이름: string }> {
    const 다듬 = 이름.trim();
    if (다듬.length === 0) return 안됨('책갈피 이름이 비었다', '가리킬 이름을 적어라.');
    if (this.책갈피들.includes(다듬)) {
      return 안됨(`이 문단에 이미 '${다듬}' 책갈피가 있다`, '다른 이름을 주거나 그대로 써라.');
    }

    const 런 = createElement('hp:run', { charPrIDRef: this.글자모양들[0] ?? '0' });
    const 틀 = createElement('hp:ctrl', {});
    appendChild(틀, createElement('hp:bookmark', { name: 다듬 }));
    appendChild(런, 틀);

    const 첫런 = this.런들[0];
    if (첫런 === undefined) appendChild(this.el, 런);
    else insertBefore(첫런, 런);
    return 됨({ 이름: 다듬 });
  }

  /** 이 문단에 달린 책갈피 이름들 */
  get 책갈피들(): string[] {
    return findAll(this.el, 'hp:bookmark')
      .map((e) => getAttr(e, 'name'))
      .filter((v): v is string => v !== undefined);
  }

  /** 이 문단에 걸린 하이퍼링크 주소들 */
  get 링크들(): string[] {
    return findAll(this.el, 'hp:fieldBegin')
      .filter((e) => getAttr(e, 'type') === 'HYPERLINK')
      .flatMap((e) => {
        const 값들 = firstChildNamed(e, 'hp:parameters');
        if (값들 === undefined) return [];
        const p = childrenNamed(값들, 'hp:stringParam')
          .find((x) => getAttr(x, 'name') === 'Command');
        return p === undefined ? [] : [textOf(p)];
      });
  }

  /**
   * **각주·미주를 단다.**
   *
   * 실측(`ref-note.hwpx`) — 주는 **런 안**에 `hp:ctrl` 로 들어간다.
   * 글 옆에 붙는 표시일 뿐이라 런을 쪼개지 않는다. 하이퍼링크와 다른 점이다.
   *
   * ```xml
   * hp:run > hp:t «각주를 달 문장이다.»
   *        > hp:ctrl > hp:footNote number="1" suffixChar="41" instId="…"
   *                      └ hp:subList > hp:p > hp:run
   *                           ├ hp:ctrl > hp:autoNum num="1" numType="FOOTNOTE"
   *                           │              └ hp:autoNumFormat type="DIGIT" suffixChar=")"
   *                           └ hp:t « 각주 내용이다.»
   * ```
   *
   * **`hp:autoNum` 이 빠지면 번호가 안 보인다.** 주는 달렸는데 본문에도 주석 칸에도
   * 숫자가 없어, 무엇이 어느 주인지 못 읽는 문서가 된다. 미주는 `numType` 만
   * `ENDNOTE` 로 다르다 — 나머지는 똑같다.
   *
   * `suffixChar="41"` 은 글자 코드 41, 곧 `)` 다. 안쪽 `autoNumFormat` 의
   * `suffixChar=")"` 와 같은 것을 **두 자리에** 적는다 (한글이 그렇게 쓴다).
   */
  주달기(설정: 주설정): 결과<{ 갈래: '각주' | '미주'; 번호: number }> {
    if (설정.내용.trim().length === 0) {
      return 안됨('주 내용이 비었다', `${설정.갈래}에 넣을 글을 적어라.`);
    }
    const 나쁜것 = 못쓰는제어문자(설정.내용);
    if (나쁜것) {
      return 안됨(
        `${나쁜것.자리}번째 글자 ${나쁜것.글자} 는 XML 이 못 쓰는 제어문자다`,
        '이 글자가 든 파일은 한글이 못 연다. 빼고 다시 줘라.',
      );
    }

    // 어느 글 뒤에 붙일까. 찾을글이 있으면 **그 어구 바로 뒤**, 없으면 문단 끝.
    let 붙일곳: ElementNode | undefined;
    let 뒤글 = '';
    바깥: for (const 런 of this.런들) {
      for (const t of childrenNamed(런, 'hp:t')) {
        const 글 = textOf(t);
        if (설정.찾을글 === undefined) { 붙일곳 = t; continue; }
        const i = 글.indexOf(설정.찾을글);
        if (i === -1) continue;
        const 끝 = i + 설정.찾을글.length;
        붙일곳 = t;
        뒤글 = 글.slice(끝);
        setText(t, 글.slice(0, 끝));
        break 바깥;
      }
    }
    if (붙일곳 === undefined) {
      return 안됨(
        설정.찾을글 === undefined
          ? '이 문단에 글이 없어 주를 달 자리가 없다'
          : `문단에서 '${설정.찾을글}' 을 못 찾았다`,
        `이 문단의 글: '${this.글.slice(0, 60)}${this.글.length > 60 ? '…' : ''}'`,
      );
    }

    const 갈래이름 = 설정.갈래 === '각주' ? 'hp:footNote' : 'hp:endNote';
    const 번호종류 = 설정.갈래 === '각주' ? 'FOOTNOTE' : 'ENDNOTE';

    const 틀 = createElement('hp:ctrl', {});
    const 주 = createElement(갈래이름, {
      number: String(설정.번호), suffixChar: '41', instId: 설정.instId,
    });
    const 목록 = createElement('hp:subList', 속목록속성);
    const 안문단 = createElement('hp:p', {
      id: '0', paraPrIDRef: 설정.문단모양 ?? '0', styleIDRef: 설정.스타일 ?? '0',
      pageBreak: '0', columnBreak: '0', merged: '0',
    });
    const 안런 = createElement('hp:run', { charPrIDRef: 설정.글자모양 ?? '0' });

    const 번호틀 = createElement('hp:ctrl', {});
    const 자동번호 = createElement('hp:autoNum', {
      num: String(설정.번호), numType: 번호종류,
    });
    appendChild(자동번호, createElement('hp:autoNumFormat', {
      type: 'DIGIT', userChar: '', prefixChar: '', suffixChar: ')', supscript: '0',
    }));
    appendChild(번호틀, 자동번호);
    appendChild(안런, 번호틀);

    const 글칸 = createElement('hp:t', {});
    setText(글칸, ` ${설정.내용}`);
    appendChild(안런, 글칸);

    appendChild(안문단, 안런);
    appendChild(목록, 안문단);
    appendChild(주, 목록);
    appendChild(틀, 주);
    insertAfter(붙일곳, 틀);

    // 어구 뒤에 남은 글은 **주 뒤로** 옮긴다. 안 옮기면 주가 문장 끝으로 밀린다.
    if (뒤글.length > 0) {
      const 남은 = createElement('hp:t', {});
      setText(남은, 뒤글);
      insertAfter(틀, 남은);
    }
    return 됨({ 갈래: 설정.갈래, 번호: 설정.번호 });
  }

  /** 이 문단에 달린 주들 */
  get 주들(): { 갈래: '각주' | '미주'; 번호: string; 글: string }[] {
    const 것: { 갈래: '각주' | '미주'; 번호: string; 글: string }[] = [];
    for (const [태그, 갈래] of [['hp:footNote', '각주'], ['hp:endNote', '미주']] as const) {
      for (const e of findAll(this.el, 태그)) {
        것.push({ 갈래, 번호: getAttr(e, 'number') ?? '', 글: textOf(e).trim() });
      }
    }
    return 것;
  }

  /**
   * **메모를 단다.**
   *
   * 실측(`ref-memo.hwpx`) — 메모는 요소가 아니라 **밭(field)** 이다.
   * `<hp:memo>` 를 찾으면 표본 45편에서 **하나도 안 나온다.** 그래서 「메모는
   * 안 쓴다」로 세고 있었는데, 실은 **엉뚱한 것을 찾고 있었다.**
   *
   * ```xml
   * hp:run > hp:ctrl > hp:fieldBegin type="MEMO" id="…" fieldid="…"
   *                      ├ hp:parameters cnt="7"   (Author·ID·Number·CreateDateTime …)
   *                      └ hp:subList > hp:p > hp:run > hp:t «메모 내용»   ← 몸통이 여기다
   *        > hp:t «메모를 달 문장»
   *        > hp:ctrl > hp:fieldEnd beginIDRef="…" fieldid="…"
   * ```
   *
   * 하이퍼링크와 짜임이 같은데 **런 하나 안에 다 든다** — 한글이 그렇게 쓴다.
   * 시작·글·끝이 한 런의 자식으로 나란히 놓인다.
   *
   * **메모 글은 `hp:subList` 안에 있다.** 처음 만든 기준 파일은 메모를 넣기만 하고
   * 글을 안 쳐서 그 자리가 비어 있었다 — 「어디 담기나」를 못 보던 것이다.
   * 기준 파일 만드는 절차에 글 치는 것을 넣고서야 보였다.
   */
  메모달기(설정: 메모설정): 결과<{ 바뀐수: number }> {
    if (설정.내용.trim().length === 0) return 안됨('메모 내용이 비었다', '메모에 적을 글을 줘라.');
    if (설정.찾을글.length === 0) return 안됨('빈 글은 찾을 수 없다', '메모를 달 어구를 적어라.');

    // **런을 복제하지 않는다.** 글칸(`hp:t`) 하나를 셋으로 가르고 그 사이에
    // 표시를 끼울 뿐이라, 표·그림이 같이 든 런이라도 다치게 할 것이 없다.
    // (링크는 런을 복제하므로 거기서는 막는다 — 짜임이 달라 규칙도 다르다.)
    const 후보 = this.런들.flatMap((런) => childrenNamed(런, 'hp:t').map((t) => ({ 런, t })));
    for (const { t: 글칸 } of 후보) {
      const 글 = textOf(글칸);
      const i = 글.indexOf(설정.찾을글);
      if (i === -1) continue;

      const 앞 = 글.slice(0, i);
      const 뒤 = 글.slice(i + 설정.찾을글.length);

      const 시작틀 = createElement('hp:ctrl', {});
      const 밭 = createElement('hp:fieldBegin', {
        id: 설정.시작id, type: 'MEMO', name: '', editable: '1',
        dirty: '1', zorder: '1', fieldid: 설정.밭id,
      });
      const 값들 = createElement('hp:parameters', { cnt: '7', name: '' });
      const 셈 = (태그: string, 이름: string, 값: string): void => {
        const e = createElement(태그, { name: 이름 });
        appendChild(e, createText(값));
        appendChild(값들, e);
      };
      셈('hp:integerParam', 'Prop', '0');
      // Command 는 한글이 제 안에서 쓰는 손잡이다. 가운데 두 수는 만들 때마다
      // 달라졌다 (실측: 같은 절차로 두 번 만든 기준 파일이 서로 달랐다) —
      // 뜻을 지고 있지 않다. 꼴만 맞춰 준다.
      셈('hp:stringParam', 'Command',
        `MEMO/65535/${설정.번호}/${설정.밭id}/${설정.시작id}/${설정.지은이}/\\;;`);
      셈('hp:stringParam', 'ID', `memo${설정.번호}`);
      셈('hp:integerParam', 'Number', String(설정.번호));
      셈('hp:stringParam', 'Author', 설정.지은이);
      셈('hp:stringParam', 'MemoShapeIDRef', '65535');
      셈('hp:stringParam', 'CreateDateTime', 설정.때);
      appendChild(밭, 값들);

      const 목록 = createElement('hp:subList', 속목록속성);
      const 안문단 = createElement('hp:p', {
        id: '0', paraPrIDRef: 설정.문단모양 ?? '0', styleIDRef: 설정.스타일 ?? '0',
        pageBreak: '0', columnBreak: '0', merged: '0',
      });
      const 안런 = createElement('hp:run', { charPrIDRef: 설정.글자모양 ?? '0' });
      const 몸통 = createElement('hp:t', {});
      setText(몸통, 설정.내용);
      appendChild(안런, 몸통);
      appendChild(안문단, 안런);
      appendChild(목록, 안문단);
      appendChild(밭, 목록);
      appendChild(시작틀, 밭);

      const 끝틀 = createElement('hp:ctrl', {});
      appendChild(끝틀, createElement('hp:fieldEnd', {
        beginIDRef: 설정.시작id, fieldid: 설정.밭id,
      }));

      // 앞글 → 시작 → 메모 걸린 글 → 끝 → 뒷글. **다 한 런 안이다.**
      setText(글칸, 앞);
      insertAfter(글칸, 시작틀);
      const 가운데 = createElement('hp:t', {});
      setText(가운데, 설정.찾을글);
      insertAfter(시작틀, 가운데);
      insertAfter(가운데, 끝틀);
      const 뒷글칸 = createElement('hp:t', {});
      setText(뒷글칸, 뒤);
      insertAfter(끝틀, 뒷글칸);

      return 됨({ 바뀐수: 1 });
    }

    return 안됨(
      `문단에서 '${설정.찾을글}' 을 못 찾았다`,
      `이 문단의 글: '${this.글.slice(0, 60)}${this.글.length > 60 ? '…' : ''}'`,
    );
  }

  /** 이 문단에 달린 메모들 */
  get 메모들(): { 글: string; 지은이: string }[] {
    return findAll(this.el, 'hp:fieldBegin')
      .filter((e) => getAttr(e, 'type') === 'MEMO')
      .map((e) => {
        const 값들 = firstChildNamed(e, 'hp:parameters');
        const 지은이 = 값들 === undefined ? undefined
          : childrenNamed(값들, 'hp:stringParam').find((x) => getAttr(x, 'name') === 'Author');
        const 목록 = firstChildNamed(e, 'hp:subList');
        return {
          글: 목록 === undefined ? '' : textOf(목록),
          지은이: 지은이 === undefined ? '' : textOf(지은이),
        };
      });
  }

  /**
   * **수식을 넣는다.**
   *
   * 실측(교육부 기본계획) — 수식은 도형처럼 개체인데 **`hp:script` 한 줄이 전부**다.
   * 그 안이 한글 수식 스크립트다 (`{a} over {b}`, `x^2`, `sqrt{2}` …).
   *
   * ```xml
   * hp:run > hp:equation version="Equation Version 60" baseLine="66" …
   *            ├ hp:sz · hp:pos · hp:outMargin · hp:shapeComment
   *            └ hp:script «{해당``유형``입학정원} over {전체``입학정원}»
   * ```
   *
   * **`` ` `` 두 개가 빈칸 하나다.** 한글 수식 문법이 그렇다 — 그냥 빈칸을 넣으면
   * 한글이 토막을 갈라 읽어 식이 달라진다. 부르는 쪽 글을 그대로 넣는다.
   *
   * 크기는 우리가 못 잰다 — 한글이 식을 그려 봐야 안다. 실측한 값(9400×2300)을
   * 바탕으로 글자 수에 맞춰 늘린다. **한글이 열면 제가 다시 잰다.**
   */
  수식넣기(설정: 수식설정): 결과<{ 바뀐수: number }> {
    if (설정.식.trim().length === 0) return 안됨('수식이 비었다', '넣을 식을 적어라.');
    const 나쁜것 = 못쓰는제어문자(설정.식);
    if (나쁜것) {
      return 안됨(
        `${나쁜것.자리}번째 글자 ${나쁜것.글자} 는 XML 이 못 쓰는 제어문자다`,
        '이 글자가 든 파일은 한글이 못 연다. 빼고 다시 줘라.',
      );
    }

    let 붙일곳: ElementNode | undefined;
    for (const 런 of this.런들) {
      for (const t of childrenNamed(런, 'hp:t')) {
        if (설정.찾을글 === undefined) { 붙일곳 = t; continue; }
        const 글 = textOf(t);
        const i = 글.indexOf(설정.찾을글);
        if (i === -1) continue;
        const 끝 = i + 설정.찾을글.length;
        const 뒤 = 글.slice(끝);
        setText(t, 글.slice(0, 끝));
        붙일곳 = t;
        if (뒤.length > 0) {
          const 남은 = createElement('hp:t', {});
          setText(남은, 뒤);
          insertAfter(t, 남은);
        }
        break;
      }
      if (설정.찾을글 !== undefined && 붙일곳 !== undefined) break;
    }
    if (붙일곳 === undefined) {
      return 안됨(
        설정.찾을글 === undefined
          ? '이 문단에 글이 없어 수식을 놓을 자리가 없다'
          : `문단에서 '${설정.찾을글}' 을 못 찾았다`,
        `이 문단의 글: '${this.글.slice(0, 60)}${this.글.length > 60 ? '…' : ''}'`,
      );
    }

    // 글자 수로 폭을 어림한다. 한글이 열 때 다시 재니 **어림이면 된다** —
    // 다만 0 으로 두면 한글이 식을 안 그린다 (실측: 그림에서 겪은 것과 같다).
    // 실측: `x^2 + y^2 = z^2` (15자) 를 한글이 5200×1163 으로 잡았다 — 한 자에 350 남짓.
    const 너비 = Math.max(1200, Math.min(40000, [...설정.식].length * 350));
    const 높이 = 1163;
    const 식 = createElement('hp:equation', {
      id: 설정.instId, zOrder: '0', numberingType: 'EQUATION',
      textWrap: 'TOP_AND_BOTTOM', textFlow: 'BOTH_SIDES', lock: '0',
      dropcapstyle: 'None', version: 'Equation Version 60', baseLine: '89',
      textColor: '#000000', baseUnit: '1000', lineMode: 'CHAR', font: 'HancomEQN',
    });
    appendChild(식, createElement('hp:sz', {
      width: String(너비), widthRelTo: 'ABSOLUTE',
      height: String(높이), heightRelTo: 'ABSOLUTE', protect: '0',
    }));
    appendChild(식, createElement('hp:pos', {
      treatAsChar: '1', affectLSpacing: '0', flowWithText: '1', allowOverlap: '0',
      holdAnchorAndSO: '0', vertRelTo: 'PARA', horzRelTo: 'PARA',
      vertAlign: 'TOP', horzAlign: 'LEFT', vertOffset: '0', horzOffset: '0',
    }));
    appendChild(식, createElement('hp:outMargin', {
      left: '56', right: '56', top: '0', bottom: '0',
    }));
    const 말 = createElement('hp:shapeComment', {});
    setText(말, '수식입니다.');
    appendChild(식, 말);
    const 본문 = createElement('hp:script', {});
    setText(본문, 설정.식);
    appendChild(식, 본문);

    insertAfter(붙일곳, 식);
    return 됨({ 바뀐수: 1 });
  }

  /** 이 문단에 든 수식들 (스크립트 그대로) */
  get 수식들(): string[] {
    return findAll(this.el, 'hp:equation').map((e) => {
      const s = firstChildNamed(e, 'hp:script');
      return s === undefined ? '' : textOf(s);
    });
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

  /**
   * **쪽 테두리·배경이 가리키는 borderFill 번호들.**
   *
   * `hp:secPr > hp:pageBorderFill` 이다. 실측: 구역마다 **셋**이 있고
   * (`type` 이 `BOTH`·`EVEN`·`ODD`) 표본 108개가 **전부 `borderFillIDRef=1`**
   * 을 가리킨다. 그러니 만드는 것이 아니라 **가리키는 곳을 바꾸는** 일이다.
   *
   * 홀·짝 쪽을 따로 꾸미는 문서를 위해 셋을 다 준다.
   */
  get 쪽테두리들(): { 종류: string; 번호: string }[] {
    const sp = this.쪽설정;
    if (sp === undefined) return [];
    return childrenNamed(sp, 'hp:pageBorderFill').map((e) => ({
      종류: getAttr(e, 'type') ?? 'BOTH',
      번호: getAttr(e, 'borderFillIDRef') ?? '0',
    }));
  }

  /**
   * 쪽 테두리·배경이 가리킬 borderFill 을 바꾼다.
   *
   * `종류` 를 안 주면 **셋 다** 바꾼다 — 홀·짝만 바꾸고 싶은 쪽이 드물고,
   * 하나만 바꾸면 짝수 쪽에서만 테두리가 사라져 눈치채기 어렵다.
   */
  쪽테두리주기(번호: string, 종류?: string): 결과<{ 바뀐수: number }> {
    const sp = this.쪽설정;
    if (sp === undefined) {
      return 안됨('이 구역에 쪽 설정(hp:secPr)이 없다', '한글이 만든 문서라면 늘 있다.');
    }
    const 것들 = childrenNamed(sp, 'hp:pageBorderFill')
      .filter((e) => 종류 === undefined || getAttr(e, 'type') === 종류);
    if (것들.length === 0) {
      return 안됨(
        `이 구역에 hp:pageBorderFill${종류 === undefined ? '' : `(type=${종류})`} 이 없다`,
        '한글이 만든 문서라면 BOTH·EVEN·ODD 셋이 있다.',
      );
    }
    let 바뀐수 = 0;
    for (const e of 것들) {
      if (getAttr(e, 'borderFillIDRef') === 번호) continue;
      setAttr(e, 'borderFillIDRef', 번호);
      바뀐수++;
    }
    if (바뀐수 === 0) {
      return 안됨('이미 그 테두리라 바뀐 것이 없다', '다른 번호를 주거나 지금 값을 먼저 읽어 보라.');
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
   * **몇 단인가.** 안 나뉘었으면 1.
   *
   * 실측 — `hp:colPr` 는 문서 45편에 **60개**가 있는데 그 가운데 **59개가
   * `colCount="1"`** 이다. 곧 「요소가 있다」는 「다단을 쓴다」가 아니다.
   * 구역마다 늘 하나씩 놓이고, 안 나뉜 구역도 이걸 지고 있다.
   */
  get 단수(): number {
    const c = findAll(this.root, 'hp:colPr')[0];
    if (c === undefined) return 1;
    const n = Number(getAttr(c, 'colCount'));
    return Number.isFinite(n) && n >= 1 ? n : 1;
  }

  /** 단 사이 간격 (HWPUNIT). 안 나뉘었으면 0 */
  get 단간격(): number {
    const c = findAll(this.root, 'hp:colPr')[0];
    if (c === undefined) return 0;
    const n = Number(getAttr(c, 'sameGap'));
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * **단을 나눈다.**
   *
   *     hp:p > hp:run > hp:ctrl > hp:colPr type="NEWSPAPER" layout="LEFT"
   *                                        colCount="2" sameSz="1" sameGap="2268"
   *
   * 쪽 설정(`hp:secPr`)과 **같은 런**에 들어간다. 구역의 첫 문단이다.
   *
   * 폭은 안 적는다 — `sameSz="1"` 이면 한글이 남은 너비를 똑같이 나눈다.
   * `hp:colSz` 로 단마다 폭을 따로 주는 길도 있지만, 실측 60개 가운데 그렇게
   * 한 것이 **하나도 없다.** 없는 길을 만들면 맞는지 잴 데가 없다.
   *
   * `sameGap` 기본 2268 HWPUNIT = 8mm 다 (실측: `ref-column.hwpx`).
   */
  단주기(단수: number, 간격?: number): 결과<{ 단수: number; 간격: number }> {
    if (!Number.isInteger(단수) || 단수 < 1 || 단수 > 12) {
      return 안됨(`단 수가 이상하다: ${단수}`, '1부터 12 사이의 정수를 줘라. 1이면 안 나눈다.');
    }
    const 새간격 = Math.round(간격 ?? (단수 === 1 ? 0 : 2268));
    if (새간격 < 0) return 안됨(`단 간격이 음수다: ${새간격}`, '0 이상을 줘라.');

    let c = findAll(this.root, 'hp:colPr')[0];
    if (c === undefined) {
      // 없으면 만든다. **쪽 설정이 든 런**에 붙인다 — 한글이 거기서 찾는다.
      const 런 = this.첫런;
      if (런 === undefined) {
        return 안됨('이 구역에 런이 없어 단 설정을 놓을 데가 없다', '빈 구역이거나 깨진 문서다.');
      }
      const 틀 = createElement('hp:ctrl', {});
      c = createElement('hp:colPr', {
        id: '', type: 'NEWSPAPER', layout: 'LEFT',
        colCount: '1', sameSz: '1', sameGap: '0',
      });
      appendChild(틀, c);
      appendChild(런, 틀);
    }

    if (getAttr(c, 'colCount') === String(단수) && getAttr(c, 'sameGap') === String(새간격)) {
      return 안됨('이미 그 단이라 바뀐 것이 없다', '다른 값을 주거나 지금 값을 먼저 읽어 보라.');
    }
    setAttr(c, 'colCount', String(단수));
    setAttr(c, 'sameSz', '1');
    setAttr(c, 'sameGap', String(새간격));
    return 됨({ 단수, 간격: 새간격 });
  }

  /**
   * **이 구역이 가리키는 바탕쪽 id 들.** 없으면 빈 배열.
   *
   * 바탕쪽 자체는 `hp:secPr` 안이 아니라 **딴 부품**에 있다. 여기 있는 것은
   * 가리키는 표 하나뿐이다 (`자료/실측.md` 32항).
   */
  get 바탕쪽참조들(): string[] {
    const sp = this.쪽설정;
    if (sp === undefined) return [];
    return childrenNamed(sp, 'hp:masterPage')
      .map((e) => getAttr(e, 'idRef'))
      .filter((v): v is string => v !== undefined);
  }

  /**
   * **바탕쪽을 가리키게 한다.**
   *
   *     <hp:secPr … masterPageCnt="1">
   *        … <hp:pageBorderFill …/>
   *        <hp:masterPage idRef="masterpage0"/>     ← 맨 뒤다
   *     </hp:secPr>
   *
   * **`masterPageCnt` 를 안 세우면 한글이 안 읽는다.** 반대로 세워 놓고 가리키는
   * 부품이 없으면 **파일을 아예 못 연다** — 한글은 그 수만큼 딴 데서 찾는다.
   * 그래서 부품을 먼저 내고 그 id 를 받아서 부른다.
   */
  바탕쪽걸기(idRef: string): 결과<{ idRef: string }> {
    const sp = this.쪽설정;
    if (sp === undefined) {
      return 안됨('이 구역에 쪽 설정(hp:secPr)이 없다', '한글이 만든 문서라면 늘 있다.');
    }
    if (this.바탕쪽참조들.includes(idRef)) {
      return 안됨(`이 구역이 이미 ${idRef} 을 가리킨다`, '한 번만 걸면 된다.');
    }
    appendChild(sp, createElement('hp:masterPage', { idRef }));
    setAttr(sp, 'masterPageCnt', String(childrenNamed(sp, 'hp:masterPage').length));
    return 됨({ idRef });
  }

  /**
   * 바탕쪽 부품에 넣을 **글 자리**를 만든다.
   *
   * 문단은 **쓰던 것을 뜬다** — 맨땅에서 짜면 자식이 빠지고, 한글은 빠진 것을
   * 알려 주지 않고 그 뒤를 통째로 무시한다.
   *
   * 다만 구역의 첫 문단은 **쪽 설정을 지고 있다.** 그대로 뜨면 바탕쪽 안에
   * `hp:secPr` 이 딸려 들어간다 — 쪽 설정이 둘인 문서가 된다. 글만 남긴다.
   */
  바탕쪽문단(글: string): 결과<ElementNode> {
    const 바탕 = this.문단들.find((p) => !p.비었나) ?? this.문단들[0];
    if (바탕 === undefined) {
      return 안됨('이 구역에 문단이 없다', '빈 구역이라 바탕쪽에 넣을 문단을 못 뜬다.');
    }
    const 새것 = 복제하기(바탕.el, 바탕.source);
    const p = new 문단(새것, 바탕.source);
    p.줄배치지우기();
    // 글 말고는 다 걷어낸다 — 쪽 설정·표·그림이 딸려 가면 안 된다
    for (const r of childrenNamed(새것, 'hp:run')) {
      const 아이들 = r.children.filter((c) => c.kind === 'element') as ElementNode[];
      if (아이들.some((c) => c.name !== 'hp:t')) { removeNode(r); continue; }
    }
    if (childrenNamed(새것, 'hp:run').length === 0) {
      const 런 = createElement('hp:run', { charPrIDRef: '0' });
      appendChild(런, createElement('hp:t', {}));
      appendChild(새것, 런);
    }
    const r2 = new 문단(새것, 바탕.source).글바꾸기(글);
    if (!r2.ok) return r2;
    void p;
    return 됨(새것);
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

/**
 * **곁글인가** — 각주·미주·메모 **안에** 든 문단인가.
 *
 * 본문 글이 아니다. 한글은 각주를 쪽 아래에, 메모를 화면에만 그린다.
 * 그런데 XML 로는 다 `hp:p` 라, 문단을 통째로 훑으면 **본문 글에 섞여 나온다.**
 *
 * 실제로 겪었다 — `get_content` 로 문서를 읽으면
 *
 *     가나다 라마바 사아자
 *     출처 확인            ← 메모다. 본문에 없는 글이다
 *     교육부(2026), 업무계획. ← 각주다
 *
 * 이렇게 나왔다. 읽는 쪽은 이것이 본문인 줄 안다. **섞이면 안 되는 것이다.**
 */
export function 곁글인가(p: ElementNode): boolean {
  for (let 위 = p.parent; 위 !== undefined; 위 = 위.parent) {
    if (위.name === 'hp:footNote' || 위.name === 'hp:endNote') return true;
    if (위.name === 'hp:fieldBegin' && getAttr(위, 'type') === 'MEMO') return true;
  }
  return false;
}
