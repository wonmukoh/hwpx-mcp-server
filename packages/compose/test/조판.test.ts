/**
 * 조판 — 블록 목록으로 문서 한 편이 나오나.
 *
 * 여기서 보는 것은 **XML 이 맞나** 까지다.
 * 한글이 여는지·눈으로 어떻게 보이는지는 `검증/조판수용시험.mjs` 가 본다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { 부품, HwpxContainer } from '@hwpx/container';
import {
  parseXml, findAll, childrenNamed, firstChildNamed, getAttr, textOf,
} from '@hwpx/owpml';
import { 문서, 표, 그림크기, 꺼내기 } from '@hwpx/doc';
import { 조판, 정렬맞추기, 조각 } from '../src/index.js';
import type { 블록 } from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');

function 새문서(): 문서 {
  const d = 문서.새로();
  d.ID매기기();
  return d;
}

function 머리(d: 문서) {
  return parseXml(d.머리.toXml()).root;
}

function 본문글(d: 문서): string[] {
  return d.구역들[0]!.모든문단들.map((p) => p.글).filter(Boolean);
}

describe('구운 조각이 온전한가', () => {
  it('문단 조각에 런과 글자 칸이 있다', () => {
    const el = parseXml(조각.문단).root;
    expect(el.name).toBe('hp:p');
    const 런 = childrenNamed(el, 'hp:run')[0];
    expect(런).toBeDefined();
    expect(childrenNamed(런!, 'hp:t').length).toBe(1);
    // 줄 배치는 한글이 다시 계산한다 — 우리가 넣으면 더 틀린다
    expect(firstChildNamed(el, 'hp:linesegarray')).toBeUndefined();
  });

  it('셀 조각에 다섯 자식이 다 있다 (실측 21411/21411)', () => {
    const el = parseXml(조각.셀).root;
    for (const 이름 of ['hp:subList', 'hp:cellAddr', 'hp:cellSpan', 'hp:cellSz', 'hp:cellMargin']) {
      expect(firstChildNamed(el, 이름), 이름).toBeDefined();
    }
  });

  it('표 뼈대에 줄이 없고 sz·pos·여백이 있다', () => {
    const el = parseXml(조각.표뼈대).root;
    expect(childrenNamed(el, 'hp:tr').length).toBe(0);
    for (const 이름 of ['hp:sz', 'hp:pos', 'hp:outMargin', 'hp:inMargin']) {
      expect(firstChildNamed(el, 이름), 이름).toBeDefined();
    }
  });
});

describe('블록을 쓴다', () => {
  it('제목 · 띠 · 개조식 · 상자 · 표 · 글 · 쪽나눔이 다 들어간다', () => {
    const d = 새문서();
    const r = 꺼내기(조판(d, [
      { kind: 'title', text: '제목', date: '2026. 3.', org: '교 육 부' },
      { kind: 'band', text: 'Ⅰ. 배경' },
      { kind: 'outline', items: [{ level: 1, text: '첫째' }, { level: 2, text: '둘째' }] },
      { kind: 'box', title: '< 상자 >', items: ['하나', '둘'] },
      { kind: 'page_break' },
      { kind: 'table', headers: ['가', '나'], rows: [['1', '2']] },
      { kind: 'text', text: '※ 붙임', size: 9, align: 'right' },
    ]));

    expect(r.만든것.map((m) => m.kind)).toEqual([
      'title', 'band', 'outline', 'box', 'page_break', 'table', 'text',
    ]);
    const 글 = 본문글(d);
    for (const 있어야할것 of ['제목', '교 육 부', 'Ⅰ. 배경', '□ 첫째', '○ 둘째', '< 상자 >', '· 하나', '가', '1', '※ 붙임']) {
      expect(글, 있어야할것).toContain(있어야할것);
    }
    expect(d.검사()).toEqual([]);
  });

  it('저장했다 다시 열어도 그대로다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'text', text: '한 줄' }]));
    const 다시 = 문서.열기(d.저장());
    expect(본문글(다시)).toContain('한 줄');
    expect(다시.검사()).toEqual([]);
  });

  it('블록이 없으면 못 한다고 한다', () => {
    const r = 조판(새문서(), []);
    expect(r.ok).toBe(false);
  });

  it('모르는 블록은 무엇이 되는지 알려 준다', () => {
    const r = 조판(새문서(), [{ kind: '없는것' } as unknown as 블록]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.어떻게).toContain('title');
  });

  it('중간에 실패하면 **몇 개까지 들어갔는지** 말한다', () => {
    const r = 조판(새문서(), [
      { kind: 'text', text: '하나' },
      { kind: 'text', text: '둘' },
      { kind: 'outline', items: [] },       // 여기서 실패한다
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.이유).toContain('2번째');
    expect(r.어떻게).toContain('2개는 이미 들어갔다');
  });
});

describe('개조식', () => {
  it('수준마다 머리표와 들여쓰기가 다르다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'outline', items: [
      { level: 1, text: '가' }, { level: 2, text: '나' }, { level: 3, text: '다' },
    ] }]));
    const 글 = 본문글(d);
    expect(글).toContain('□ 가');
    expect(글).toContain('○ 나');
    expect(글).toContain('- 다');

    // 들여쓰기가 수준마다 커진다
    const 여백들 = d.구역들[0]!.문단들.filter((p) => /^[□○-] /.test(p.글)).map((p) => {
      const pp = findAll(머리(d), 'hh:paraPr').find((x) => getAttr(x, 'id') === p.문단모양)!;
      const sw = firstChildNamed(pp, 'hp:switch')!;
      const def = firstChildNamed(sw, 'hp:default')!;
      const m = firstChildNamed(def, 'hh:margin')!;
      return Number(getAttr(firstChildNamed(m, 'hc:left')!, 'value'));
    });
    expect(여백들[0]).toBeLessThan(여백들[1]!);
    expect(여백들[1]).toBeLessThan(여백들[2]!);
  });

  it('강조한 어구가 따로 런이 된다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'outline', emphasize: ['조기 개입'], items: [
      { level: 1, text: '지금은 조기 개입이 필요하다' },
    ] }]));
    const p = d.구역들[0]!.문단들.find((x) => x.글.includes('조기 개입'))!;
    expect(p.런들.length).toBeGreaterThan(1);
    // 글은 그대로여야 한다
    expect(p.글).toBe('□ 지금은 조기 개입이 필요하다');
  });

  it('**강조할 어구를 한 줄에서도 못 찾으면 못 한다고 한다**', () => {
    const r = 조판(새문서(), [{ kind: 'outline', emphasize: ['없는 말'], items: [
      { level: 1, text: '있는 말' },
    ] }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.이유).toContain('없는 말');
  });

  it('항목이 없으면 못 한다고 한다', () => {
    expect(조판(새문서(), [{ kind: 'outline', items: [] }]).ok).toBe(false);
  });
});

describe('표', () => {
  it('머리 줄이 있으면 굵게·가운데·배경색이 붙고 되풀이가 켜진다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'table', headers: ['가', '나'], rows: [['1', '2'], ['3', '4']] }]));

    const t = new 표(d.구역들[0]!.표들[0]!);
    expect(t.줄수).toBe(3);
    expect(t.칸수).toBe(2);
    expect(t.머리행반복).toBe(true);
    expect(t.탈만).toEqual([]);

    // 머리 칸에 header="1"
    for (let c = 0; c < 2; c++) expect(getAttr(t.셀(0, c)!.el, 'header')).toBe('1');
    for (let c = 0; c < 2; c++) expect(getAttr(t.셀(1, c)!.el, 'header')).toBe('0');
  });

  it('**셀 테두리가 조각이 들고 온 번호를 그대로 쓰지 않는다**', () => {
    // 구운 조각은 원본 문서의 borderFillIDRef 를 들고 있다.
    // 딴 문서에 붙이면 그 번호가 딴 것을 가리킨다 —
    // 실제로 표 본문이 통째로 남색이 된 적이 있다.
    const d = 새문서();
    const 조각셀테두리 = getAttr(parseXml(조각.셀).root, 'borderFillIDRef');
    꺼내기(조판(d, [
      { kind: 'band', text: '띠가 먼저 배경색을 만든다' },
      { kind: 'table', headers: ['가'], rows: [['1']] },
    ]));

    const t = new 표(d.구역들[0]!.표들[0]!);
    const 몸셀 = t.셀(1, 0)!;
    expect(몸셀.테두리).not.toBe(조각셀테두리);

    // 그 테두리에 채움이 없어야 한다 (띠 배경을 가리키면 안 된다)
    const bf = findAll(머리(d), 'hh:borderFill').find((x) => getAttr(x, 'id') === 몸셀.테두리)!;
    const 붓 = findAll(bf, 'hc:winBrush')[0];
    const 채움 = 붓 ? getAttr(붓, 'faceColor') : 'none';
    expect(채움 === 'none' || 채움 === undefined).toBe(true);
  });

  it('열 폭을 주면 그대로, 안 주면 고르게 나눈다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'table', rows: [['1', '2', '3']], widths: [100, 200, 300] }]));
    const t = new 표(d.구역들[0]!.표들[0]!);
    const 폭 = t.열폭 as number[];
    expect(폭[1]! / 폭[0]!).toBeCloseTo(2, 1);
    expect(폭[2]! / 폭[0]!).toBeCloseTo(3, 1);
    expect(t.탈만).toEqual([]);
  });

  it('줄마다 칸 수가 다르면 **어느 줄인지** 말한다', () => {
    const r = 조판(새문서(), [{ kind: 'table', rows: [['1', '2'], ['3']] }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.이유).toContain('1번째 줄');
  });

  it('widths 개수가 안 맞으면 못 한다고 한다', () => {
    const r = 조판(새문서(), [{ kind: 'table', rows: [['1', '2']], widths: [100] }]);
    expect(r.ok).toBe(false);
  });

  it('빈 표는 못 한다고 한다', () => {
    expect(조판(새문서(), [{ kind: 'table', rows: [] }]).ok).toBe(false);
  });
});

describe('띠', () => {
  it('배경색이 borderFill 에 들어가고 테두리는 안 그린다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'band', text: 'Ⅰ. 배경', background: '#1F4E9C' }]));

    const p = d.구역들[0]!.문단들.find((x) => x.글.includes('배경'))!;
    const pp = findAll(머리(d), 'hh:paraPr').find((x) => getAttr(x, 'id') === p.문단모양)!;
    const bfId = getAttr(firstChildNamed(pp, 'hh:border')!, 'borderFillIDRef');
    const bf = findAll(머리(d), 'hh:borderFill').find((x) => getAttr(x, 'id') === bfId)!;

    expect(getAttr(findAll(bf, 'hc:winBrush')[0]!, 'faceColor')).toBe('#1F4E9C');
    for (const 면 of ['left', 'right', 'top', 'bottom']) {
      expect(getAttr(firstChildNamed(bf, `hh:${면}Border`)!, 'type'), 면).toBe('NONE');
    }
  });
});

describe('상자 — 한 덩이로 이어 그린다', () => {
  it('첫 줄에 위, 끝 줄에 아래, 가운데는 좌우만', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'box', title: '머리', items: ['하나', '둘'] }]));

    const 줄들 = d.구역들[0]!.문단들.filter((p) => ['머리', '· 하나', '· 둘'].includes(p.글));
    expect(줄들.length).toBe(3);

    const 면얻기 = (p: (typeof 줄들)[number]) => {
      const pp = findAll(머리(d), 'hh:paraPr').find((x) => getAttr(x, 'id') === p.문단모양)!;
      const bfId = getAttr(firstChildNamed(pp, 'hh:border')!, 'borderFillIDRef');
      const bf = findAll(머리(d), 'hh:borderFill').find((x) => getAttr(x, 'id') === bfId)!;
      return Object.fromEntries(['left', 'right', 'top', 'bottom'].map((면) =>
        [면, getAttr(firstChildNamed(bf, `hh:${면}Border`)!, 'type')]));
    };

    expect(면얻기(줄들[0]!)).toEqual({ left: 'SOLID', right: 'SOLID', top: 'SOLID', bottom: 'NONE' });
    expect(면얻기(줄들[1]!)).toEqual({ left: 'SOLID', right: 'SOLID', top: 'NONE', bottom: 'NONE' });
    expect(면얻기(줄들[2]!)).toEqual({ left: 'SOLID', right: 'SOLID', top: 'NONE', bottom: 'SOLID' });
  });

  it('한 줄짜리 상자는 네 면을 다 두른다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'box', text: '한 줄' }]));
    const p = d.구역들[0]!.문단들.find((x) => x.글 === '한 줄')!;
    const pp = findAll(머리(d), 'hh:paraPr').find((x) => getAttr(x, 'id') === p.문단모양)!;
    const bfId = getAttr(firstChildNamed(pp, 'hh:border')!, 'borderFillIDRef');
    const bf = findAll(머리(d), 'hh:borderFill').find((x) => getAttr(x, 'id') === bfId)!;
    for (const 면 of ['left', 'right', 'top', 'bottom']) {
      expect(getAttr(firstChildNamed(bf, `hh:${면}Border`)!, 'type'), 면).toBe('SOLID');
    }
  });

  it('넣을 글이 없으면 못 한다고 한다', () => {
    expect(조판(새문서(), [{ kind: 'box' }]).ok).toBe(false);
  });
});

describe('header 가 안 부푼다', () => {
  it('같은 블록을 50번 써도 charPr 이 는 만큼만 는다', () => {
    const d = 새문서();
    const charPr수 = () => findAll(머리(d), 'hh:charPr').length;

    꺼내기(조판(d, [{ kind: 'text', text: '한 줄', size: 11 }]));
    const 한번 = charPr수();

    for (let i = 0; i < 49; i++) {
      꺼내기(조판(d, [{ kind: 'text', text: `${i}번째 줄`, size: 11 }]));
    }
    expect(charPr수()).toBe(한번);
  });

  it('itemCnt 가 늘 맞는다', () => {
    const d = 새문서();
    꺼내기(조판(d, [
      { kind: 'title', text: '제목' },
      { kind: 'band', text: '띠' },
      { kind: 'box', text: '상자' },
      { kind: 'table', headers: ['가'], rows: [['1']] },
    ]));
    expect(d.머리.itemCnt검사()).toEqual([]);
    expect(문서.열기(d.저장()).머리.itemCnt검사()).toEqual([]);
  });
});

describe('정렬 이름', () => {
  it('아는 이름을 규격 값으로 바꾼다', () => {
    expect(정렬맞추기('center')).toBe('CENTER');
    expect(정렬맞추기('both')).toBe('JUSTIFY');
    expect(정렬맞추기(undefined)).toBeUndefined();
  });

  it('모르는 이름은 무엇이 되는지 알려 준다', () => {
    expect(() => 정렬맞추기('가운데')).toThrow(/left, center, right/);
  });
});

describe('본문 · 소제목 · 주석 — 정부 문서의 뼈대', () => {
  it('본문은 첫 줄을 공백 두 칸으로 들여쓴다 (실측: 41문단이 그랬다)', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'body', text: '본문 한 줄' }]));
    const p = d.구역들[0]!.문단들.find((x) => x.글.includes('본문 한 줄'))!;
    expect(p.글).toBe('  본문 한 줄');
  });

  it('indent:false 면 안 들여쓴다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'body', text: '안 들여쓴다', indent: false }]));
    expect(d.구역들[0]!.문단들.some((x) => x.글 === '안 들여쓴다')).toBe(true);
  });

  it('본문 안 표시가 런으로 쪼개진다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'body', text: '앞 **굵게** 가운데 [[강조]] 뒤' }]));
    const p = d.구역들[0]!.문단들.find((x) => x.글.includes('굵게'))!;
    // 앞 / 굵게 / 가운데 / 강조 / 뒤
    expect(p.런들.length).toBe(5);
    expect(p.글).toBe('  앞 굵게 가운데 강조 뒤');

    // 굵은 것과 파란 것이 서로 다른 charPr 을 쓴다
    const 모양들 = p.글자모양들;
    expect(new Set(모양들).size).toBeGreaterThanOrEqual(3);
  });

  it('강조색이 charPr 에 실제로 들어간다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'body', text: '[[파란 말]]' }]));
    const 파란게있나 = findAll(머리(d), 'hh:charPr')
      .some((cp) => getAttr(cp, 'textColor') === '#0000FF');
    expect(파란게있나).toBe(true);
  });

  it('소제목은 굵고 위 여백이 더 크다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'body', text: '본문' }, { kind: 'heading', text: '(3) 소제목' }]));

    const 소 = d.구역들[0]!.문단들.find((x) => x.글.includes('소제목'))!;
    const 본 = d.구역들[0]!.문단들.find((x) => x.글.includes('본문'))!;
    const 위여백 = (p: typeof 소) => {
      const pp = findAll(머리(d), 'hh:paraPr').find((x) => getAttr(x, 'id') === p.문단모양)!;
      const sw = firstChildNamed(pp, 'hp:switch')!;
      const def = firstChildNamed(sw, 'hp:default')!;
      const m = firstChildNamed(def, 'hh:margin')!;
      return Number(getAttr(firstChildNamed(m, 'hc:prev')!, 'value'));
    };
    expect(위여백(소)).toBeGreaterThan(위여백(본));
  });

  it('주석은 **내어쓰기**다 (둘째 줄이 첫 줄보다 들어간다)', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'note', text: '※ 주석 한 줄' }]));
    const p = d.구역들[0]!.문단들.find((x) => x.글.includes('주석'))!;
    const pp = findAll(머리(d), 'hh:paraPr').find((x) => getAttr(x, 'id') === p.문단모양)!;
    const sw = firstChildNamed(pp, 'hp:switch')!;
    const def = firstChildNamed(sw, 'hp:default')!;
    const m = firstChildNamed(def, 'hh:margin')!;
    expect(Number(getAttr(firstChildNamed(m, 'hc:intent')!, 'value'))).toBeLessThan(0);
  });

  it('안 닫힌 표시는 **블록 번호까지 짚어** 멈춘다', () => {
    const r = 조판(새문서(), [
      { kind: 'body', text: '멀쩡한 줄' },
      { kind: 'body', text: '앞 **안 닫음' },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.이유).toContain('1번째');
    expect(r.이유).toContain('안 닫혔다');
  });
});

describe('쪽 설정', () => {
  it('쪽 여백을 pt 로 준다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'body', text: '글' }], {
      page: { margin_left: 56.69, margin_right: 56.69 },
    }));
    const 여백 = d.구역들[0]!.쪽여백!;
    // 56.69pt = 5669 HWPUNIT
    expect(여백['left']).toBe(5669);
    expect(여백['right']).toBe(5669);
  });

  it('본문 너비가 여백을 따라 줄어든다', () => {
    const d = 새문서();
    const 앞 = d.구역들[0]!.본문너비!;
    꺼내기(조판(d, [{ kind: 'body', text: '글' }], {
      page: { margin_left: 56.69, margin_right: 56.69 },
    }));
    const 뒤 = d.구역들[0]!.본문너비!;
    expect(뒤).toBeGreaterThan(앞);   // 여백이 줄었으니 본문은 넓어진다
    expect(뒤).toBe(59528 - 5669 * 2);
  });

  it('**표 폭이 구역 본문 너비를 따른다** (못 박은 값을 쓰지 않는다)', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'table', rows: [['가', '나']] }], {
      page: { margin_left: 56.69, margin_right: 56.69 },
    }));
    const t = new 표(d.구역들[0]!.표들[0]!);
    const 폭합 = (t.열폭 as number[]).reduce((a, b) => a + b, 0);
    expect(폭합).toBe(d.구역들[0]!.본문너비);
  });

  it('쪽 번호를 넣는다 (머리말이 아니라 hp:pageNum — 실측 46/52편)', () => {
    const d = 새문서();
    expect(d.구역들[0]!.쪽번호있나).toBe(false);
    꺼내기(조판(d, [{ kind: 'body', text: '글' }], { page_number: 'bottom-center' }));

    const s = d.구역들[0]!;
    expect(s.쪽번호있나).toBe(true);
    const pn = findAll(s.root, 'hp:pageNum')[0]!;
    expect(getAttr(pn, 'pos')).toBe('BOTTOM_CENTER');
    // hp:ctrl 안에 있어야 한다
    expect(pn.parent?.name).toBe('hp:ctrl');
  });

  it('쪽 번호를 두 번 넣지 않는다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'body', text: '글' }], { page_number: 'bottom-center' }));
    꺼내기(조판(d, [{ kind: 'body', text: '또' }], { page_number: 'bottom-center' }));
    expect(findAll(d.구역들[0]!.root, 'hp:pageNum').length).toBe(1);
  });

  it('모르는 자리는 무엇이 되는지 알려 준다', () => {
    const r = 조판(새문서(), [{ kind: 'body', text: '글' }], {
      page_number: 'top-center' as never,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.어떻게).toContain('bottom-center');
  });
});

describe('자간 · 줄 간격', () => {
  it('자간을 주면 언어 일곱 쪽에 다 걸린다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'body', text: '글', letter_spacing: -6 }]));
    const cp = findAll(머리(d), 'hh:charPr').find((x) => {
      const sp = firstChildNamed(x, 'hh:spacing');
      return sp && getAttr(sp, 'hangul') === '-6';
    });
    expect(cp).toBeDefined();
    const sp = firstChildNamed(cp!, 'hh:spacing')!;
    for (const 언어 of ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user']) {
      expect(getAttr(sp, 언어), 언어).toBe('-6');
    }
  });

  it('줄 간격을 주면 두 갈래에 다 들어간다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'body', text: '글', line_spacing: 157 }]));
    const p = d.구역들[0]!.문단들.find((x) => x.글.includes('글'))!;
    const pp = findAll(머리(d), 'hh:paraPr').find((x) => getAttr(x, 'id') === p.문단모양)!;
    const sw = firstChildNamed(pp, 'hp:switch')!;
    for (const 가지 of ['hp:case', 'hp:default']) {
      const ls = firstChildNamed(firstChildNamed(sw, 가지)!, 'hh:lineSpacing')!;
      // 백분율은 길이가 아니다 — 두 갈래가 같다
      expect(getAttr(ls, 'value'), 가지).toBe('157');
    }
  });
});

describe('그림', () => {
  /** 기준 파일에서 png 를 꺼내 임시 파일로 */
  function 그림파일(): string {
    const 무대 = path.join(os.tmpdir(), 'hwpx-image-test');
    fs.mkdirSync(무대, { recursive: true });
    const 낼곳 = path.join(무대, 'test.png');
    if (!fs.existsSync(낼곳)) {
      const c = HwpxContainer.open(fs.readFileSync(path.join(뿌리, '자료', '기준파일', 'ref-image.hwpx')));
      fs.writeFileSync(낼곳, c.read('BinData/image1.png'));
    }
    return 낼곳;
  }

  it('그림 파일이 BinData 와 manifest **양쪽에** 들어간다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'image', path: 그림파일() }]));

    const 통 = d.컨테이너;
    expect(통.binDataNames().length).toBe(1);
    const hpf = 통.readText(부품.manifest);
    expect(hpf).toContain(통.binDataNames()[0]!);
    // 어긋나면 저장이 막힌다
    expect(d.검사()).toEqual([]);
  });

  it('크기가 **적히는 곳 전부**에 같은 값으로 들어간다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'image', path: 그림파일(), width: 100 }]));
    const pic = findAll(d.구역들[0]!.root, 'hp:pic')[0]!;

    const w = 10000;   // 100pt = 10000 HWPUNIT
    expect(getAttr(firstChildNamed(pic, 'hp:orgSz')!, 'width')).toBe(String(w));
    expect(getAttr(firstChildNamed(pic, 'hp:curSz')!, 'width')).toBe(String(w));
    expect(getAttr(firstChildNamed(pic, 'hp:imgDim')!, 'dimwidth')).toBe(String(w));
    expect(getAttr(firstChildNamed(pic, 'hp:imgClip')!, 'right')).toBe(String(w));
    expect(getAttr(firstChildNamed(pic, 'hp:sz')!, 'width')).toBe(String(w));

    const rect = firstChildNamed(pic, 'hp:imgRect')!;
    expect(getAttr(firstChildNamed(rect, 'hc:pt1')!, 'x')).toBe(String(w));
    expect(getAttr(firstChildNamed(rect, 'hc:pt2')!, 'x')).toBe(String(w));
  });

  it('너비만 주면 **비율을 지켜** 높이가 따라온다', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'image', path: 그림파일(), width: 60 }]));
    const pic = findAll(d.구역들[0]!.root, 'hp:pic')[0]!;
    const sz = firstChildNamed(pic, 'hp:sz')!;
    // 원본 120x80 → 60pt 면 40pt
    expect(Number(getAttr(sz, 'width'))).toBe(6000);
    expect(Number(getAttr(sz, 'height'))).toBe(4000);
  });

  it('쪽보다 넓으면 줄인다 (넘치면 한글이 잘라 그린다)', () => {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'image', path: 그림파일(), width: 9999 }]));
    const pic = findAll(d.구역들[0]!.root, 'hp:pic')[0]!;
    const 너비 = Number(getAttr(firstChildNamed(pic, 'hp:sz')!, 'width'));
    expect(너비).toBeLessThanOrEqual(d.구역들[0]!.본문너비!);
  });

  it('같은 그림을 두 번 넣어도 파일은 하나만 는다', () => {
    const d = 새문서();
    const p = 그림파일();
    꺼내기(조판(d, [{ kind: 'image', path: p }, { kind: 'image', path: p }]));
    expect(d.컨테이너.binDataNames().length).toBe(1);
    expect(findAll(d.구역들[0]!.root, 'hp:pic').length).toBe(2);
  });

  it('설명을 주면 아래에 문단이 하나 더 생긴다', () => {
    const d = 새문서();
    const r = 꺼내기(조판(d, [{ kind: 'image', path: 그림파일(), caption: '〈그림 1〉 시험' }]));
    expect(r.만든것[0]!.ids.length).toBe(2);
    expect(본문글(d)).toContain('〈그림 1〉 시험');
  });

  it('파일이 없으면 **절대 경로로 적으라고** 말한다', () => {
    const r = 조판(새문서(), [{ kind: 'image', path: 'C:\없는곳\없는그림.png' }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.어떻게).toContain('절대 경로');
  });

  it('그림이 아닌 형식은 **쓸 수 있는 것을 적어** 거절한다', () => {
    const 무대 = path.join(os.tmpdir(), 'hwpx-image-test');
    fs.mkdirSync(무대, { recursive: true });
    const 가짜 = path.join(무대, 'x.txt');
    fs.writeFileSync(가짜, 'not an image');
    const r = 조판(새문서(), [{ kind: 'image', path: 가짜 }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.어떻게).toContain('png');
  });
});

describe('그림 크기 읽기', () => {
  it('png 를 읽는다', () => {
    const c = HwpxContainer.open(fs.readFileSync(path.join(뿌리, '자료', '기준파일', 'ref-image.hwpx')));
    const r = 꺼내기(그림크기(c.read('BinData/image1.png')));
    expect(r.너비px).toBe(120);
    expect(r.높이px).toBe(80);
  });

  it('모르는 형식은 **짐작하지 않고** 못 읽는다고 한다', () => {
    const r = 그림크기(Buffer.from('아무것도 아닌 바이트'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.어떻게).toContain('width');
  });
});

describe('사각형 도형', () => {
  /** 도형 블록 하나로 문서를 만들고 그 hp:rect 를 준다 */
  function 도형만들기(b: Record<string, unknown>) {
    const d = 문서.새로();
    d.ID매기기();
    const r = 조판(d, [{ kind: 'shape', ...b } as never]);
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);
    const rect = findAll(d.구역들[0]!.root, 'hp:rect')[0];
    expect(rect, 'hp:rect 가 안 만들어졌다').toBeDefined();
    return { d, rect: rect! };
  }

  it('**글이 상자 안에 들어간다** (밖에 붙이면 빈 상자가 된다)', () => {
    const { rect } = 도형만들기({ text: '3주기 사업 개요', width: 300, height: 40 });
    const dt = findAll(rect, 'hp:drawText');
    expect(dt.length).toBe(1);
    expect(findAll(dt[0]!, 'hp:t').some((t) => textOf(t).includes('3주기 사업 개요'))).toBe(true);
  });

  it('크기가 **적히는 곳 전부**에 맞는다 (한 곳만 고치면 딴 크기로 그린다)', () => {
    const { rect } = 도형만들기({ text: '가', width: 300, height: 40 });
    const w = String(300 * 100);   // 300pt = 30000 HWPUNIT
    const h = String(40 * 100);
    for (const 태그 of ['hp:orgSz', 'hp:curSz', 'hp:sz']) {
      const e = findAll(rect, 태그)[0];
      expect(e, `${태그} 가 없다`).toBeDefined();
      expect([getAttr(e!, 'width'), getAttr(e!, 'height')], `${태그} 가 안 맞다`).toEqual([w, h]);
    }
    // 네 꼭짓점도 같이 움직여야 한다
    expect(getAttr(findAll(rect, 'hc:pt2')[0]!, 'x')).toBe(w);
    expect(getAttr(findAll(rect, 'hc:pt2')[0]!, 'y')).toBe(h);
  });

  it('테두리 색·굵기와 채움이 쓰인다', () => {
    const { rect } = 도형만들기({
      text: '가', width: 200, height: 30,
      border_color: '#1F4E9C', line_width: 1, background: '#D9E2F3',
    });
    const 선 = findAll(rect, 'hp:lineShape')[0]!;
    expect(getAttr(선, 'color')).toBe('#1F4E9C');
    expect(getAttr(선, 'width')).toBe('100');           // 1pt = 100 HWPUNIT
    expect(getAttr(findAll(rect, 'hc:winBrush')[0]!, 'faceColor')).toBe('#D9E2F3');
  });

  it('글 없이도 만들어진다 (빈 상자)', () => {
    const { rect } = 도형만들기({ width: 100, height: 20 });
    expect(findAll(rect, 'hp:drawText').length).toBe(0);
  });

  it('**남의 글이 딸려 오지 않는다** — 조각은 교육부 문서에서 떴다', () => {
    const { rect } = 도형만들기({ text: '가', width: 100, height: 20 });
    const 글들 = findAll(rect, 'hp:t').map(textOf);
    expect(글들.filter((t) => t.length > 0)).toEqual(['가']);
  });

  it('글 안에 놓인다 (treatAsChar) — 문단 정렬을 따르게', () => {
    const { rect } = 도형만들기({ text: '가', width: 100, height: 20 });
    expect(getAttr(findAll(rect, 'hp:pos')[0]!, 'treatAsChar')).toBe('1');
  });
});

describe('탭', () => {
  /**
   * 실측: 문서 161편 가운데 15편이 탭을 쓴다 (103개). 목차 줄이 대부분이다.
   *
   * `	` 를 글에 그대로 두면 한글이 안 읽는다 — `hp:tab` 요소로 갈라 넣어야 한다.
   * 너비는 0 으로 둔다. 한글이 문단의 탭 설정을 보고 스스로 잡는다.
   * PDF 로 구워 재 보니 실제로 자리를 벌린다 (x 158.9 → 192.3).
   */
  function 탭문서(글: string) {
    const d = 문서.새로();
    d.ID매기기();
    const r = 조판(d, [{ kind: 'body', text: 글, indent: false }]);
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);
    return d;
  }

  it('`	` 가 hp:tab 요소가 된다', () => {
    const d = 탭문서('Ⅰ. 추진 배경	3');
    expect(findAll(d.구역들[0]!.root, 'hp:tab').length).toBe(1);
  });

  it('탭 앞뒤 글이 다 살아 있다', () => {
    const d = 탭문서('가나	다라');
    const 글 = d.구역들[0]!.모든문단들.map((p) => p.글).join('');
    expect(글).toContain('가나');
    expect(글).toContain('다라');
  });

  it('탭 여럿도 된다', () => {
    const d = 탭문서('가	나	다');
    expect(findAll(d.구역들[0]!.root, 'hp:tab').length).toBe(2);
  });

  it('탭이 없으면 안 만든다', () => {
    expect(findAll(탭문서('가나다').구역들[0]!.root, 'hp:tab').length).toBe(0);
  });
});

describe('머리말·꼬리말', () => {
  /**
   * 실측: 문서 161편 가운데 12편(7%)이 머리말·꼬리말에 글을 넣는다.
   * 학교 가정통신문·공문은 거의 다 쓴다.
   *
   * PDF 로 구워 재 보니 머리말은 y=44.7, 꼬리말은 y=776.8 (쪽 높이 840)에 앉는다.
   */
  function 만들기(설정: Record<string, unknown>) {
    const d = 문서.새로();
    d.ID매기기();
    const r = 조판(d, [{ kind: 'body', text: '본문' }], 설정 as never);
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);
    return d;
  }
  const 글들 = (d: ReturnType<typeof 만들기>, 태그: string) => {
    const e = findAll(d.구역들[0]!.root, 태그)[0];
    return e ? findAll(e, 'hp:t').map(textOf).join('') : undefined;
  };

  it('머리말 글이 들어간다', () => {
    expect(글들(만들기({ header_text: '행복한 학교' }), 'hp:header')).toBe('행복한 학교');
  });

  it('꼬리말 글이 들어간다', () => {
    expect(글들(만들기({ footer_text: '한빛초등학교' }), 'hp:footer')).toBe('한빛초등학교');
  });

  it('둘 다 한 번에 들어간다', () => {
    const d = 만들기({ header_text: '위', footer_text: '아래' });
    expect(글들(d, 'hp:header')).toBe('위');
    expect(글들(d, 'hp:footer')).toBe('아래');
  });

  it('**안 주면 안 만든다** (빈 머리말이 생기면 안 된다)', () => {
    const d = 만들기({});
    expect(findAll(d.구역들[0]!.root, 'hp:header').length).toBe(0);
    expect(findAll(d.구역들[0]!.root, 'hp:footer').length).toBe(0);
  });

  it('**남의 글이 딸려 오지 않는다** — 조각은 기준 파일에서 떴다', () => {
    const d = 만들기({ header_text: '위' });
    expect(글들(d, 'hp:header')).not.toContain('HEADER-REF-TEXT');
  });

  it('하나만 만든다 (구역에 머리말이 둘이면 한글이 헷갈린다)', () => {
    const d = 만들기({ header_text: '위' });
    expect(findAll(d.구역들[0]!.root, 'hp:header').length).toBe(1);
  });
});

describe('표 캡션', () => {
  /**
   * 실측: 문서 161편 가운데 8편(5%)이 표에 캡션을 단다.
   * `hp:caption` 은 `hp:tbl` **안**에 살고 자식 순서가 정해져 있다 —
   * 아무 데나 붙이면 한글이 그 뒤를 무시한다.
   */
  function 표만들기(b: Record<string, unknown>) {
    const d = 문서.새로();
    d.ID매기기();
    const r = 조판(d, [{ kind: 'table', rows: [['가', '나']], ...b } as never]);
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);
    return d.구역들[0]!.표들[0]!;
  }

  it('캡션 글이 표 안에 들어간다', () => {
    const t = 표만들기({ caption: '< 사업비 구분 >' });
    const cap = findAll(t, 'hp:caption')[0];
    expect(cap).toBeDefined();
    expect(findAll(cap!, 'hp:t').map(textOf).join('')).toBe('< 사업비 구분 >');
  });

  it('자리를 고를 수 있다', () => {
    expect(getAttr(findAll(표만들기({ caption: '가', caption_side: 'bottom' }), 'hp:caption')[0]!, 'side'))
      .toBe('BOTTOM');
  });

  it('기본은 위다', () => {
    expect(getAttr(findAll(표만들기({ caption: '가' }), 'hp:caption')[0]!, 'side')).toBe('TOP');
  });

  it('**자식 순서가 규격대로다** (아무 데나 붙이면 한글이 뒤를 무시한다)', () => {
    const t = 표만들기({ caption: '가' });
    const 이름들 = t.children.filter((c) => c.kind === 'element').map((c) => (c as { name: string }).name);
    const i = 이름들.indexOf('hp:caption');
    expect(i).toBeGreaterThan(-1);
    // caption 은 outMargin 뒤, inMargin·tr 앞
    expect(이름들.slice(0, i)).not.toContain('hp:tr');
    expect(이름들.slice(i)).toContain('hp:tr');
  });

  it('안 주면 안 만든다', () => {
    expect(findAll(표만들기({}), 'hp:caption').length).toBe(0);
  });

  it('표 기하는 그대로다', () => {
    expect(new 표(표만들기({ caption: '가' })).탈만).toEqual([]);
  });
});

describe('칸마다 다른 꾸밈 — 격자를 걷어내고 가로선으로 가른다', () => {
  /**
   * 표 하나에 테두리 하나만 걸면 **격자**가 된다.
   * 사례집 양식은 세로선을 걷어내고 가로선만 남기며, 한 칸만 배경을 깐다.
   * 그건 칸마다 borderFill 이 달라야 나온다 — 이게 없어 양식을 못 만들었다.
   */
  function 표만들기(b: Record<string, unknown>) {
    const d = 새문서();
    const r = 조판(d, [{ kind: 'table', rows: [['가', '나'], ['다', '라']], ...b } as never]);
    expect(r.ok, r.ok ? '' : r.이유).toBe(true);
    return { d, t: new 표(d.구역들[0]!.표들[0]!) };
  }

  /** 그 칸의 borderFill 을 머리글에서 찾아 준다 */
  function 테두리모양(d: 문서, id: string) {
    const bf = findAll(머리(d), 'hh:borderFill')
      .find((e) => getAttr(e, 'id') === id);
    expect(bf, `borderFill id=${id} 이 머리글에 없다`).toBeDefined();
    const 면 = (이름: string) => {
      const b = firstChildNamed(bf!, `hh:${이름}Border`);
      return { 종류: getAttr(b!, 'type'), 굵기: getAttr(b!, 'width'), 색: getAttr(b!, 'color') };
    };
    const 붓통 = firstChildNamed(bf!, 'hc:fillBrush');
    const 붓 = 붓통 ? firstChildNamed(붓통, 'hc:winBrush') : undefined;
    return {
      top: 면('top'), bottom: 면('bottom'), left: 면('left'), right: 면('right'),
      채움: 붓 ? getAttr(붓, 'faceColor') : undefined,
    };
  }

  it("**border_width: 'none' 이면 격자를 안 그린다**", () => {
    // 굵기를 0 으로 준다고 선이 사라지지 않는다 — 가장 가는 0.1mm 로 맞춰져 그대로 그려진다.
    // 실측: border_width: '0 mm' 를 주고도 격자가 그대로 나왔다.
    const { d, t } = 표만들기({ border_width: 'none' });
    const 모양 = 테두리모양(d, t.셀(0, 0)!.테두리!);
    for (const 면 of ['top', 'bottom', 'left', 'right'] as const) {
      expect(모양[면].종류, `${면} 면이 그려지면 격자가 남는다`).toBe('NONE');
    }
  });

  it('**한 칸에만 배경과 아래 선을 준다**', () => {
    const { d, t } = 표만들기({
      border_width: 'none',
      cells: [{ row: 0, col: 0, background: '#F2F5F9', bottom: '0.4 mm #2A5DA8' }],
    });
    const 꾸민것 = 테두리모양(d, t.셀(0, 0)!.테두리!);
    expect(꾸민것.채움).toBe('#F2F5F9');
    expect(꾸민것.bottom).toEqual({ 종류: 'SOLID', 굵기: '0.4 mm', 색: '#2A5DA8' });
    expect(꾸민것.top.종류, '준 적 없는 면까지 그리면 안 된다').toBe('NONE');

    // 옆 칸은 안 물든다
    const 옆칸 = 테두리모양(d, t.셀(0, 1)!.테두리!);
    expect(옆칸.채움).toBeUndefined();
    expect(옆칸.bottom.종류).toBe('NONE');
  });

  it('row 만 주면 그 줄 전체, col 만 주면 그 열 전체', () => {
    const { d, t } = 표만들기({
      border_width: 'none',
      cells: [{ row: 0, background: '#EEEEEE' }, { col: 1, right: '0.1 mm #D89A22' }],
    });
    expect(테두리모양(d, t.셀(0, 0)!.테두리!).채움).toBe('#EEEEEE');
    expect(테두리모양(d, t.셀(0, 1)!.테두리!).채움).toBe('#EEEEEE');
    expect(테두리모양(d, t.셀(1, 0)!.테두리!).채움).toBeUndefined();
    expect(테두리모양(d, t.셀(1, 1)!.테두리!).right.색).toBe('#D89A22');
    expect(테두리모양(d, t.셀(1, 0)!.테두리!).right.종류).toBe('NONE');
  });

  it('**나중에 적은 것이 앞의 것을 덮는다**', () => {
    const { d, t } = 표만들기({
      border_width: 'none',
      cells: [{ row: 0, background: '#EEEEEE' }, { row: 0, col: 1, background: '#D89A22' }],
    });
    expect(테두리모양(d, t.셀(0, 0)!.테두리!).채움).toBe('#EEEEEE');
    expect(테두리모양(d, t.셀(0, 1)!.테두리!).채움).toBe('#D89A22');
  });

  it('**굵기 0 도 선 없음이다** — 0 은 가장 가는 선으로 올라간다', () => {
    // 실측: border_width: '0 mm' 를 주고도 격자가 그대로 나왔다.
    // 한글은 굵기 0 을 0.1mm 로 맞춰 그린다 — 지우려면 종류가 NONE 이어야 한다.
    for (const 값 of ['0 mm', '0']) {
      const { d, t } = 표만들기({ border_width: 값 });
      const 모양 = 테두리모양(d, t.셀(0, 0)!.테두리!);
      expect(모양.left.종류, `border_width: '${값}' 인데 선이 남았다`).toBe('NONE');
    }
  });

  it('**면에 none 을 주면 그 면만 걷힌다** — 굵기만 0 으로 두면 남는다', () => {
    // 격자는 그대로 두고 한 칸의 오른쪽만 지우는 경우.
    const { d, t } = 표만들기({ cells: [{ row: 0, col: 0, right: 'none' }] });
    const 모양 = 테두리모양(d, t.셀(0, 0)!.테두리!);
    expect(모양.right.종류, '굵기만 0 이면 한글이 0.1mm 로 그린다').toBe('NONE');
    expect(모양.left.종류, '건드리지 않은 면은 그대로여야 한다').toBe('SOLID');
  });

  it('undefined 를 적은 자리는 앞의 것을 안 지운다', () => {
    // 부르는 쪽에서 변수를 넘기면 값이 없을 때 자리만 남는다.
    // 그걸 그대로 덮으면 줄 꾸밈이 지워진다.
    const 없음 = undefined as string | undefined;
    const { d, t } = 표만들기({
      border_width: 'none',
      cells: [{ row: 0, background: '#EEEEEE' }, { row: 0, col: 1, background: 없음 }],
    });
    expect(테두리모양(d, t.셀(0, 1)!.테두리!).채움).toBe('#EEEEEE');
  });

  it('세로 정렬을 칸마다 준다', () => {
    const { t } = 표만들기({ cells: [{ row: 0, col: 0, valign: 'top' }] });
    expect(t.셀(0, 0)!.세로정렬).toBe('TOP');
    expect(t.셀(0, 1)!.세로정렬).toBe('CENTER');
  });
});

describe('칸 안에서 줄을 바꾸고 굵게 쓴다', () => {
  /**
   * 글자 칸(hp:t)에 \n 을 그대로 넣으면 한글이 줄을 안 바꾼다 —
   * 칸 안에서 줄을 바꾸려면 문단(hp:p)이 여럿이어야 한다.
   * 지도안 표는 한 칸이 여러 줄이고 그 안에서 머리말만 굵다.
   */
  function 첫칸(값: string) {
    const d = 새문서();
    꺼내기(조판(d, [{ kind: 'table', rows: [[값, '옆']] }]));
    const t = new 표(d.구역들[0]!.표들[0]!);
    return { d, 셀: t.셀(0, 0)! };
  }

  it('**\n 이 문단으로 갈라진다**', () => {
    const { 셀 } = 첫칸('첫째 줄\n둘째 줄\n셋째 줄');
    const 문단들 = childrenNamed(firstChildNamed(셀.el, 'hp:subList')!, 'hp:p');
    expect(문단들.length, '한 문단에 몰아 넣으면 한글이 줄을 안 바꾼다').toBe(3);
    expect(문단들.map((p) => findAll(p, 'hp:t').map(textOf).join('')))
      .toEqual(['첫째 줄', '둘째 줄', '셋째 줄']);
  });

  it('**칸 안에서도 굵게 표시가 풀린다**', () => {
    const { d, 셀 } = 첫칸('☑ **함께 정하기**');
    const 런들 = findAll(셀.el, 'hp:run');
    expect(런들.length, '굵은 어구가 런으로 안 갈라지면 표시가 글자로 남는다')
      .toBeGreaterThan(1);
    expect(런들.map((r) => findAll(r, 'hp:t').map(textOf).join('')).join(''))
      .toBe('☑ 함께 정하기');
    // 표시가 글자로 새면 안 된다
    expect(findAll(셀.el, 'hp:t').map(textOf).join('')).not.toContain('**');

    const 굵은것 = findAll(머리(d), 'hh:charPr')
      .filter((e) => firstChildNamed(e, 'hh:bold') !== undefined)
      .map((e) => getAttr(e, 'id'));
    const 런서식 = 런들.map((r) => getAttr(r, 'charPrIDRef'));
    expect(런서식.some((id) => 굵은것.includes(id!))).toBe(true);
  });
});
