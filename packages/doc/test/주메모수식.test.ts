/**
 * **각주·미주·메모·수식·개요·다단·바탕쪽.**
 *
 * 남아 있던 일곱 가운데 **여섯**을 만든 자리다. 짜임은 `자료/실측.md` 32항에 있다.
 * 여섯은 다 한글이 저장한 것을 오려 왔다.
 *
 * 일곱째인 **바탕쪽은 만들다 걷어냈다.** 규격만 보고 짰더니 한글이 그 파일을
 * 아예 못 열었다 — 자리를 다섯 가지로 바꿔 봐도 같았다. 까닭은 `문서.ts` 에
 * 적어 뒀다. 여기 시험이 없는 것은 **기능이 없기 때문이지 안 재서가 아니다.**
 *
 * 여기서 재는 것은 **한글이 쓰는 것과 같은 자리에 같은 것이 들어갔나** 다.
 * 「불렀더니 ok 가 났다」는 아무것도 안 보는 것이다 — 값을 대 본다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { childrenNamed, findAll, firstChildNamed, getAttr, textOf } from '@hwpx/owpml';
import { 문서 } from '../src/index.js';

const 기준파일 = path.join(path.resolve(__dirname, '../../..'), '자료', '기준파일');

function 열기(이름 = 'ref-text-basic.hwpx') {
  const d = 문서.열기(fs.readFileSync(path.join(기준파일, 이름)));
  d.ID매기기();
  return d;
}

/** 글이 든 첫 문단의 ID 와 그 글 */
function 글있는문단(d: 문서): { id: string; 글: string } {
  for (const p of d.구역들.flatMap((s) => s.문단들)) {
    const 글 = p.글.trim();
    if (글.length >= 2) return { id: d.이름표.아이디(p.el), 글 };
  }
  throw new Error('글이 든 문단이 없다');
}

describe('각주·미주', () => {
  it('**한글이 쓰는 자리에 그대로 들어간다**', () => {
    const d = 열기();
    const { id } = 글있는문단(d);
    const r = d.주달기(id, '각주 내용이다.', '각주');
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);

    const 주 = findAll(d.구역들[0]!.root, 'hp:footNote')[0];
    expect(주, '각주 요소가 생겨야 한다').toBeDefined();

    // 주는 **런 안**에 hp:ctrl 로 든다. 문단 바로 밑이 아니다.
    expect(주!.parent?.name, '주는 hp:ctrl 안이다').toBe('hp:ctrl');
    expect(주!.parent?.parent?.name, 'hp:ctrl 은 런 안이다').toBe('hp:run');

    // **번호가 두 자리에 적힌다.** 하나만 적으면 주는 달렸는데 번호가 안 보인다.
    expect(getAttr(주!, 'number')).toBe('1');
    const 자동 = findAll(주!, 'hp:autoNum')[0];
    expect(자동, 'hp:autoNum 이 없으면 번호가 안 보인다').toBeDefined();
    expect(getAttr(자동!, 'numType')).toBe('FOOTNOTE');
    expect(getAttr(자동!, 'num')).toBe('1');
    expect(findAll(자동!, 'hp:autoNumFormat').length, '번호 모양도 있어야 한다').toBe(1);

    expect(textOf(주!)).toContain('각주 내용이다.');
  });

  it('**한글이 쓰는 「각주」 스타일을 그대로 쓴다**', () => {
    // 실측: ref-note.hwpx 의 각주 속 문단은 paraPr 10 · style 15 · charPr 3 이고,
    // 머리글의 「각주」 스타일이 딱 그 셋을 가리킨다. 우리도 같은 것을 골라야
    // **한글이 만든 것과 같은 값**이 된다.
    const 기준 = 열기('ref-note.hwpx');
    const 한글것 = findAll(기준.구역들[0]!.root, 'hp:footNote')[0];
    expect(한글것, 'ref-note 에 각주가 있어야 이 시험이 뭔가를 본다').toBeDefined();
    const 한글문단 = findAll(한글것!, 'hp:p')[0]!;

    const d = 열기();
    const { id } = 글있는문단(d);
    expect(d.주달기(id, '가', '각주').ok).toBe(true);
    const 우리것 = findAll(d.구역들[0]!.root, 'hp:p')
      .filter((p) => p.parent?.parent?.name === 'hp:footNote')[0];
    expect(우리것, '주 안에 문단이 있어야 한다').toBeDefined();

    for (const 키 of ['paraPrIDRef', 'styleIDRef']) {
      expect(getAttr(우리것!, 키), `${키} 가 한글 것과 같아야 한다`)
        .toBe(getAttr(한글문단, 키));
    }
  });

  it('미주는 numType 만 다르다', () => {
    const d = 열기();
    const { id } = 글있는문단(d);
    expect(d.주달기(id, '미주 내용이다.', '미주').ok).toBe(true);
    const 주 = findAll(d.구역들[0]!.root, 'hp:endNote')[0];
    expect(주, 'hp:endNote 여야 한다 — 각주와 요소 이름이 다르다').toBeDefined();
    expect(getAttr(findAll(주!, 'hp:autoNum')[0]!, 'numType')).toBe('ENDNOTE');
  });

  it('**번호가 이어진다** — 둘째 주는 2번이다', () => {
    const d = 열기();
    const { id } = 글있는문단(d);
    expect(d.주달기(id, '첫째', '각주').ok).toBe(true);
    const 둘째 = d.주달기(id, '둘째', '각주');
    expect(둘째.ok, 둘째.ok ? '' : 둘째.이유).toBe(true);
    expect(둘째.ok && 둘째.value.번호, '이미 하나 있으니 2번이라야 한다').toBe(2);
    // 미주는 **따로** 센다 — 각주가 둘 있어도 첫 미주는 1번이다.
    const 미주 = d.주달기(id, '미주', '미주');
    expect(미주.ok && 미주.value.번호, '미주는 제 갈래로만 센다').toBe(1);
  });

  it('**찾은 어구 바로 뒤**에 붙고 글은 안 없어진다', () => {
    const d = 열기();
    const { id, 글 } = 글있는문단(d);
    const 어구 = 글.slice(0, 2);
    expect(d.주달기(id, '주', '각주', 어구).ok).toBe(true);

    const 찾 = d.문단찾기(id);
    if (!찾.ok) throw new Error('못 찾았다');
    expect(찾.value.글, '본문 글은 한 글자도 안 없어져야 한다').toBe(글);

    // 어구 뒤에 남은 글이 **주 뒤로** 갔나 — 앞뒤가 뒤집히면 주가 문장 끝으로 밀린다
    const 런 = 찾.value.런들.find((r) => findAll(r, 'hp:footNote').length > 0)!;
    const 아이들 = 런.children.filter((c) => c.kind === 'element');
    const 주자리 = 아이들.findIndex((c) => findAll(c, 'hp:footNote').length > 0);
    expect(주자리, '주 앞에 글이 있어야 한다').toBeGreaterThan(0);
    expect(textOf(아이들[주자리 - 1]!), '주 바로 앞은 찾은 어구로 끝나야 한다')
      .toMatch(new RegExp(`${어구.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  });

  it('못 찾은 어구는 그렇다고 말한다', () => {
    const d = 열기();
    const { id } = 글있는문단(d);
    const r = d.주달기(id, '주', '각주', '없는어구입니다');
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.이유).toContain('못 찾았다');
  });
});

describe('메모', () => {
  it('**밭이다** — hp:memo 가 아니라 type="MEMO" 인 fieldBegin 이다', () => {
    const d = 열기();
    const { id, 글 } = 글있는문단(d);
    const 어구 = 글.slice(0, 2);
    const r = d.메모달기(id, 어구, '여기 숫자 확인');
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);

    expect(findAll(d.구역들[0]!.root, 'hp:memo').length, 'hp:memo 라는 요소는 안 쓴다').toBe(0);
    const 시작 = findAll(d.구역들[0]!.root, 'hp:fieldBegin')
      .find((e) => getAttr(e, 'type') === 'MEMO');
    expect(시작, 'type=MEMO 인 밭이 있어야 한다').toBeDefined();

    // **몸통은 subList 안**이다. 여기가 비면 메모는 달렸는데 글이 없다.
    const 속 = firstChildNamed(시작!, 'hp:subList');
    expect(속, '메모 몸통이 들어갈 subList').toBeDefined();
    expect(textOf(속!)).toBe('여기 숫자 확인');

    // 짝이 맞나 — 어긋나면 한글이 메모를 문서 끝까지 이어 버린다
    const 끝 = findAll(d.구역들[0]!.root, 'hp:fieldEnd')
      .find((e) => getAttr(e, 'beginIDRef') === getAttr(시작!, 'id'));
    expect(끝, 'fieldEnd 가 fieldBegin 을 가리켜야 한다').toBeDefined();
    expect(getAttr(끝!, 'fieldid')).toBe(getAttr(시작!, 'fieldid'));

    expect(d.메모들.map((m) => m.글)).toContain('여기 숫자 확인');
  });

  it('**한 런 안에 다 든다** — 한글이 그렇게 쓴다', () => {
    const d = 열기();
    const { id, 글 } = 글있는문단(d);
    expect(d.메모달기(id, 글.slice(0, 2), '메모').ok).toBe(true);
    const 찾 = d.문단찾기(id);
    if (!찾.ok) throw new Error('못 찾았다');
    const 런 = 찾.value.런들.find(
      (r) => childrenNamed(r, 'hp:ctrl').some((c) => findAll(c, 'hp:fieldBegin').length > 0));
    expect(런, '시작이 든 런').toBeDefined();
    expect(findAll(런!, 'hp:fieldEnd').length, '끝도 **같은 런** 안이라야 한다').toBe(1);
    expect(찾.value.글, '본문 글은 그대로다').toBe(글);
  });

  it('**지은이 기본값이 사람 이름이 아니다**', () => {
    // 한글은 윈도 계정 이름을 넣는다. 그 문서를 남에게 보내면 계정 이름이 같이 간다.
    const d = 열기();
    const { id, 글 } = 글있는문단(d);
    expect(d.메모달기(id, 글.slice(0, 2), '메모').ok).toBe(true);
    expect(d.메모들[0]!.지은이).toBe('hwpx-mcp');
  });
});

describe('수식', () => {
  it('**hp:script 한 줄이 전부다**', () => {
    const d = 열기();
    const { id } = 글있는문단(d);
    const 식 = '{a} over {b}';
    const r = d.수식넣기(id, 식);
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);

    const 수식 = findAll(d.구역들[0]!.root, 'hp:equation')[0];
    expect(수식).toBeDefined();
    expect(textOf(firstChildNamed(수식!, 'hp:script')!)).toBe(식);
    expect(d.수식들).toContain(식);

    // 크기가 0 이면 한글이 식을 안 그린다 (그림에서 겪은 것과 같다)
    const 크기 = firstChildNamed(수식!, 'hp:sz')!;
    expect(Number(getAttr(크기, 'width'))).toBeGreaterThan(0);
    expect(Number(getAttr(크기, 'height'))).toBeGreaterThan(0);

    // 글 안에 놓인다 — 딴 쪽으로 떠 다니면 안 된다
    expect(getAttr(firstChildNamed(수식!, 'hp:pos')!, 'treatAsChar')).toBe('1');
  });

  it('한글이 만든 수식과 **같은 속성**을 쓴다', () => {
    const 기준 = 열기('ref-equation.hwpx');
    const 한글것 = findAll(기준.구역들[0]!.root, 'hp:equation')[0];
    expect(한글것, 'ref-equation 에 수식이 있어야 이 시험이 뭔가를 본다').toBeDefined();

    const d = 열기();
    const { id } = 글있는문단(d);
    expect(d.수식넣기(id, 'x^2').ok).toBe(true);
    const 우리것 = findAll(d.구역들[0]!.root, 'hp:equation')[0]!;

    for (const 키 of ['version', 'baseUnit', 'lineMode', 'font', 'numberingType']) {
      expect(getAttr(우리것, 키), `${키} 가 한글 것과 같아야 한다`).toBe(getAttr(한글것!, 키));
    }
    // 자식 차례도 같아야 한다 — 뒤집히면 한글이 그 뒤를 안 읽는다
    const 차례 = (e: typeof 우리것) => e.children
      .filter((c) => c.kind === 'element').map((c) => (c as { name: string }).name);
    expect(차례(우리것)).toEqual(차례(한글것!));
  });
});

describe('개요 번호', () => {
  it('**heading 한 글자가 스위치다**', () => {
    const d = 열기();
    const { id } = 글있는문단(d);
    const 전 = d.문단찾기(id);
    if (!전.ok) throw new Error('못 찾았다');
    const 전모양 = 전.value.문단모양;

    const r = d.개요수준주기(id, 1);
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);

    const 후 = d.문단찾기(id);
    if (!후.ok) throw new Error('못 찾았다');
    const 새모양 = d.머리.낱개('hh:paraProperties', 후.value.문단모양)!;
    const h = firstChildNamed(새모양, 'hh:heading')!;
    expect(getAttr(h, 'type')).toBe('OUTLINE');
    expect(getAttr(h, 'level'), '1수준은 level="0" 이다 (한글이 0부터 센다)').toBe('0');

    // 바탕 문단모양은 **안 건드린다** — 다른 문단이 같이 개요가 되면 안 된다
    const 옛모양 = d.머리.낱개('hh:paraProperties', 전모양)!;
    expect(getAttr(firstChildNamed(옛모양, 'hh:heading')!, 'type')).toBe('NONE');
  });

  it('0 이면 끈다', () => {
    const d = 열기();
    const { id } = 글있는문단(d);
    expect(d.개요수준주기(id, 3).ok).toBe(true);
    expect(d.개요수준주기(id, 0).ok).toBe(true);
    const 후 = d.문단찾기(id);
    if (!후.ok) throw new Error('못 찾았다');
    const 모양 = d.머리.낱개('hh:paraProperties', 후.value.문단모양)!;
    expect(getAttr(firstChildNamed(모양, 'hh:heading')!, 'type')).toBe('NONE');
  });

  it('말도 안 되는 수준은 거절한다', () => {
    const d = 열기();
    const { id } = 글있는문단(d);
    expect(d.개요수준주기(id, 11).ok).toBe(false);
    expect(d.개요수준주기(id, -1).ok).toBe(false);
    expect(d.개요수준주기(id, 1.5).ok).toBe(false);
  });
});

describe('다단', () => {
  it('**colCount 를 바꾼다** — 요소는 이미 있다', () => {
    const d = 열기();
    expect(d.구역들[0]!.단수, '안 나뉜 문서는 1단이다').toBe(1);

    const r = d.단주기(2);
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);
    expect(d.구역들[0]!.단수).toBe(2);
    expect(d.구역들[0]!.단간격, '기본 간격 8mm').toBe(2268);

    const c = findAll(d.구역들[0]!.root, 'hp:colPr')[0]!;
    expect(getAttr(c, 'sameSz'), '폭은 한글이 고르게 나눈다').toBe('1');
    expect(findAll(c, 'hp:colSz').length, '폭을 따로 안 적는다 — 실측 60개가 다 그렇다').toBe(0);
    // **쪽 설정과 같은 런**에 있어야 한다. 딴 데 있으면 한글이 못 찾는다.
    expect(c.parent?.name).toBe('hp:ctrl');
    expect(findAll(c.parent!.parent!, 'hp:secPr').length, 'secPr 이 든 런이라야 한다').toBe(1);
  });

  it('한글이 만든 2단 문서와 **같은 값**이 된다', () => {
    const 기준 = 열기('ref-column.hwpx');
    const 한글것 = findAll(기준.구역들[0]!.root, 'hp:colPr')
      .find((e) => getAttr(e, 'colCount') === '2');
    expect(한글것, 'ref-column 에 2단이 있어야 이 시험이 뭔가를 본다').toBeDefined();

    const d = 열기();
    expect(d.단주기(2, Number(getAttr(한글것!, 'sameGap'))).ok).toBe(true);
    const 우리것 = findAll(d.구역들[0]!.root, 'hp:colPr')[0]!;
    for (const 키 of ['type', 'layout', 'colCount', 'sameSz', 'sameGap']) {
      expect(getAttr(우리것, 키), `${키} 가 한글 것과 같아야 한다`).toBe(getAttr(한글것!, 키));
    }
  });

  it('말도 안 되는 단 수는 거절한다', () => {
    const d = 열기();
    expect(d.단주기(0).ok).toBe(false);
    expect(d.단주기(13).ok).toBe(false);
    expect(d.단주기(2.5).ok).toBe(false);
    expect(d.단주기(2, -1).ok).toBe(false);
  });

  it('이미 그 단이면 **바뀐 것이 없다고 말한다**', () => {
    const d = 열기();
    expect(d.단주기(2).ok).toBe(true);
    const 다시 = d.단주기(2);
    expect(다시.ok, '같은 값을 또 주면 실패로 알린다 — 조용히 0 을 돌려주지 않는다').toBe(false);
  });
});

describe('식별자', () => {
  it('**주·메모·수식이 서로 안 겹치는 수를 쓴다**', () => {
    // 겹치면 한글이 짝을 잘못 맺는다. 밭 id 와 주 instId 가 같은 우물인 것으로
    // 보여 **한 우물에서** 뽑는다 — 그것을 여기서 잰다.
    const d = 열기();
    const { id, 글 } = 글있는문단(d);
    expect(d.주달기(id, '주', '각주').ok).toBe(true);
    expect(d.수식넣기(id, 'x').ok).toBe(true);
    expect(d.메모달기(id, 글.slice(0, 2), '메모').ok).toBe(true);
    // 링크는 **딴 문단**에 건다. 주·메모가 걸린 런은 이미 조각나 있어
    // 링크가 런을 못 쪼갠다 — 그것은 아래 딴 시험에서 잰다.
    const 둘째 = d.구역들.flatMap((s) => s.문단들)
      .filter((p) => p.글.trim().length >= 2 && d.이름표.아이디(p.el) !== id)[0];
    if (둘째 !== undefined) {
      expect(d.링크걸기(d.이름표.아이디(둘째.el), 둘째.글.trim().slice(0, 2), 'https://x.kr').ok)
        .toBe(true);
    }

    const 뿌리 = d.구역들[0]!.root;
    const 수들 = [
      ...findAll(뿌리, 'hp:footNote').map((e) => getAttr(e, 'instId')),
      ...findAll(뿌리, 'hp:equation').map((e) => getAttr(e, 'id')),
      ...findAll(뿌리, 'hp:fieldBegin').flatMap(
        (e) => [getAttr(e, 'id'), getAttr(e, 'fieldid')]),
    ].filter((v): v is string => v !== undefined);
    expect(수들.length, '넷을 다 달았으니 수가 여럿 나와야 한다').toBeGreaterThan(4);
    expect(new Set(수들).size, `겹치는 수가 있다: ${수들.join(', ')}`).toBe(수들.length);
  });
});
