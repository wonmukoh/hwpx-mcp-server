/**
 * **학교 양식 함정 넷 — 도구 표면으로** (2026-10-22 가산점 신청서).
 *
 * 문서 층 시험(`packages/doc/test/양식함정.test.ts`)은 문서 층만 지킨다. 모델은 도구로 걷는다 —
 * set_text·set_style·set_table 이 그 고침을 실제로 부르는지, get_content 로 확인할 길이 있는지 본다.
 */

import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { findAll, childrenNamed, firstChildNamed, getAttr, parseXml, type ElementNode } from '@hwpx/owpml';
import { 도구부르기, 문서방 } from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');
const 기준 = (이름: string) => path.join(뿌리, '자료', '기준파일', 이름);

async function 열기(이름: string) {
  const 방 = new 문서방();
  const r = await 도구부르기('open_document', { path: 기준(이름) }, 방);
  expect(r.isError, r.content[0]?.text).toBeUndefined();
  const doc_id = r.structuredContent!['doc_id'] as string;
  return { 방, doc_id, d: 방.꺼내기(doc_id)!.d };
}

async function 고치기(방: 문서방, doc_id: string, edits: unknown[]) {
  const r = await 도구부르기('edit', { doc_id, edits }, 방);
  expect(r.isError, r.content[0]?.text).toBeUndefined();
  return r.structuredContent!['results'] as { changed: number }[];
}

async function 표아이디들(방: 문서방, doc_id: string): Promise<string[]> {
  const r = await 도구부르기('get_outline', { doc_id }, 방);
  return (r.structuredContent!['items'] as { id: string; kind: string }[])
    .filter((x) => x.kind === 'table').map((x) => x.id);
}

const 붙든문단 = (el: ElementNode) => {
  let 위 = el.parent as ElementNode | undefined;
  while (위 && 위.name !== 'hp:p') 위 = 위.parent as ElementNode | undefined;
  return 위!;
};

describe('set_table page_break — 한글의 이름과 짝이 맞는다', () => {
  it('**split 은 CELL(나눔), cell 은 TABLE(셀 단위로 나눔)로 들어간다**', async () => {
    for (const [값, 적힘] of [['split', 'CELL'], ['cell', 'TABLE'], ['none', 'NONE']]) {
      const { 방, doc_id, d } = await 열기('ref-table-pagebreak.hwpx');
      const [첫] = await 표아이디들(방, doc_id);
      await 고치기(방, doc_id, [{ op: 'set_table', id: 첫, page_break: 값 }]);
      expect(getAttr(d.구역들[0]!.표들[0]!, 'pageBreak'), 값).toBe(적힘);
    }
  });

  it('**한글이 만든 표 셋을 none · cell · split 으로 읽는다** (COM PageBreak 0·1·2)', async () => {
    const { 방, doc_id } = await 열기('ref-table-pagebreak.hwpx');
    const 읽은것 = [];
    for (const id of await 표아이디들(방, doc_id)) {
      읽은것.push((await 도구부르기('get_content', { doc_id, id }, 방)).structuredContent!['page_break']);
    }
    expect(읽은것).toEqual(['none', 'cell', 'split']);
  });
});

describe('set_table treat_as_char — 글자처럼 취급을 끈다', () => {
  it('**get_content 가 treat_as_char 를 낸다** — 써 놓고 확인할 길이 있어야 한다', async () => {
    const { 방, doc_id } = await 열기('ref-table-pagebreak.hwpx');
    const 읽은것 = [];
    for (const id of await 표아이디들(방, doc_id)) {
      읽은것.push((await 도구부르기('get_content', { doc_id, id }, 방)).structuredContent!['treat_as_char']);
    }
    expect(읽은것).toEqual([true, false, false]);
  });

  it('**끄면 pos 가 0 이 되고 표를 붙든 문단의 줄 정보가 사라진다**', async () => {
    const { 방, doc_id, d } = await 열기('ref-table-pagebreak.hwpx');
    const [첫] = await 표아이디들(방, doc_id);
    const 표el = d.구역들[0]!.표들[0]!;
    expect(childrenNamed(붙든문단(표el), 'hp:linesegarray').length, '기준 파일에 줄 정보가 있어야 뜻이 있다').toBe(1);
    const [결과] = await 고치기(방, doc_id, [{ op: 'set_table', id: 첫, treat_as_char: false, page_break: 'split' }]);
    expect(결과!.changed).toBeGreaterThan(0);
    expect(getAttr(firstChildNamed(표el, 'hp:pos')!, 'treatAsChar')).toBe('0');
    expect(childrenNamed(붙든문단(표el), 'hp:linesegarray').length).toBe(0);
    expect((await 도구부르기('get_content', { doc_id, id: 첫 }, 방)).structuredContent!['treat_as_char']).toBe(false);
  });

  it('이미 꺼진 표에 또 주면 실패가 아니라 **0** 이다', async () => {
    const { 방, doc_id } = await 열기('ref-table-pagebreak.hwpx');
    const [, 둘째] = await 표아이디들(방, doc_id);
    const [결과] = await 고치기(방, doc_id, [{ op: 'set_table', id: 둘째, treat_as_char: false }]);
    expect(결과!.changed).toBe(0);
  });

  it('아무것도 안 주면 셋을 다 짚어 거절한다', async () => {
    const { 방, doc_id } = await 열기('ref-table-pagebreak.hwpx');
    const [첫] = await 표아이디들(방, doc_id);
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'set_table', id: 첫 }] }, 방);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('treat_as_char');
  });
});

describe('칸에 set_text · set_style — 칸의 문단 전부', () => {
  async function 칸셋() {
    const { 방, doc_id, d } = await 열기('ref-table-nested.hwpx');
    const [첫] = await 표아이디들(방, doc_id);
    const 칸 = `cell_${첫!.slice('tbl_'.length)}_0_1`;
    const 칸글 = await 도구부르기('get_content', { doc_id, id: 칸 }, 방);
    expect(칸글.isError, `칸 ID 꼴을 잘못 짐작했다: ${칸글.content[0]?.text}`).toBeUndefined();
    const 문단들 = () => {
      const r = d.칸문단들(칸);
      if (!r.ok) throw new Error(r.이유);
      return r.value;
    };
    return { 방, doc_id, d, 칸, 문단들 };
  }
  const 높이 = (d: { 머리: { toXml(): string } }, 런: ElementNode) => {
    const 머리 = parseXml(d.머리.toXml()).root;
    return getAttr(findAll(머리, 'hh:charPr').find((x) => getAttr(x, 'id') === getAttr(런, 'charPrIDRef'))!, 'height');
  };

  it('**set_style size 가 칸의 문단 셋에 다 먹는다**', async () => {
    const { 방, doc_id, d, 칸, 문단들 } = await 칸셋();
    expect(문단들().length).toBe(3);
    await 고치기(방, doc_id, [{ op: 'set_style', id: 칸, size: 13 }]);
    for (const 런 of 문단들().flatMap((p) => p.런들)) expect(높이(d, 런)).toBe('1300');
  });

  it('**set_style align 도 칸의 문단 전부에**', async () => {
    const { 방, doc_id, d, 칸, 문단들 } = await 칸셋();
    await 고치기(방, doc_id, [{ op: 'set_style', id: 칸, align: 'center' }]);
    const 머리 = parseXml(d.머리.toXml()).root;
    for (const p of 문단들()) {
      const pp = findAll(머리, 'hh:paraPr').find((x) => getAttr(x, 'id') === p.문단모양)!;
      expect(getAttr(firstChildNamed(pp, 'hh:align')!, 'horizontal')).toBe('CENTER');
    }
  });

  it('**set_text 로 빈 문단을 채워도 줄 정보가 안 남고 빈 런 서식을 잇는다**', async () => {
    const { 방, doc_id, 칸, 문단들 } = await 칸셋();
    const 가운데서식 = getAttr(childrenNamed(문단들()[1]!.el, 'hp:run')[0]!, 'charPrIDRef');
    await 고치기(방, doc_id, [{ op: 'set_text', id: 칸, text: `첫 줄\n${'가운데 줄에 길게 들어가는 글 '.repeat(6)}\n끝 줄` }]);
    for (const p of 문단들()) expect(childrenNamed(p.el, 'hp:linesegarray').length).toBe(0);
    expect(childrenNamed(문단들()[1]!.el, 'hp:run').map((r) => getAttr(r, 'charPrIDRef'))).toEqual([가운데서식]);
  });
});
