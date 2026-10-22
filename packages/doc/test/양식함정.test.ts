/**
 * **학교 양식을 채우다 한글에서만 드러난 것들** (2026-10-22 가산점 신청서 세 편).
 *
 * 넷 다 저장·규격 검사는 초록이었고, 한글로 PDF 를 떠 봐야 보였다.
 *
 *   1. 원래 빈 문단에 글을 넣으면 낡은 줄 정보가 남아 글자가 한 줄에 겹친다
 *   2. (표.test.ts) 쪽 넘김 「나눔」이 「셀 단위로 나눔」으로 들어갔다
 *   3. 칸 ID 에 서식을 주면 첫 문단에만 먹고, 빈 문단의 글은 charPr 0 으로 찍혔다
 *   4. 글자처럼 취급하는 표는 쪽을 못 넘기는데 끌 길이 없었다
 *
 * 한글이 고친 것을 어떻게 그리는지는 `검증/양식함정.mjs` 가 한글 PDF 로 잰다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findAll, childrenNamed, firstChildNamed, getAttr, parseXml, pt, serializeNode, type ElementNode } from '@hwpx/owpml';
import { HwpxContainer, 부품 } from '@hwpx/container';
import { 문서, 표, 꺼내기 } from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');
const 기준파일 = path.join(뿌리, '자료', '기준파일');

function 열기(이름: string): 문서 {
  const d = 문서.열기(fs.readFileSync(path.join(기준파일, 이름)));
  d.ID매기기();
  return d;
}

const 줄정보수 = (p: ElementNode) => childrenNamed(p, 'hp:linesegarray').length;
const 런서식들 = (p: ElementNode) => childrenNamed(p, 'hp:run').map((r) => getAttr(r, 'charPrIDRef'));

/**
 * 한글이 남긴 빈 문단 — `<hp:run charPrIDRef="N"/>` 하나에 한 줄짜리 줄 정보.
 * 기준 파일에서는 ref-table-nested 의 칸 안에 열 개가 있다 (서식이 0 이 아닌 것도).
 */
function 한글빈문단들(d: 문서) {
  return d.구역들[0]!.모든문단들.filter((p) => {
    const 런 = childrenNamed(p.el, 'hp:run');
    return 런.length === 1 && 런[0]!.children.every((c) => c.kind !== 'element') && 줄정보수(p.el) === 1;
  });
}

describe('1 — 원래 빈 문단에 글을 넣으면 줄 정보를 지운다', () => {
  it('ref-table-nested 에 한글이 남긴 빈 문단이 있다 (이 시험이 뜻이 있으려면)', () => {
    const 것 = 한글빈문단들(열기('ref-table-nested.hwpx'));
    expect(것.length).toBeGreaterThan(0);
    // 빈 런의 서식이 0 이 아니어야 「charPr 0 으로 찍혔다」를 가를 수 있다
    expect(것.some((p) => 런서식들(p.el)[0] !== '0')).toBe(true);
  });

  it('**빈 문단에 여러 줄 글을 넣으면 줄 정보가 사라진다** — 남으면 한 줄에 겹쳐 그린다', () => {
    const d = 열기('ref-table-nested.hwpx');
    for (const p of 한글빈문단들(d)) {
      꺼내기(d.글바꾸기(d.이름표.아이디(p.el), '아주 긴 줄이다. '.repeat(12) + '\n줄 나눔 뒤 둘째 줄'));
      expect(줄정보수(p.el), '빈 줄 하나로 잰 줄 정보가 남았다').toBe(0);
    }
  });

  it('**빈 런의 서식을 잇는다** — charPr 0 런을 새로 내지 않는다', () => {
    const d = 열기('ref-table-nested.hwpx');
    for (const p of 한글빈문단들(d)) {
      const 서식 = 런서식들(p.el)[0];
      꺼내기(d.글바꾸기(d.이름표.아이디(p.el), '새 글'));
      expect(런서식들(p.el), '글이 든 런은 한글이 남긴 그 런 하나다').toEqual([서식]);
      expect(p.글).toBe('새 글');
    }
  });

  it('빈 문단에 빈 글을 주면 **0 곳**이고 아무것도 안 건드린다', () => {
    const d = 열기('ref-table-nested.hwpx');
    const p = 한글빈문단들(d)[0]!;
    const r = 꺼내기(d.글바꾸기(d.이름표.아이디(p.el), ''));
    expect(r.바뀐수).toBe(0);
    expect(줄정보수(p.el)).toBe(1);
    expect(childrenNamed(childrenNamed(p.el, 'hp:run')[0]!, 'hp:t').length).toBe(0);
  });

  it('**칸에 여러 줄을 넣으면 고친 문단마다 줄 정보가 없다** — 원래 비었든 아니든', () => {
    const d = 열기('ref-table-nested.hwpx');
    const t = d.구역들[0]!.표들[0]!;
    const 칸 = d.셀아이디(d.이름표.아이디(t), 0, 1);
    const 문단들 = 꺼내기(d.칸문단들(칸));
    expect(문단들.map((p) => p.비었나), '가운데 문단이 한글이 남긴 빈 문단이다').toEqual([false, true, false]);
    꺼내기(d.칸글바꾸기(칸, ['첫 줄을 길게 '.repeat(8), '가운데 빈 줄에 넣는 글 '.repeat(8), '끝 줄', '넘친 줄'].join('\n')));
    for (const p of 꺼내기(d.칸문단들(칸))) expect(줄정보수(p.el)).toBe(0);
  });

  it('칸의 빈 문단에 든 글은 **그 문단의 빈 런 서식**이다', () => {
    const d = 열기('ref-table-nested.hwpx');
    const t = d.구역들[0]!.표들[0]!;
    const 칸 = d.셀아이디(d.이름표.아이디(t), 0, 1);
    const 가운데 = 꺼내기(d.칸문단들(칸))[1]!;
    const 서식 = 런서식들(가운데.el)[0];
    expect(서식, '빈 런 서식이 0 이면 이 시험이 아무것도 못 가른다').not.toBe('0');
    꺼내기(d.칸글바꾸기(칸, '가\n나\n다'));
    expect(런서식들(가운데.el)).toEqual([서식]);
  });

  it('**저장하고 다시 열어도** 빈 런이 글을 품고 있다 (스스로 닫힌 런을 다시 쓴다)', () => {
    const d = 열기('ref-table-nested.hwpx');
    const p = 한글빈문단들(d)[0]!;
    const 서식 = 런서식들(p.el)[0];
    꺼내기(d.글바꾸기(d.이름표.아이디(p.el), '다시 열어 볼 글'));
    const 다시 = 문서.열기(d.저장());
    const 찾은 = 다시.구역들[0]!.모든문단들.find((x) => x.글 === '다시 열어 볼 글');
    expect(찾은, '저장한 파일에 글이 없다').toBeDefined();
    expect(런서식들(찾은!.el)).toEqual([서식]);
  });
});

describe('3 — 칸 ID 에 서식을 주면 칸의 문단 전부·런 전부에 먹는다', () => {
  function 칸셋() {
    const d = 열기('ref-table-nested.hwpx');
    const t = d.구역들[0]!.표들[0]!;
    const 칸 = d.셀아이디(d.이름표.아이디(t), 0, 1);
    return { d, 칸 };
  }
  const 크기 = (d: 문서, 런: ElementNode) => {
    const 머리 = parseXml(d.머리.toXml()).root;
    const cp = findAll(머리, 'hh:charPr').find((x) => getAttr(x, 'id') === getAttr(런, 'charPrIDRef'))!;
    return getAttr(cp, 'height');
  };

  it('**문단이 셋인 칸에 크기를 주면 셋 다 커진다** — 빈 문단의 빈 런까지', () => {
    const { d, 칸 } = 칸셋();
    꺼내기(d.글자서식주기(칸, { 크기: pt(13) }));
    const 런들 = 꺼내기(d.칸문단들(칸)).flatMap((p) => p.런들);
    expect(런들.length).toBeGreaterThan(2);
    for (const 런 of 런들) expect(크기(d, 런), '첫 문단만 먹으면 나머지는 옛 크기다').toBe('1300');
  });

  it('**런마다 제 서식에 얹는다** — 크기만 바꾸랬는데 다른 런의 모양으로 합치지 않는다', () => {
    const { d, 칸 } = 칸셋();
    const 전 = 꺼내기(d.칸문단들(칸)).flatMap((p) => 런서식들(p.el));
    expect(new Set(전).size, '런 서식이 여럿이어야 이 시험이 뭔가를 본다').toBeGreaterThan(1);
    꺼내기(d.글자서식주기(칸, { 크기: pt(13) }));
    const 뒤 = 꺼내기(d.칸문단들(칸)).flatMap((p) => 런서식들(p.el));
    expect(new Set(뒤).size, '서로 다르던 런이 한 서식으로 합쳐졌다').toBe(new Set(전).size);
  });

  it('**한 문단 안 서로 다른 런도 제 모양을 지킨다** — 크기만 바뀌고 굵기·글꼴은 그대로', () => {
    const d = 열기('ref-table-nested.hwpx');
    // 런마다 「크기 말고 나머지」 지문 — 크기만 다르던 두 런은 크기를 맞추면 한 모양이 되는 게 맞다
    const 크기뺀모양들 = (런들: ElementNode[]) => {
      const xml = d.머리.toXml();
      const 것들 = findAll(parseXml(xml).root, 'hh:charPr');
      return 런들.map((런) => serializeNode(것들.find((x) => getAttr(x, 'id') === getAttr(런, 'charPrIDRef'))!, xml)
        .replace(/ id="\d+"/, '').replace(/ height="\d+"/, ''));
    };
    const p = d.구역들[0]!.모든문단들.find((x) => x.글.trim() !== '' && new Set(크기뺀모양들(x.런들)).size > 1);
    expect(p, '크기 말고도 모양이 다른 런이 둘 넘는 문단이 있어야 이 시험이 뭔가를 본다').toBeDefined();
    const 전 = 크기뺀모양들(p!.런들);
    꺼내기(d.글자서식주기(d.이름표.아이디(p!.el), { 크기: pt(13) }));
    for (const 런 of p!.런들) expect(크기(d, 런)).toBe('1300');
    expect(크기뺀모양들(p!.런들), '첫 런의 굵기·글꼴로 덮였다').toEqual(전);
  });

  it('같은 크기를 또 주면 **0 곳**이다', () => {
    const { d, 칸 } = 칸셋();
    꺼내기(d.글자서식주기(칸, { 크기: pt(13) }));
    expect(꺼내기(d.글자서식주기(칸, { 크기: pt(13) })).바뀐수).toBe(0);
  });

  it('**정렬도 칸의 문단 전부에 준다**', () => {
    const { d, 칸 } = 칸셋();
    꺼내기(d.문단서식주기(칸, { 정렬: 'RIGHT' }));
    const 머리 = parseXml(d.머리.toXml()).root;
    for (const p of 꺼내기(d.칸문단들(칸))) {
      const pp = findAll(머리, 'hh:paraPr').find((x) => getAttr(x, 'id') === p.문단모양)!;
      expect(getAttr(firstChildNamed(pp, 'hh:align')!, 'horizontal')).toBe('RIGHT');
    }
  });

  it('**서식을 준 빈 문단에 글을 넣으면 그 서식으로 찍힌다** — 차례가 서식 → 글이어도', () => {
    const { d, 칸 } = 칸셋();
    꺼내기(d.글자서식주기(칸, { 크기: pt(13) }));
    꺼내기(d.칸글바꾸기(칸, '가\n나\n다'));
    for (const 런 of 꺼내기(d.칸문단들(칸)).flatMap((p) => p.런들)) expect(크기(d, 런)).toBe('1300');
  });
});

describe('4 — 글자처럼 취급을 끈다', () => {
  function 표셋() {
    const d = 열기('ref-table-pagebreak.hwpx');
    const 표들 = d.구역들[0]!.표들.map((el) => new 표(el, d.구역들[0]!.source));
    return { d, 표들 };
  }
  const 붙든문단 = (t: 표) => {
    let 위 = t.el.parent as ElementNode | undefined;
    while (위 && 위.name !== 'hp:p') 위 = 위.parent as ElementNode | undefined;
    return 위!;
  };

  it('한글이 만든 기준 파일 — 첫 표만 켜져 있고 그 문단에 줄 정보가 있다 (이 시험이 뜻이 있으려면)', () => {
    const { 표들 } = 표셋();
    expect(표들.map((t) => t.글자처럼)).toEqual([true, false, false]);
    expect(줄정보수(붙든문단(표들[0]!))).toBe(1);
  });

  it('**끄면 treatAsChar 가 0 이 되고 표를 붙든 문단의 줄 정보가 사라진다** — 한글이 그렇게 저장한다', () => {
    const { 표들 } = 표셋();
    const t = 표들[0]!;
    expect(꺼내기(t.글자처럼주기(false)).바뀜).toBe(true);
    expect(getAttr(firstChildNamed(t.el, 'hp:pos')!, 'treatAsChar')).toBe('0');
    expect(t.글자처럼).toBe(false);
    expect(줄정보수(붙든문단(t)), '표 높이를 글자 높이로 잰 줄 정보가 남는다').toBe(0);
  });

  it('**pos 의 다른 속성은 안 건드린다** — 한글도 treatAsChar 하나만 바꿨다', () => {
    const { 표들 } = 표셋();
    const pos = firstChildNamed(표들[0]!.el, 'hp:pos')!;
    const 전 = pos.attrs.map((a) => `${a.name}=${a.raw}`).filter((x) => !x.startsWith('treatAsChar'));
    꺼내기(표들[0]!.글자처럼주기(false));
    expect(pos.attrs.map((a) => `${a.name}=${a.raw}`).filter((x) => !x.startsWith('treatAsChar'))).toEqual(전);
  });

  it('이미 꺼진 표를 또 끄면 **안 바뀐다고 하고** 줄 정보도 그대로다', () => {
    const { 표들 } = 표셋();
    const t = 표들[1]!;
    const 앞 = 줄정보수(붙든문단(t));
    expect(꺼내기(t.글자처럼주기(false)).바뀜).toBe(false);
    expect(줄정보수(붙든문단(t))).toBe(앞);
  });

  it('다시 켤 수도 있다', () => {
    const { 표들 } = 표셋();
    const t = 표들[2]!;
    expect(꺼내기(t.글자처럼주기(true)).바뀜).toBe(true);
    expect(t.글자처럼).toBe(true);
  });

  it('**저장하면 파일에 들어 있다**', () => {
    const { d, 표들 } = 표셋();
    꺼내기(표들[0]!.글자처럼주기(false));
    const c = HwpxContainer.open(d.저장());
    const xml = c.readText(c.sectionNames()[0]!);
    const pos = findAll(parseXml(xml).root, 'hp:pos');
    expect(pos.map((x) => getAttr(x, 'treatAsChar')).slice(0, 3)).toEqual(['0', '0', '0']);
    void 부품;
  });
});
