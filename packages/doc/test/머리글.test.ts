/**
 * 3단계 합격 기준을 그대로 시험으로.
 *
 * - 스타일을 100번 줘도 header 가 안 부푼다 (지문 중복 제거)
 * - 여백은 `hp:case` 와 `hp:default` **양쪽에** 들어가고, case 는 절반이다
 * - itemCnt 가 실제 개수와 늘 맞는다
 * - **무동작이 없다** — 못 하면 못 한다고 한다
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HwpxContainer } from '@hwpx/container';
import {
  parseXml, findAll, findFirst, childrenNamed, firstChildNamed, getAttr, pt,
  hwp, type ElementNode,
} from '@hwpx/owpml';
import { 머리글, 색맞추기, 언어들, 꺼내기 } from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');
const 기준파일 = path.join(뿌리, '자료', '기준파일');

function 머리글읽기(이름 = 'ref-blank.hwpx'): { xml: string; h: 머리글 } {
  const c = HwpxContainer.open(fs.readFileSync(path.join(기준파일, 이름)));
  const xml = c.readText('Contents/header.xml');
  return { xml, h: new 머리글(xml) };
}

function 개수(xml: string, 태그: string): number {
  return findAll(parseXml(xml).root, 태그).length;
}

/** paraPr 의 여백을 두 갈래에서 읽는다 */
function 여백읽기(xml: string, paraPrId: string, 태그: string): { case?: number; default?: number } {
  const p = findAll(parseXml(xml).root, 'hh:paraPr').find((x) => getAttr(x, 'id') === paraPrId);
  if (!p) throw new Error(`paraPr#${paraPrId} 가 없다`);
  const sw = firstChildNamed(p, 'hp:switch');
  const 읽기 = (가지: ElementNode | undefined) => {
    if (!가지) return undefined;
    const m = firstChildNamed(가지, 'hh:margin');
    const 칸 = m && firstChildNamed(m, 태그);
    return 칸 ? Number(getAttr(칸, 'value')) : undefined;
  };
  if (!sw) return { default: 읽기(p) };
  return { case: 읽기(firstChildNamed(sw, 'hp:case')), default: 읽기(firstChildNamed(sw, 'hp:default')) };
}

describe('안 고치면 바이트가 같다', () => {
  it('읽고 그대로 쓰면 원본과 같다', () => {
    const { xml, h } = 머리글읽기();
    expect(h.dirty).toBe(false);
    expect(h.toXml()).toBe(xml);
  });

  it('기준 파일 전부', () => {
    for (const f of fs.readdirSync(기준파일).filter((x) => x.endsWith('.hwpx'))) {
      const { xml, h } = 머리글읽기(f);
      expect(h.toXml(), f).toBe(xml);
    }
  });
});

describe('스타일 확보 — 복제해서 고치고, 같은 게 있으면 다시 쓴다', () => {
  it('글자 크기를 바꾸면 새 charPr 이 하나 생긴다', () => {
    const { xml, h } = 머리글읽기();
    const 앞 = 개수(xml, 'hh:charPr');

    const r = 꺼내기(h.charPr확보('0', { 크기: pt(14) }));
    expect(r.새로만듦).toBe(true);
    expect(r.id).not.toBe('0');
    expect(개수(h.toXml(), 'hh:charPr')).toBe(앞 + 1);

    // 만든 것이 정말 14pt 인가
    const 새것 = findAll(parseXml(h.toXml()).root, 'hh:charPr').find((e) => getAttr(e, 'id') === r.id)!;
    expect(getAttr(새것, 'height')).toBe('1400');
  });

  it('**같은 서식을 100번 줘도 charPr 은 하나만 는다**', () => {
    const { xml, h } = 머리글읽기();
    const 앞 = 개수(xml, 'hh:charPr');

    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(꺼내기(h.charPr확보('0', { 크기: pt(14), 굵게: true })).id);
    }
    expect(ids.size).toBe(1);
    expect(개수(h.toXml(), 'hh:charPr')).toBe(앞 + 1);
  });

  it('서로 다른 서식은 따로 는다', () => {
    const { xml, h } = 머리글읽기();
    const 앞 = 개수(xml, 'hh:charPr');
    const a = 꺼내기(h.charPr확보('0', { 크기: pt(12) })).id;
    const b = 꺼내기(h.charPr확보('0', { 크기: pt(14) })).id;
    const c = 꺼내기(h.charPr확보('0', { 크기: pt(14), 굵게: true })).id;
    expect(new Set([a, b, c]).size).toBe(3);
    expect(개수(h.toXml(), 'hh:charPr')).toBe(앞 + 3);
  });

  it('이미 있는 모양을 달라고 하면 있는 것을 준다 (안 만든다)', () => {
    const { xml, h } = 머리글읽기();
    const 앞 = 개수(xml, 'hh:charPr');
    // 0번을 그대로 달라고 한다 → 0번이 나와야 한다
    const r = 꺼내기(h.charPr확보('0', { 크기: pt(10) }));
    expect(r.새로만듦).toBe(false);
    expect(r.id).toBe('0');
    expect(개수(h.toXml(), 'hh:charPr')).toBe(앞);
    expect(h.dirty).toBe(false);
  });

  it('빈 패치는 아무것도 안 만든다', () => {
    const { xml, h } = 머리글읽기();
    const r = 꺼내기(h.charPr확보('0', {}));
    expect(r).toEqual({ id: '0', 새로만듦: false });
    expect(h.toXml()).toBe(xml);
  });
});

describe('굵게는 속성이 아니라 자식 요소다', () => {
  it('굵게를 켜면 hh:bold 자식이 생긴다', () => {
    const { h } = 머리글읽기();
    const id = 꺼내기(h.charPr확보('0', { 굵게: true })).id;
    const el = findAll(parseXml(h.toXml()).root, 'hh:charPr').find((e) => getAttr(e, 'id') === id)!;
    expect(firstChildNamed(el, 'hh:bold')).toBeDefined();
    // 속성으로 쓰면 안 된다
    expect(getAttr(el, 'bold')).toBeUndefined();
  });

  it('굵게를 끄면 hh:bold 자식이 사라진다', () => {
    const { h } = 머리글읽기();
    const 굵은것 = 꺼내기(h.charPr확보('0', { 굵게: true })).id;
    const 안굵은것 = 꺼내기(h.charPr확보(굵은것, { 굵게: false })).id;
    const el = findAll(parseXml(h.toXml()).root, 'hh:charPr').find((e) => getAttr(e, 'id') === 안굵은것)!;
    expect(firstChildNamed(el, 'hh:bold')).toBeUndefined();
  });
});

describe('문단 여백 — hp:case 가 진짜다', () => {
  it('**case 에는 절반, default 에는 그대로** 들어간다', () => {
    const { h } = 머리글읽기();
    const id = 꺼내기(h.paraPr확보('0', { 왼쪽여백: hwp(2000) })).id;
    const 값 = 여백읽기(h.toXml(), id, 'hc:left');
    expect(값.default).toBe(2000);
    expect(값.case).toBe(1000);
  });

  it('홀수는 case 쪽을 내린다 (한글이 그렇게 한다)', () => {
    const { h } = 머리글읽기();
    const id = 꺼내기(h.paraPr확보('0', { 왼쪽여백: hwp(1601) })).id;
    const 값 = 여백읽기(h.toXml(), id, 'hc:left');
    expect(값.default).toBe(1601);
    expect(값.case).toBe(800);
  });

  it('한쪽만 쓰지 않는다 — 다섯 자리 모두', () => {
    const { h } = 머리글읽기();
    const id = 꺼내기(h.paraPr확보('0', {
      왼쪽여백: hwp(1000), 오른쪽여백: hwp(600), 들여쓰기: hwp(400),
      위여백: hwp(300), 아래여백: hwp(200),
    })).id;
    for (const [태그, v] of [['hc:left', 1000], ['hc:right', 600], ['hc:intent', 400], ['hc:prev', 300], ['hc:next', 200]] as const) {
      const 값 = 여백읽기(h.toXml(), id, 태그);
      expect(값.default, 태그).toBe(v);
      expect(값.case, 태그).toBe(Math.floor(v / 2));
    }
  });

  it('백분율 줄간격은 두 갈래가 같다 (길이가 아니니까)', () => {
    const { h } = 머리글읽기();
    const id = 꺼내기(h.paraPr확보('0', { 줄간격: { 종류: 'PERCENT', 값: 200 } })).id;
    const p = findAll(parseXml(h.toXml()).root, 'hh:paraPr').find((x) => getAttr(x, 'id') === id)!;
    const sw = firstChildNamed(p, 'hp:switch')!;
    const 값 = (가지: string) =>
      getAttr(firstChildNamed(firstChildNamed(sw, 가지)!, 'hh:lineSpacing')!, 'value');
    expect(값('hp:case')).toBe('200');
    expect(값('hp:default')).toBe('200');
  });

  it('고정 줄간격은 길이라서 case 가 절반이다', () => {
    const { h } = 머리글읽기();
    const id = 꺼내기(h.paraPr확보('0', { 줄간격: { 종류: 'FIXED', 값: 3560 } })).id;
    const p = findAll(parseXml(h.toXml()).root, 'hh:paraPr').find((x) => getAttr(x, 'id') === id)!;
    const sw = firstChildNamed(p, 'hp:switch')!;
    const 값 = (가지: string) =>
      getAttr(firstChildNamed(firstChildNamed(sw, 가지)!, 'hh:lineSpacing')!, 'value');
    expect(값('hp:case')).toBe('1780');
    expect(값('hp:default')).toBe('3560');
  });

  it('정렬을 바꾼다', () => {
    const { h } = 머리글읽기();
    const id = 꺼내기(h.paraPr확보('0', { 정렬: 'CENTER' })).id;
    const p = findAll(parseXml(h.toXml()).root, 'hh:paraPr').find((x) => getAttr(x, 'id') === id)!;
    expect(getAttr(firstChildNamed(p, 'hh:align')!, 'horizontal')).toBe('CENTER');
  });
});

describe('itemCnt 는 늘 실제 개수와 맞는다', () => {
  it('기준 파일이 처음부터 맞다', () => {
    for (const f of fs.readdirSync(기준파일).filter((x) => x.endsWith('.hwpx'))) {
      const { h } = 머리글읽기(f);
      expect(h.itemCnt검사(), f).toEqual([]);
    }
  });

  it('여러 개 넣어도 맞다', () => {
    const { h } = 머리글읽기();
    for (let i = 8; i < 24; i++) h.charPr확보('0', { 크기: pt(i) });
    for (let i = 0; i < 10; i++) h.paraPr확보('0', { 왼쪽여백: hwp(i * 100) });
    expect(h.itemCnt검사()).toEqual([]);

    // 다시 읽어도 맞다
    expect(new 머리글(h.toXml()).itemCnt검사()).toEqual([]);
  });

  it('검사가 헛돌지 않는다 — 일부러 어긋내면 잡는다', () => {
    const { xml } = 머리글읽기();
    const 망친것 = xml.replace(/<hh:charProperties itemCnt="\d+"/, '<hh:charProperties itemCnt="999"');
    expect(망친것).not.toBe(xml);
    const 탈 = new 머리글(망친것).itemCnt검사();
    expect(탈.length).toBe(1);
    expect(탈[0]).toContain('999');
  });
});

describe('글꼴 등록 — 7개 언어 전부', () => {
  it('없던 글꼴을 넣으면 7개 언어에 다 들어간다', () => {
    const { h } = 머리글읽기();
    expect(h.글꼴있나('맑은 고딕')).toBe(false);
    const r = 꺼내기(h.글꼴확보('맑은 고딕'));
    expect(r.새로만듦).toBe(true);

    const 목 = findFirst(parseXml(h.toXml()).root, 'hh:fontfaces')!;
    for (const 언어 of 언어들) {
      const 무리 = childrenNamed(목, 'hh:fontface').find((f) => getAttr(f, 'lang') === 언어);
      expect(무리, 언어).toBeDefined();
      const 있나 = childrenNamed(무리!, 'hh:font').some((x) => getAttr(x, 'face') === '맑은 고딕');
      expect(있나, 언어).toBe(true);
    }
  });

  it('fontCnt 도 같이 오른다', () => {
    const { xml, h } = 머리글읽기();
    const 앞 = childrenNamed(findFirst(parseXml(xml).root, 'hh:fontfaces')!, 'hh:fontface')
      .map((f) => Number(getAttr(f, 'fontCnt')));
    꺼내기(h.글꼴확보('맑은 고딕'));
    const 뒤 = childrenNamed(findFirst(parseXml(h.toXml()).root, 'hh:fontfaces')!, 'hh:fontface');
    뒤.forEach((f, i) => {
      expect(Number(getAttr(f, 'fontCnt'))).toBe((앞[i] ?? 0) + 1);
      expect(Number(getAttr(f, 'fontCnt'))).toBe(childrenNamed(f, 'hh:font').length);
    });
  });

  it('이미 있는 글꼴은 다시 안 만든다', () => {
    const { xml, h } = 머리글읽기();
    const 있는것 = getAttr(
      childrenNamed(findFirst(parseXml(xml).root, 'hh:fontfaces')!, 'hh:fontface')
        .flatMap((f) => childrenNamed(f, 'hh:font'))[0]!, 'face')!;
    const r = 꺼내기(h.글꼴확보(있는것));
    expect(r.새로만듦).toBe(false);
    expect(h.toXml()).toBe(xml);
  });

  it('글꼴을 주면 charPr 의 fontRef 가 7개 언어 전부 바뀐다', () => {
    const { h } = 머리글읽기();
    const id = 꺼내기(h.charPr확보('0', { 글꼴: '맑은 고딕' })).id;
    const el = findAll(parseXml(h.toXml()).root, 'hh:charPr').find((e) => getAttr(e, 'id') === id)!;
    const ref = firstChildNamed(el, 'hh:fontRef')!;
    const 글꼴id = 꺼내기(new 머리글(h.toXml()).글꼴확보('맑은 고딕')).id;
    for (const 언어 of 언어들) {
      expect(getAttr(ref, 언어.toLowerCase()), 언어).toBe(글꼴id);
    }
  });
});

describe('못 하면 못 한다고 한다 — 무동작이 없다', () => {
  it('없는 바탕 id 를 주면 실패하고, 무엇이 있는지 알려 준다', () => {
    const { h } = 머리글읽기();
    const r = h.charPr확보('9999', { 크기: pt(14) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.이유).toContain('9999');
    expect(r.어떻게).toContain('이 문서에 있는 것');
  });

  it('실패했을 때 문서를 건드리지 않았다', () => {
    const { xml, h } = 머리글읽기();
    h.charPr확보('9999', { 크기: pt(14) });
    expect(h.toXml()).toBe(xml);
    expect(h.dirty).toBe(false);
  });

  it('색이 이상하면 던진다 (조용히 넘어가지 않는다)', () => {
    const { h } = 머리글읽기();
    expect(() => h.charPr확보('0', { 색: '빨강' })).toThrow(/#RRGGBB/);
  });

  it('색을 맞춰 준다', () => {
    expect(색맞추기('1f4e9c')).toBe('#1F4E9C');
    expect(색맞추기('#1F4E9C')).toBe('#1F4E9C');
    expect(색맞추기('none')).toBe('none');
  });
});

describe('자간 · 장평 — 언어 일곱 쪽에 다 걸어야 한다', () => {
  it('자간을 주면 일곱 언어가 다 바뀐다', () => {
    const { h } = 머리글읽기();
    const id = 꺼내기(h.charPr확보('0', { 자간: -6 })).id;
    const el = findAll(parseXml(h.toXml()).root, 'hh:charPr').find((e) => getAttr(e, 'id') === id)!;
    const sp = firstChildNamed(el, 'hh:spacing')!;
    for (const 언어 of 언어들) {
      // 한 언어만 걸면 그 언어 글자만 좁아진다 — 한글·영문이 섞인 줄에서 티가 난다
      expect(getAttr(sp, 언어.toLowerCase()), 언어).toBe('-6');
    }
  });

  it('장평도 일곱 언어에 다 걸린다', () => {
    const { h } = 머리글읽기();
    const id = 꺼내기(h.charPr확보('0', { 장평: 95 })).id;
    const el = findAll(parseXml(h.toXml()).root, 'hh:charPr').find((e) => getAttr(e, 'id') === id)!;
    const rt = firstChildNamed(el, 'hh:ratio')!;
    for (const 언어 of 언어들) expect(getAttr(rt, 언어.toLowerCase()), 언어).toBe('95');
  });

  it('같은 자간을 두 번 줘도 charPr 이 안 는다', () => {
    const { h } = 머리글읽기();
    const 개수 = () => findAll(parseXml(h.toXml()).root, 'hh:charPr').length;
    const a = 꺼내기(h.charPr확보('0', { 자간: -6 })).id;
    const 한번 = 개수();
    const b = 꺼내기(h.charPr확보('0', { 자간: -6 })).id;
    expect(b).toBe(a);
    expect(개수()).toBe(한번);
  });
});
