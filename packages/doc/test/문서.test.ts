/**
 * 3단계 합격 기준:
 *
 * - 문단 넣기·글 바꾸기·서식 주기가 **ID 로** 되고, **삽입해도 ID 가 안 밀린다**
 * - 스타일을 100번 줘도 header 가 안 부푼다 (`머리글.test.ts`)
 * - **무동작이 0건**
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HwpxContainer, 부품 } from '@hwpx/container';
import { pt, hwp, parseXml, findAll, childrenNamed, firstChildNamed, getAttr, setAttr, insertAfter, 복제하기, setText,
} from '@hwpx/owpml';
import { 문서, 문단, 표, 꺼내기 } from '../src/index.js';
// 쪼개진 문단은 **실제로 쪼개지는 길**로 만든다
import { 조판 } from '@hwpx/compose';

const 뿌리 = path.resolve(__dirname, '../../..');
const 기준파일 = path.join(뿌리, '자료', '기준파일');

/**
 * 글이 아닌 것을 갈래별로 센다.
 *
 * 런 안에는 글만 있는 게 아니다 — 표·그림·도형·쪽 설정이 같이 산다.
 * 런을 지우거나 복제하면 그것들이 사라지거나 늘어난다.
 * **한 갈래만 세면 놓친다.** 전부 센다.
 */
function 글아닌것세기(root: never): Record<string, number> {
  const 셈: Record<string, number> = {};
  for (const 이름 of ['hp:tbl', 'hp:pic', 'hp:rect', 'hp:ellipse', 'hp:line', 'hp:polygon',
    'hp:container', 'hp:equation', 'hp:secPr', 'hp:ctrl', 'hp:compose', 'hp:connectLine', 'hp:dutmal']) {
    const n = findAll(root, 이름).length;
    if (n > 0) 셈[이름] = n;
  }
  return 셈;
}

function 열기(이름 = 'ref-text-basic.hwpx'): { 바이트: Buffer; d: 문서 } {
  const 바이트 = fs.readFileSync(path.join(기준파일, 이름));
  return { 바이트, d: 문서.열기(바이트) };
}

describe('안 고치면 바이트가 같다', () => {
  it('열고 저장하면 원본 그대로', () => {
    const { 바이트, d } = 열기();
    expect(d.dirty).toBe(false);
    expect(d.저장().equals(바이트)).toBe(true);
  });

  it('**읽기만 해도 dirty 가 안 된다**', () => {
    const { 바이트, d } = 열기();
    d.ID매기기();
    for (const s of d.구역들) for (const p of s.모든문단들) void p.글;
    expect(d.dirty).toBe(false);
    expect(d.저장().equals(바이트)).toBe(true);
  });

  it('빈 문서도 그대로 나온다', () => {
    const d = 문서.새로();
    expect(d.dirty).toBe(false);
    expect(d.검사()).toEqual([]);
  });
});

describe('안정 ID — 넣어도 안 밀린다', () => {
  it('ID 를 매기고 그 ID 로 다시 찾는다', () => {
    const { d } = 열기();
    const 센것 = d.ID매기기();
    expect(센것.문단).toBeGreaterThan(0);

    const 첫문단 = d.구역들[0]!.문단들[0]!;
    const id = d.이름표.아이디(첫문단.el);
    const 찾은것 = 꺼내기(d.찾기(id));
    expect(찾은것.갈래).toBe('문단');
    if (찾은것.갈래 !== '문단') return;
    expect(찾은것.문단.el).toBe(첫문단.el);
  });

  it('**앞에 문단을 넣어도 뒤 문단의 ID 가 그대로다**', () => {
    const { d } = 열기('ref-para-align.hwpx');
    d.ID매기기();

    const s = d.구역들[0]!;
    const 문단들 = s.문단들;
    expect(문단들.length).toBeGreaterThanOrEqual(3);

    const 마지막 = 문단들[문단들.length - 1]!;
    const 마지막id = d.이름표.아이디(마지막.el);
    const 마지막글 = 마지막.글;

    // 맨 앞에 문단을 세 개 끼워 넣는다
    const 바탕 = 문단들[0]!;
    for (let i = 0; i < 3; i++) {
      const 새것 = 복제하기(바탕.el, 바탕.source);
      insertAfter(바탕.el, 새것);
    }
    expect(s.문단들.length).toBe(문단들.length + 3);

    // ID 는 그대로 같은 문단을 가리켜야 한다
    const 다시 = 꺼내기(d.찾기(마지막id));
    expect(다시.갈래).toBe('문단');
    if (다시.갈래 !== '문단') return;
    expect(다시.문단.el).toBe(마지막.el);
    expect(다시.문단.글).toBe(마지막글);
  });

  it('ID 는 이웃해 보이지 않는다 (모델이 셈하지 못하게)', () => {
    const { d } = 열기('ref-para-align.hwpx');
    d.ID매기기();
    const ids = d.구역들[0]!.문단들.slice(0, 4).map((p) => d.이름표.아이디(p.el));
    expect(new Set(ids).size).toBe(ids.length);
    // p_0000, p_0001 … 처럼 나란한 번호가 아니어야 한다
    const 꼬리 = ids.map((x) => x.split('_')[1]!);
    const 나란한가 = 꼬리.every((v, i) => i === 0 || parseInt(v, 36) === parseInt(꼬리[i - 1]!, 36) + 1);
    expect(나란한가).toBe(false);
  });

  it('없는 ID 를 주면 무엇이 있는지 알려 준다', () => {
    const { d } = 열기();
    d.ID매기기();
    const r = d.찾기('p_zzzz');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.이유).toContain('p_zzzz');
    expect(r.어떻게.length).toBeGreaterThan(0);
  });
});

describe('글 바꾸기', () => {
  it('글을 바꾸고 다시 읽으면 바뀌어 있다', () => {
    const { d } = 열기();
    d.ID매기기();
    const p = d.구역들[0]!.문단들.find((x) => !x.비었나)!;
    const id = d.이름표.아이디(p.el);

    꺼내기(d.글바꾸기(id, '바뀐 글'));
    expect(p.글).toBe('바뀐 글');

    // 저장했다가 다시 열어도 그대로다
    const 다시 = 문서.열기(d.저장());
    const 글들 = 다시.구역들[0]!.모든문단들.map((x) => x.글);
    expect(글들).toContain('바뀐 글');
  });

  it('**같은 글을 주면 "했다" 고 하지 않는다** (무동작을 잡는다)', () => {
    const { d } = 열기();
    d.ID매기기();
    const p = d.구역들[0]!.문단들.find((x) => !x.비었나)!;
    const id = d.이름표.아이디(p.el);

    const r = d.글바꾸기(id, p.글);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.이유).toContain('바뀐 것이 없다');
  });

  it('서식을 잃으면 몇 개 잃었는지 말한다', () => {
    const { d } = 열기('ref-style.hwpx');
    d.ID매기기();
    const 여러런 = d.구역들[0]!.모든문단들.find((p) => new Set(p.글자모양들).size > 1);
    if (!여러런) return;      // 그런 문단이 없는 기준 파일이면 건너뛴다
    const id = d.이름표.아이디(여러런.el);
    const r = 꺼내기(d.글바꾸기(id, '통째로 바꾼 글'));
    expect(r.잃은서식).toBeGreaterThan(0);
  });
});

describe('서식 주기 — 스타일은 복제·지문 대조를 거친다', () => {
  it('글자 서식을 주면 charPr 이 생기고 문단이 그것을 가리킨다', () => {
    const { d } = 열기();
    d.ID매기기();
    const p = d.구역들[0]!.문단들.find((x) => !x.비었나)!;
    const id = d.이름표.아이디(p.el);

    const r = 꺼내기(d.글자서식주기(id, { 크기: pt(16), 굵게: true }));
    expect(r.바뀐수).toBeGreaterThan(0);
    expect(p.글자모양들.every((x) => x === r.charPrId)).toBe(true);
  });

  it('**같은 서식을 100번 줘도 header 가 안 부푼다**', () => {
    const { d } = 열기();
    d.ID매기기();
    const 문단들 = d.구역들[0]!.모든문단들.filter((x) => !x.비었나);
    const charPr수 = () => findAll(parseXml(d.머리.toXml()).root, 'hh:charPr').length;

    // 한 바퀴 돌면 **바탕 서식 가짓수만큼** 는다. 그건 맞다 —
    // 바탕이 다르면 크기만 바꿔도 서로 다른 모양이 되기 때문이다.
    const 바탕가짓수 = new Set(문단들.map((p) => p.글자모양들[0] ?? '0')).size;
    const 처음 = charPr수();
    for (const p of 문단들) d.글자서식주기(d.이름표.아이디(p.el), { 크기: pt(16) });
    const 한바퀴 = charPr수();
    expect(한바퀴 - 처음).toBeLessThanOrEqual(바탕가짓수);

    // **그 다음부터는 하나도 안 는다.** 지문이 같으니 쓰던 것을 다시 쓴다.
    for (let i = 0; i < 99; i++) {
      for (const p of 문단들) d.글자서식주기(d.이름표.아이디(p.el), { 크기: pt(16) });
    }
    expect(charPr수()).toBe(한바퀴);

    d.저장();
    expect(findAll(parseXml(d.컨테이너.readText(부품.header)).root, 'hh:charPr').length).toBe(한바퀴);
  });

  it('문단 여백을 주면 case 에 절반이 들어간다', () => {
    const { d } = 열기();
    d.ID매기기();
    const p = d.구역들[0]!.문단들[0]!;
    const id = d.이름표.아이디(p.el);

    const r = 꺼내기(d.문단서식주기(id, { 왼쪽여백: hwp(2000) }));
    const paraPr = findAll(parseXml(d.머리.toXml()).root, 'hh:paraPr')
      .find((x) => getAttr(x, 'id') === r.paraPrId)!;
    const 값 = (가지: string) => {
      const sw = paraPr.children.find((c) => c.kind === 'element' && c.name === 'hp:switch') as never;
      const g = findAll(sw, 가지)[0]!;
      return getAttr(findAll(g, 'hc:left')[0]!, 'value');
    };
    expect(값('hp:default')).toBe('2000');
    expect(값('hp:case')).toBe('1000');
  });

  it('이미 그 서식이면 "했다" 고 하지 않는다', () => {
    const { d } = 열기();
    d.ID매기기();
    const id = d.이름표.아이디(d.구역들[0]!.문단들[0]!.el);
    d.문단서식주기(id, { 정렬: 'CENTER' });
    const r = d.문단서식주기(id, { 정렬: 'CENTER' });
    expect(r.ok).toBe(false);
  });
});

describe('강조 — 문단 안 어구만', () => {
  it('찾은 어구만 다른 서식이 된다', () => {
    const { d } = 열기();
    d.ID매기기();
    const p = d.구역들[0]!.문단들.find((x) => x.글.length >= 3)!;
    const id = d.이름표.아이디(p.el);
    const 온글 = p.글;
    const 조각 = 온글.slice(1, 3);

    const r = 꺼내기(d.강조하기(id, 조각, { 굵게: true }));
    expect(r.바뀐수).toBe(1);
    // 글은 그대로여야 한다
    expect(p.글).toBe(온글);
    // 런이 늘어야 한다
    expect(p.런들.length).toBeGreaterThan(1);
  });

  it('못 찾으면 그 문단의 글을 보여 준다', () => {
    const { d } = 열기();
    d.ID매기기();
    const id = d.이름표.아이디(d.구역들[0]!.문단들[0]!.el);
    const r = d.강조하기(id, '있을 리 없는 글자', { 굵게: true });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.이유).toContain('못 찾았다');
    expect(r.어떻게).toContain('이 문단의 글');
  });
});

describe('연산 기록 — 실패도 남긴다', () => {
  it('실패한 것이 기록에 남는다', () => {
    const { d } = 열기();
    d.ID매기기();
    d.글바꾸기('p_없는것', '아무거나');
    expect(d.실패기록.length).toBe(1);
    expect(d.실패기록[0]!.무엇).toBe('글바꾸기');
    expect(d.실패기록[0]!.대상).toBe('p_없는것');
  });

  it('된 것도 남는다', () => {
    const { d } = 열기();
    d.ID매기기();
    const p = d.구역들[0]!.문단들.find((x) => !x.비었나)!;
    d.글바꾸기(d.이름표.아이디(p.el), '새 글');
    expect(d.기록.length).toBe(1);
    expect(d.기록[0]!.됐나).toBe(true);
    expect(d.실패기록.length).toBe(0);
  });
});

describe('검사', () => {
  it('기준 파일은 검사에 안 걸린다', () => {
    for (const f of fs.readdirSync(기준파일).filter((x) => x.endsWith('.hwpx'))) {
      const d = 문서.열기(fs.readFileSync(path.join(기준파일, f)));
      expect(d.검사(), f).toEqual([]);
    }
  });
});

/**
 * 이 갈래는 **단위 시험이 못 잡고 한글 수용 시험에서 들통났다.**
 *
 * 표는 문단 안 런에 들어 있다 (실측: 런 1269개에 `hp:tbl`,
 * 글과 표가 같은 런에 든 것이 1134개). 글을 바꾼다고 런을 지우면 표가 사라진다.
 * 수용 시험에서 "표 갈래를 0편 확인" 이라고 나와서야 알았다.
 *
 * 그래서 여기로 내려 잡는다. 다음에는 단위 시험이 먼저 잡아야 한다.
 */
describe('글을 바꿔도 글이 아닌 것은 안 지운다', () => {
  it('**표가 든 문단의 글을 바꿔도 표가 남는다**', () => {
    const { d } = 열기('ref-table-basic.hwpx');
    d.ID매기기();
    const s = d.구역들[0]!;
    const 표앞 = s.표들.length;
    expect(표앞).toBeGreaterThan(0);

    for (const p of s.문단들) d.글바꾸기(d.이름표.아이디(p.el), '글을 통째로 바꾼다');

    expect(s.표들.length).toBe(표앞);
    // 저장하고 다시 열어도 있어야 한다
    const 다시 = 문서.열기(d.저장());
    expect(다시.구역들[0]!.표들.length).toBe(표앞);
  });

  it('그림이 든 문단의 글을 바꿔도 그림이 남는다', () => {
    const { d } = 열기('ref-image.hwpx');
    d.ID매기기();
    const s = d.구역들[0]!;
    const 그림앞 = findAll(s.root, 'hp:pic').length;
    expect(그림앞).toBeGreaterThan(0);

    for (const p of s.문단들) d.글바꾸기(d.이름표.아이디(p.el), '바뀐 글');

    expect(findAll(s.root, 'hp:pic').length).toBe(그림앞);
  });

  it('쪽 설정(secPr)이 든 런도 안 지운다', () => {
    const { d } = 열기();
    d.ID매기기();
    const s = d.구역들[0]!;
    expect(s.쪽설정).toBeDefined();
    for (const p of s.문단들) d.글바꾸기(d.이름표.아이디(p.el), '바뀐 글');
    expect(d.구역들[0]!.쪽설정).toBeDefined();
  });

  it('글이 없고 표만 든 문단이면 **못 한다고 한다**', () => {
    const { d } = 열기('ref-table-basic.hwpx');
    d.ID매기기();
    const s = d.구역들[0]!;
    // hp:t 가 하나도 없는 문단을 찾는다
    // childrenNamed 를 쓴다 — findAll 은 **표 안의 글자까지** 세어 버린다
    const 표만 = s.문단들.find((p) =>
      p.런들.some((r) => childrenNamed(r, 'hp:tbl').length > 0)
      && p.런들.every((r) => childrenNamed(r, 'hp:t').length === 0));
    if (!표만) return;    // 그런 문단이 없는 기준 파일이면 건너뛴다
    const r = d.글바꾸기(d.이름표.아이디(표만.el), '글');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.이유).toContain('hp:tbl');
  });

  it('표와 같은 런에 있는 글은 강조하지 않고 **왜인지 말한다**', () => {
    const { d } = 열기('ref-table-basic.hwpx');
    d.ID매기기();
    const s = d.구역들[0]!;
    // 런 **바로 아래**의 hp:t 만 센다. findAll 을 쓰면 표 안의 글자까지 세어
    // 섞인 런을 못 찾고, 그러면 이 시험이 조용히 아무것도 안 보게 된다.
    const 섞인문단 = s.문단들.find((p) => p.런들.some((r) =>
      childrenNamed(r, 'hp:t').length === 1
      && r.children.filter((c) => c.kind === 'element').length > 1));
    // 없으면 이 시험은 **아무것도 안 본다.** 조용히 지나가지 말고 여기서 멈춘다.
    expect(섞인문단, '섞인 런이 없으면 이 시험이 아무것도 안 본다').toBeDefined();
    if (!섞인문단) return;

    const 앞 = 글아닌것세기(s.root);
    const id = d.이름표.아이디(섞인문단.el);
    d.글바꾸기(id, '섞인 문단의 글');
    const r = d.강조하기(id, '섞인', { 굵게: true });
    if (!r.ok) {
      expect(r.어떻게).toContain('복제');
    }

    // **글 아닌 것이 하나도 늘면 안 된다.** 런을 쪼개면 그 안의 것이 다 복제된다.
    // 처음엔 표만 셌는데, 그 문단에 든 것은 표가 아니라 쪽 설정이라 못 잡았다.
    // 그래서 **전부** 센다.
    expect(글아닌것세기(s.root)).toEqual(앞);
    expect(글아닌것세기(문서.열기(d.저장()).구역들[0]!.root)).toEqual(앞);
  });
});

describe('저장 길목에 규격 검사가 박혀 있다', () => {
  function 표든문서(이름: string) {
    return 문서.열기(fs.readFileSync(path.join(기준파일, 이름)));
  }

  it('멀쩡한 문서를 열고 그대로 저장하면 막지 않는다', () => {
    for (const 이름 of ['ref-table-basic.hwpx', 'ref-table-merge.hwpx', 'ref-image.hwpx']) {
      expect(() => 표든문서(이름).저장()).not.toThrow();
    }
  });

  /**
   * **흠이 있는 문서**를 만든다 — 우리 손을 거치지 않고 바이트를 직접 고친다.
   *
   * 우리 기준 파일은 다 멀쩡해서, 이걸 안 만들면
   * "원래 있던 흠은 안 막는다" 는 시험이 헛돈다.
   * 실제로 헛돌았다 — 저장이 모든 흠을 막게 고장 냈는데도 시험이 다 통과했다.
   */
  function 흠난바이트(): Buffer {
    const c = HwpxContainer.open(fs.readFileSync(path.join(기준파일, 'ref-table-basic.hwpx')));
    const 이름 = c.sectionNames()[0]!;
    // 첫 셀이 두 칸을 덮게 만든다 — 옆 셀과 겹친다
    c.writeText(이름, c.readText(이름).replace('colSpan="1"', 'colSpan="2"'));
    return c.save();
  }

  it('**원래 흠이 있던 문서도 열고 그대로 저장된다**', () => {
    // 남이 만든 문서에도 흠이 있다 (161편을 훑으니 표 기하만 64건,
    // 교육부 문서에도 '셀 폭과 열 폭 합이 다르다' 가 있다).
    // 그걸 이유로 열고 저장하는 것까지 막으면 쓸 수 없는 도구가 된다.
    const d = 문서.열기(흠난바이트());
    expect(d.검사().length).toBeGreaterThan(0);      // 흠이 있는 문서가 맞다
    expect(() => d.저장()).not.toThrow();            // 그래도 막지 않는다
  });

  it('흠이 있던 문서에서도 **흠을 더 내면** 막는다', () => {
    const d = 문서.열기(흠난바이트());
    const 앞 = d.검사().length;
    const 다른셀 = new 표(d.구역들[0]!.표들[0]!).셀들[2]!;
    setAttr(firstChildNamed(다른셀.el, 'hp:cellSpan')!, 'rowSpan', '3');
    expect(d.검사().length).toBeGreaterThan(앞);
    expect(() => d.저장()).toThrow(/없던 흠/);
  });

  it('**우리가 흠을 새로 내면 저장이 멈춘다**', () => {
    const d = 표든문서('ref-table-basic.hwpx');
    // 첫 셀이 두 칸을 덮게 만든다 — 옆 셀과 겹쳐 표 기하가 어긋난다
    const 첫셀 = new 표(d.구역들[0]!.표들[0]!).셀들[0]!;
    setAttr(firstChildNamed(첫셀.el, 'hp:cellSpan')!, 'colSpan', '2');

    expect(() => d.저장()).toThrow(/없던 흠/);
  });

  it('멈출 때 **무엇이 늘었는지** 말한다', () => {
    const d = 표든문서('ref-table-basic.hwpx');
    const 첫셀 = new 표(d.구역들[0]!.표들[0]!).셀들[0]!;
    setAttr(firstChildNamed(첫셀.el, 'hp:cellSpan')!, 'colSpan', '2');

    try {
      d.저장();
      throw new Error('막았어야 한다');
    } catch (e) {
      const 말 = (e as Error).message;
      expect(말).toContain('겹쳐');
      expect(말).toContain('되짚어');
    }
  });

  it('흠을 되돌리면 다시 저장된다 (한 번 막혔다고 영영 막히지 않는다)', () => {
    const d = 표든문서('ref-table-basic.hwpx');
    const span = firstChildNamed(new 표(d.구역들[0]!.표들[0]!).셀들[0]!.el, 'hp:cellSpan')!;
    setAttr(span, 'colSpan', '2');
    expect(() => d.저장()).toThrow();
    setAttr(span, 'colSpan', '1');
    expect(() => d.저장()).not.toThrow();
  });
});

describe('구역을 더한다', () => {
  /**
   * 실측: 문서 161편 가운데 10편(6%)이 구역을 나눈다.
   *
   * 네 가지를 다 해야 한글이 받는다. 넷째(`secCnt`)를 찾는 데 한나절이 걸렸다 —
   * 부품·manifest·spine 을 다 맞춰도 한글이 둘째 구역을 통째로 버렸다.
   * 기준 파일에 우리 부품을 하나씩 바꿔 끼워 보고서야 `header.xml` 이 나왔다.
   */
  it('구역 파일이 하나 는다', () => {
    const d = 문서.새로();
    expect(d.구역이름들.length).toBe(1);
    const r = 꺼내기(d.구역더하기());
    expect(r.이름).toBe('Contents/section1.xml');
    expect(d.구역이름들.length).toBe(2);
  });

  it('**머리글의 secCnt 도 같이 오른다** (이게 없으면 한글이 버린다)', () => {
    const d = 문서.새로();
    expect(d.머리.구역수).toBe(1);
    꺼내기(d.구역더하기());
    expect(d.머리.구역수).toBe(2);
  });

  it('manifest 에 item 과 itemref 가 **둘 다** 들어간다', () => {
    const d = 문서.새로();
    꺼내기(d.구역더하기());
    const hpf = d.컨테이너.readText(부품.manifest);
    expect(hpf).toContain('<opf:item id="section1"');
    expect(hpf).toContain('<opf:itemref idref="section1"');
    // **목록 안**에 있어야 한다. 밖으로 나가면 한글이 못 읽는다.
    expect(hpf.indexOf('id="section1"')).toBeLessThan(hpf.indexOf('</opf:manifest>'));
  });

  it('부품 차례가 section0 바로 뒤다', () => {
    const d = 문서.새로();
    꺼내기(d.구역더하기());
    const 이름들 = d.컨테이너.names();
    expect(이름들.indexOf('Contents/section1.xml'))
      .toBe(이름들.indexOf('Contents/section0.xml') + 1);
  });

  it('새 구역에 쪽 설정이 딸려 온다 (없으면 한글이 못 연다)', () => {
    const d = 문서.새로();
    꺼내기(d.구역더하기());
    expect(findAll(d.구역들[1]!.root, 'hp:secPr').length).toBeGreaterThan(0);
  });

  it('**남의 글이 안 딸려 온다**', () => {
    // 빈 문서로 시험하면 안 된다 — 지울 글이 없어서 무엇을 해도 통과한다.
    // 실제로 그랬다: 글을 안 비우게 고장 냈는데 시험이 다 통과했다.
    // **글이 든 문서**에서 봐야 한다.
    const d = 문서.열기(fs.readFileSync(path.join(기준파일, 'ref-text-basic.hwpx')));
    const 첫구역글 = d.구역들[0]!.모든문단들.map((p) => p.글 ?? '').join('').trim();
    expect(첫구역글.length, '기준 파일에 글이 있어야 이 시험이 뜻이 있다').toBeGreaterThan(3);

    꺼내기(d.구역더하기());
    const 둘째글 = d.구역들[1]!.모든문단들.map((p) => p.글 ?? '').join('').trim();
    expect(둘째글).toBe('');
  });

  it('새 구역에 남의 표·그림이 안 딸려 온다', () => {
    const d = 문서.열기(fs.readFileSync(path.join(기준파일, 'ref-table-basic.hwpx')));
    expect(d.구역들[0]!.표들.length).toBeGreaterThan(0);
    꺼내기(d.구역더하기());
    expect(d.구역들[1]!.표들.length).toBe(0);
  });

  it('저장했다 다시 열어도 두 구역이다', () => {
    const d = 문서.새로();
    꺼내기(d.구역더하기());
    const 뒤 = 문서.열기(d.저장());
    expect(뒤.구역이름들.length).toBe(2);
    expect(뒤.머리.구역수).toBe(2);
    expect(뒤.검사()).toEqual([]);
  });

  it('세 번 더해도 번호가 이어진다', () => {
    const d = 문서.새로();
    for (const 기대 of ['Contents/section1.xml', 'Contents/section2.xml', 'Contents/section3.xml']) {
      expect(꺼내기(d.구역더하기()).이름).toBe(기대);
    }
    expect(d.머리.구역수).toBe(4);
  });
});

describe('어구바꾸기 — 서식을 안 부순다', () => {
  /**
   * `글바꾸기` 는 문단을 통째로 갈아서 런이 합쳐진다.
   * 문장 가운데 굵은 낱말이 있으면 굵기가 날아간다. 실제로 재 봤다:
   * 런 3개 → 1개, 굵은 것 1개 → 0개.
   *
   * Draftsmith 가 만든 문서 여덟 편이 **전부** 이런 쪼개진 문단을 갖고 있다.
   * 「이어서 고치기」로 그 문서를 다시 열어 고치는 일이 흔하다.
   *
   * 쪼개진 문단은 **실제로 쪼개지는 길**로 만든다 — 손으로 짜면 딴 것을 시험하게 된다.
   */
  function 쪼개진문서() {
    const d = 문서.새로();
    d.ID매기기();
    // `**…**` 가 런을 셋으로 가른다. Draftsmith 지침의 emphasize 와 같은 길이다.
    const r = 조판(d, [{ kind: 'body', text: '2026학년도 **한빛초등학교** 운영 계획', indent: false }]);
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);
    const p = d.구역들[0]!.모든문단들.find((x) => (x.글 ?? '').includes('한빛'))!;
    expect(p.런들.length, '런이 셋으로 갈려야 이 시험이 뜻이 있다').toBeGreaterThanOrEqual(3);
    return { d, p };
  }

  it('칸 안 어구는 바꾸고 **런을 안 건드린다**', () => {
    const { p } = 쪼개진문서();
    const 앞런수 = p.런들.length;
    const r = 꺼내기(p.어구바꾸기('한빛초등학교', '한빛초'));
    expect(r.바뀐수).toBe(1);
    expect(p.런들.length, '런이 합쳐지면 서식이 날아간다').toBe(앞런수);
    expect(p.글).toContain('한빛초 운영');
  });

  it('**칸 경계를 넘는 어구는 못 찾았다고 말한다**', () => {
    const { p } = 쪼개진문서();
    const 앞글 = p.글;
    const r = 꺼내기(p.어구바꾸기('한빛초등학교 운영', 'x'));
    expect(r.바뀐수).toBe(0);
    expect(r.못찾음, '문단 전체로는 있으니 그렇다고 알려야 한다').toBe(true);
    expect(p.글, '못 찾았으면 아무것도 안 건드려야 한다').toBe(앞글);
  });

  it('아예 없는 글은 못찾음도 아니다', () => {
    const { p } = 쪼개진문서();
    const r = 꺼내기(p.어구바꾸기('있지도 않은 글', 'x'));
    expect(r.바뀐수).toBe(0);
    expect(r.못찾음).toBe(false);
  });

  it('빈 글은 거절한다', () => {
    expect(쪼개진문서().p.어구바꾸기('', 'x').ok).toBe(false);
  });

  it('**굵기가 살아남는다** — 이게 이 함수가 있는 까닭이다', () => {
    const { d, p } = 쪼개진문서();
    꺼내기(p.어구바꾸기('한빛초등학교', '한빛초'));
    const 머리 = parseXml(d.머리.toXml()).root;
    const 굵은런 = p.런들.filter((r) => {
      const cp = findAll(머리, 'hh:charPr').find((x) => getAttr(x, 'id') === getAttr(r, 'charPrIDRef'));
      return cp !== undefined && findAll(cp, 'hh:bold').length > 0;
    });
    expect(굵은런.length, '가운데 낱말의 굵기가 남아야 한다').toBeGreaterThan(0);
  });
});

describe('묵은 줄 정보를 지운다 — 글자가 겹치지 않게', () => {
  /**
   * `hp:linesegarray` 는 한글이 그릴 때 재어 적어 둔 것이다.
   * 글을 갈면 **틀린 값이 된다** — 59자를 넣었는데 8자까지만 적혀 있으면
   * 한글이 그 말을 믿고 글자를 한 줄에 겹쳐 그린다.
   *
   * 실측: 학교 양식 셀에 긴 글을 넣으니 PDF 에서 글자가 뭉갰다.
   * 겹친 자리 44곳 → 지우고 나서 9곳(그건 위첨자 같은 정상 것).
   *
   * Draftsmith 는 이걸 피하려고 지침에 「칸에 넣을 문구는 짧게 끊어 쓴다」 한 절을
   * 통째로 두고 있었다. 도구가 고치면 그 절이 필요 없어진다.
   */
  function 줄정보든문단() {
    const c = HwpxContainer.open(fs.readFileSync(path.join(기준파일, 'ref-text-basic.hwpx')));
    const d = 문서.열기(c.save());
    d.ID매기기();
    const p = d.구역들[0]!.모든문단들.find((x) => (x.글 ?? '').trim().length > 0)!;
    return { d, p };
  }

  it('원본에는 줄 정보가 있다 (이 시험이 뜻이 있으려면)', () => {
    const { p } = 줄정보든문단();
    expect(findAll(p.el, 'hp:linesegarray').length).toBeGreaterThan(0);
  });

  it('**글을 갈면 줄 정보가 사라진다**', () => {
    const { d, p } = 줄정보든문단();
    d.글바꾸기(d.이름표.아이디(p.el), '아주 아주 아주 훨씬 더 긴 글로 갈아 넣는다. 원래보다 몇 배는 길다.');
    expect(findAll(p.el, 'hp:linesegarray').length, '묵은 줄 정보가 남으면 글자가 겹친다').toBe(0);
  });

  it('어구만 바꿔도 줄 정보가 사라진다', () => {
    const { p } = 줄정보든문단();
    const 첫낱말 = (p.글 ?? '').trim().slice(0, 2);
    꺼내기(p.어구바꾸기(첫낱말, `${첫낱말}아주아주긴것`));
    expect(findAll(p.el, 'hp:linesegarray').length).toBe(0);
  });

  it('안 바꿨으면 줄 정보를 안 건드린다', () => {
    const { p } = 줄정보든문단();
    const 앞 = findAll(p.el, 'hp:linesegarray').length;
    꺼내기(p.어구바꾸기('있지도 않은 글', 'x'));
    expect(findAll(p.el, 'hp:linesegarray').length, '못 찾았으면 아무것도 안 건드려야 한다').toBe(앞);
  });

  /**
   * **늘 지우면 값을 치른다.** 글자 수도 폭도 그대로면 원래 줄 정보가
   * 여전히 맞는데, 지워 버리면 한글이 다시 재고 그 값이 원래와 달라
   * **쪽이 늘어난다** — 정부 문서 427칸을 같은 길이 글로 채웠더니 23쪽 → 26쪽.
   * 그래서 **짜임이 달라졌을 때만** 지운다.
   */
  it('**같은 짜임으로 갈면 줄 정보를 그대로 둔다** (쪽이 안 늘게)', () => {
    const { d, p } = 줄정보든문단();
    const 앞 = findAll(p.el, 'hp:linesegarray').length;
    const 옛글 = (p.글 ?? '');
    // 글자마다 폭 갈래가 같은 글로 바꾼다 — 한글은 한글로, 빈칸은 빈칸으로
    const 새글 = [...옛글].map((c) => (c >= '가' && c <= '힣' ? '가' : c)).join('');
    expect(새글, '이 시험이 뜻이 있으려면 글이 달라야 한다').not.toBe(옛글);
    d.글바꾸기(d.이름표.아이디(p.el), 새글);
    expect(findAll(p.el, 'hp:linesegarray').length,
      '줄이 같은 자리에서 넘어가는데 지우면 쪽이 늘어난다').toBe(앞);
  });

  it('글자 수가 달라지면 지운다 (한 자만 늘어도)', () => {
    const { d, p } = 줄정보든문단();
    d.글바꾸기(d.이름표.아이디(p.el), `${p.글 ?? ''}가`);
    expect(findAll(p.el, 'hp:linesegarray').length).toBe(0);
  });

  it('수가 같아도 **폭 갈래가 다르면** 지운다 (한글 ↔ 영문)', () => {
    const { d, p } = 줄정보든문단();
    const 새글 = [...(p.글 ?? '')].map((c) => (c >= '가' && c <= '힣' ? 'a' : c)).join('');
    d.글바꾸기(d.이름표.아이디(p.el), 새글);
    expect(findAll(p.el, 'hp:linesegarray').length,
      '한글 자리에 영문이 오면 줄이 다른 데서 넘어간다').toBe(0);
  });

  it('어구바꾸기도 같은 짜임이면 그대로 둔다', () => {
    const { p } = 줄정보든문단();
    const 앞 = findAll(p.el, 'hp:linesegarray').length;
    const 첫두자 = (p.글 ?? '').trim().slice(0, 2);
    const 바꿀 = [...첫두자].map((c) => (c >= '가' && c <= '힣' ? '나' : c)).join('');
    if (바꿀 === 첫두자) return;   // 한글이 아니면 이 시험은 못 한다
    꺼내기(p.어구바꾸기(첫두자, 바꿀));
    expect(findAll(p.el, 'hp:linesegarray').length).toBe(앞);
  });
});

describe('칸 안에 문단이 여럿일 때 — 칸글바꾸기', () => {
  /**
   * `문단찾기` 는 칸을 주면 **첫 문단만** 집는다.
   * 그래서 `글바꾸기(cell_…)` 는 첫 줄만 갈고 둘째 줄의 옛 글을 남겼다.
   * 그러고도 "1곳이 바뀌었다" 고 말했다 — **조용한 반쪽 쓰기다.**
   *
   * 실제 계획서 양식에 한 칸에 문단이 둘인 칸이 4개 있었다.
   */
  function 문단둘인칸() {
    const d = 문서.열기(fs.readFileSync(path.join(기준파일, 'ref-table-nested.hwpx')));
    d.ID매기기();
    for (const s of d.구역들) {
      for (const t of s.표들) {
        const tt = new 표(t);
        const 표아이디 = d.이름표.아이디(t);
        for (let y = 0; y < tt.줄수; y++) {
          for (let x = 0; x < tt.칸수; x++) {
            const 셀 = tt.시작셀(y, x);
            if (!셀) continue;
            if (findAll(셀.subList, 'hp:p').length > 1) return { d, 칸: d.셀아이디(표아이디, y, x) };
          }
        }
      }
    }
    throw new Error('문단 둘인 칸이 없다 — 이 시험은 아무것도 안 본다');
  }

  it('칸문단들이 **문단을 다** 준다', () => {
    const { d, 칸 } = 문단둘인칸();
    expect(꺼내기(d.칸문단들(칸)).length).toBeGreaterThan(1);
  });

  it('칸문단들은 문단 ID 를 주면 거절한다', () => {
    const { d } = 문단둘인칸();
    const p = d.구역들[0]!.모든문단들[0]!;
    expect(d.칸문단들(d.이름표.아이디(p.el)).ok).toBe(false);
  });

  it('**줄바꿈으로 문단을 나눠 넣는다**', () => {
    const { d, 칸 } = 문단둘인칸();
    꺼내기(d.칸글바꾸기(칸, `윗줄\n아랫줄`));
    const 뒤 = 꺼내기(d.칸문단들(칸));
    expect(뒤[0]!.글).toBe('윗줄');
    expect(뒤[1]!.글).toBe('아랫줄');
  });

  it('**남는 문단을 비운다** — 옛 글이 뒤에 안 남는다', () => {
    const { d, 칸 } = 문단둘인칸();
    꺼내기(d.칸글바꾸기(칸, `윗줄\n아랫줄`));
    꺼내기(d.칸글바꾸기(칸, '한 줄만'));
    const 뒤 = 꺼내기(d.칸문단들(칸));
    expect(뒤[0]!.글).toBe('한 줄만');
    expect(뒤[1]!.글, '안 비우면 "한 줄만아랫줄" 이 된다').toBe('');
  });

  it('**문단보다 줄이 많으면 거절한다** — 말없이 합치지 않는다', () => {
    const { d, 칸 } = 문단둘인칸();
    const 문단수 = 꺼내기(d.칸문단들(칸)).length;
    const 너무많이 = Array.from({ length: 문단수 + 1 }, (_, i) => `${i}줄`).join('\n');
    const r = d.칸글바꾸기(칸, 너무많이);
    expect(r.ok, '넘치는데 받으면 줄이 사라진 줄도 모른다').toBe(false);
  });

  it('거절했으면 칸을 안 건드린다', () => {
    const { d, 칸 } = 문단둘인칸();
    꺼내기(d.칸글바꾸기(칸, `가\n나`));
    const 문단수 = 꺼내기(d.칸문단들(칸)).length;
    d.칸글바꾸기(칸, Array.from({ length: 문단수 + 1 }, (_, i) => `x${i}`).join('\n'));
    const 뒤 = 꺼내기(d.칸문단들(칸));
    expect(뒤[0]!.글).toBe('가');
    expect(뒤[1]!.글).toBe('나');
  });
});
