/**
 * **각주·미주·메모·수식·개요·다단·바탕쪽.**
 *
 * 남아 있던 일곱을 만든 자리다. 짜임은 `자료/실측.md` 32항에 있다.
 * 일곱 다 **한글이 저장한 것을 오려 왔다.**
 *
 * 바탕쪽 하나는 규격만 보고 짰다가 한글이 파일을 못 여는 것을 보고 물렀다.
 * 한글에 직접 만들게 해 보니 **`hp:secPr` 안이 아니라 딴 부품**이었다.
 *
 * 여기서 재는 것은 **한글이 쓰는 것과 같은 자리에 같은 것이 들어갔나** 다.
 * 「불렀더니 ok 가 났다」는 아무것도 안 보는 것이다 — 값을 대 본다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { childrenNamed, findAll, firstChildNamed, getAttr, parseXml, textOf } from '@hwpx/owpml';
import { 문서 } from '../src/index.js';

const 기준파일 = path.join(path.resolve(__dirname, '../../..'), '자료', '기준파일');

function 열기(이름 = 'ref-text-basic.hwpx') {
  const d = 문서.열기(fs.readFileSync(path.join(기준파일, 이름)));
  d.ID매기기();
  return d;
}

/** 문서 안 부품 하나를 파싱해 뿌리를 준다 */
function parse받기(d: 문서, 이름: string) {
  return parseXml(d.컨테이너.readText(이름)).root;
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

describe('바탕쪽', () => {
  it('**딴 부품에 담기고 구역이 가리킨다**', () => {
    const d = 열기();
    const r = d.바탕쪽주기('내부 검토용');
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);

    // 부품이 하나 더 생겨야 한다 — `hp:secPr` 안에 넣으면 한글이 파일을 못 연다
    expect(d.컨테이너.바탕쪽이름들()).toEqual(['Contents/masterpage0.xml']);

    // 구역은 **가리키기만** 한다
    const sp = d.구역들[0]!.쪽설정!;
    expect(getAttr(sp, 'masterPageCnt'), '개수를 안 세우면 한글이 안 읽는다').toBe('1');
    expect(d.구역들[0]!.바탕쪽참조들).toEqual(['masterpage0']);
    expect(findAll(sp, 'hp:masterPage').length, '가리키는 표는 secPr 안에 하나').toBe(1);

    expect(d.바탕쪽들).toContain('내부 검토용');
    expect(d.검사()).toEqual([]);
  });

  it('**manifest 에 적는다** — 안 적으면 한글이 부품을 못 찾는다', () => {
    const d = 열기();
    expect(d.바탕쪽주기('워터마크').ok).toBe(true);
    const hpf = d.컨테이너.readText('Contents/content.hpf');
    expect(hpf).toContain('href="Contents/masterpage0.xml"');
    // **spine 에는 안 넣는다.** 바탕쪽은 읽는 차례가 있는 것이 아니다.
    const spine = hpf.slice(hpf.indexOf('<opf:spine>'));
    expect(spine, 'spine 에 들어가면 한글이 본문 차례에 끼워 읽는다')
      .not.toContain('masterpage0');
  });

  it('**글 자리를 재서 넣는다** — 한글이 넣는 값과 같다', () => {
    // 실측(ref-masterpage.hwpx): textWidth 42520 · textHeight 65762
    //
    // **우리가 쓴 것을 읽어서 댄다.** 처음엔 여기서 너비·높이를 다시 계산해
    // 한글 것과 견줬는데, 그건 **우리가 낸 부품을 한 번도 안 보는 시험**이었다 —
    // `textHeight` 를 0 으로 박는 고장을 내도 그대로 통과했다.
    const 기준 = 열기('ref-masterpage.hwpx');
    const 한글속 = findAll(parse받기(기준, 기준.컨테이너.바탕쪽이름들()[0]!), 'hp:subList')[0]!;

    // 같은 용지·여백인 문서에 우리가 새로 낸다
    const d = 열기('ref-text-basic.hwpx');
    expect(d.바탕쪽주기('가').ok).toBe(true);
    const 우리속 = findAll(parse받기(d, 'Contents/masterpage0.xml'), 'hp:subList')[0]!;

    expect(getAttr(우리속, 'textWidth'), '글 너비가 한글 것과 같아야 한다')
      .toBe(getAttr(한글속, 'textWidth'));
    expect(getAttr(우리속, 'textHeight'), '글 높이가 한글 것과 같아야 한다')
      .toBe(getAttr(한글속, 'textHeight'));
    expect(Number(getAttr(우리속, 'textHeight')), '0 이면 한글이 글을 못 앉힌다')
      .toBeGreaterThan(0);
  });

  it('**쪽 설정이 딸려 들어가지 않는다**', () => {
    // 구역의 첫 문단은 hp:secPr 을 지고 있다. 그대로 뜨면 쪽 설정이 둘이 된다.
    const d = 열기();
    expect(d.바탕쪽주기('가').ok).toBe(true);
    const 바탕 = parse받기(d, 'Contents/masterpage0.xml');
    expect(findAll(바탕, 'hp:secPr').length, '바탕쪽 안에 쪽 설정이 있으면 안 된다').toBe(0);
    expect(findAll(바탕, 'hp:tbl').length, '표도 딸려 가면 안 된다').toBe(0);
  });

  it('**구역마다 하나씩 낸다** — 나눠 쓰면 한글이 죽는다', () => {
    // 둘이 같은 부품을 가리키게 했더니 한글이 **RPC 가 끊기며 죽었다.**
    // 못 여는 것보다 나쁘다 — 그 뒤에 열던 문서까지 줄줄이 떨어진다.
    const d = 열기('ref-section-break.hwpx');
    expect(d.구역이름들.length, '구역이 둘이라야 이 시험이 뭔가를 본다').toBe(2);
    expect(d.바탕쪽주기('바탕쪽 글').ok).toBe(true);

    expect(d.컨테이너.바탕쪽이름들().length, '구역 수만큼 부품이 있어야 한다').toBe(2);
    const 가리킴 = d.구역들.map((s) => s.바탕쪽참조들);
    expect(가리킴).toEqual([['masterpage0'], ['masterpage1']]);
    expect(new Set(가리킴.flat()).size, '두 구역이 같은 것을 가리키면 안 된다').toBe(2);
  });

  it('**부품 차례가 「바탕쪽 → 그 구역」 짝이다**', () => {
    // 한글이 저장한 두 구역 문서가 그렇다:
    //   header · masterpage0 · section0 · masterpage1 · section1
    const d = 열기('ref-section-break.hwpx');
    expect(d.바탕쪽주기('가').ok).toBe(true);
    const 차례 = d.컨테이너.names().filter((n) => /^Contents\/(masterpage|section)\d+\.xml$/.test(n));
    expect(차례).toEqual([
      'Contents/masterpage0.xml', 'Contents/section0.xml',
      'Contents/masterpage1.xml', 'Contents/section1.xml',
    ]);
  });

  it('한글이 만든 바탕쪽과 **뿌리 속성이 같다**', () => {
    const 기준 = 열기('ref-masterpage.hwpx');
    const 한글것 = parse받기(기준, 기준.컨테이너.바탕쪽이름들()[0]!);

    const d = 열기();
    expect(d.바탕쪽주기('가').ok).toBe(true);
    const 우리것 = parse받기(d, 'Contents/masterpage0.xml');

    expect(우리것.name, '접두사 없는 masterPage 다').toBe('masterPage');
    for (const 키 of ['id', 'type', 'pageNumber', 'pageDuplicate', 'pageFront']) {
      expect(getAttr(우리것, 키), `${키} 가 한글 것과 같아야 한다`).toBe(getAttr(한글것, 키));
    }
    // 이름공간이 빠지면 한글이 안쪽 hp: 를 못 읽는다
    const 이름공간 = (e: typeof 우리것) =>
      e.attrs.filter((a) => a.name.startsWith('xmlns')).map((a) => a.name).sort();
    expect(이름공간(우리것)).toEqual(이름공간(한글것));
  });
});

describe('겹쳐 달기', () => {
  it('**주가 걸린 런에 링크를 걸면 왜 안 되는지 말한다**', () => {
    // 전에는 「못 찾았다」로 뭉뚱그렸다. 글은 멀쩡히 있는데 그렇게 말하면
    // 부르는 쪽이 어구를 고치며 헤맨다 — 고칠 데는 어구가 아니라 차례다.
    const d = 열기();
    const { id, 글 } = 글있는문단(d);
    const 어구 = 글.slice(0, 2);
    expect(d.메모달기(id, 어구, '메모').ok).toBe(true);

    const r = d.링크걸기(id, 어구, 'https://x.kr');
    expect(r.ok, '이미 조각난 런이라 못 건다').toBe(false);
    expect(r.ok ? '' : r.이유, '「못 찾았다」가 아니라야 한다').not.toContain('못 찾았다');
    expect(r.ok ? '' : r.어떻게).toContain('먼저');
  });

  it('차례를 바꾸면 **둘 다 걸린다**', () => {
    const d = 열기();
    const { id, 글 } = 글있는문단(d);
    const 어구 = 글.slice(0, 2);
    expect(d.링크걸기(id, 어구, 'https://x.kr').ok, '링크를 먼저').toBe(true);
    expect(d.메모달기(id, 어구, '메모').ok, '메모를 나중에').toBe(true);
    expect(d.링크들).toContain('https://x.kr');
    expect(d.메모들.map((m) => m.글)).toContain('메모');
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
