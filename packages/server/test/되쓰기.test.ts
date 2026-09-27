/**
 * **읽은 글을 고쳐 되쓸 때 문서의 짜임이 남는가.**
 *
 * 스킬은 「get_content 로 읽고, 바꿀 곳만 바꿔 set_text 로 되써라」고 가르친다.
 * 2026-09-27 검토 셋이 모두 이 길에서 손실을 찾았다 —
 *
 *   - 링크·메모의 시작·끝 표시 사이 글이 첫 칸으로 빠져 **빈 링크**가 됐다
 *   - 문장 가운데 굵은 낱말이 사라졌다 (표본 문단 1191개, 13편이 이 꼴)
 *   - 각주 표시가 어구 뒤에서 문장 끝으로 밀렸다
 *   - 칸에 쓰면 칸 안에 든 **안쪽 표**의 글까지 비웠다 (표본 60곳, 8편)
 *
 * 결과는 늘 「바뀌었다」였다.
 */

import { describe, expect, it } from 'vitest';
import { findAll, childrenNamed, getAttr, 글자칸읽기, type ElementNode } from '@hwpx/owpml';
import { 도구부르기, 문서방 } from '../src/index.js';

function 짜임(p: ElementNode): string {
  return childrenNamed(p, 'hp:run').map((r) => `[${getAttr(r, 'charPrIDRef')}]`
    + r.children.filter((c): c is ElementNode => c.kind === 'element').map((c) =>
      c.name === 'hp:t' ? `«${글자칸읽기(c)}»`
        : c.name === 'hp:ctrl' ? `<${c.children.filter((x): x is ElementNode => x.kind === 'element').map((x) => `${x.name.slice(3)}${getAttr(x, 'type') ? ':' + getAttr(x, 'type') : ''}`).join(',')}>`
          : c.name.slice(3)).join('')).join(' ');
}

async function 새문서(블록들: unknown[]) {
  const 방 = new 문서방();
  const doc_id = (await 도구부르기('create_document', {}, 방)).structuredContent!['doc_id'] as string;
  const 짬 = await 도구부르기('compose', { doc_id, blocks: 블록들 }, 방);
  expect(짬.isError, 짬.content[0]?.text).toBeUndefined();
  return { 방, doc_id, d: 방.꺼내기(doc_id)!.d };
}

async function 찾기(방: 문서방, doc_id: string, 글: string): Promise<string> {
  const r = await 도구부르기('find', { doc_id, text: 글, kind: 'paragraph' }, 방);
  return (r.structuredContent!['matches'] as { id: string }[])[0]!.id;
}

async function 되쓰기(방: 문서방, doc_id: string, id: string, 고침: (글: string) => string) {
  const 읽은것 = (await 도구부르기('get_content', { doc_id, id }, 방)).structuredContent!['text'] as string;
  const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'set_text', id, text: 고침(읽은것) }] }, 방);
  expect(r.isError, r.content[0]?.text).toBeUndefined();
  return r;
}

describe('set_text 는 바뀐 곳만 간다', () => {
  it('**문장 가운데 굵은 낱말이 남는다**', async () => {
    const { 방, doc_id, d } = await 새문서([{ kind: 'body', text: '반드시 **꼭** 참고하세요.' }]);
    const id = await 찾기(방, doc_id, '참고하세요');
    await 되쓰기(방, doc_id, id, (g) => g.replace('참고하세요', '참고하십시오'));
    const p = d.찾기(id);
    if (!p.ok || p.value.갈래 !== '문단') throw new Error('문단이 없다');
    const 굵은칸 = childrenNamed(p.value.문단.el, 'hp:run').filter((r) => childrenNamed(r, 'hp:t').some((t) => 글자칸읽기(t) === '꼭'));
    expect(굵은칸.length, `굵은 「꼭」 이 따로 남아야 한다: ${짜임(p.value.문단.el)}`).toBe(1);
    expect(p.value.문단.글).toContain('참고하십시오');
  });

  it('**링크·메모가 제 글을 그대로 감싼다**', async () => {
    const { 방, doc_id, d } = await 새문서([{ kind: 'body', text: '자세한 내용은 교육부 누리집을 꼭 참고하세요.' }]);
    const id = await 찾기(방, doc_id, '누리집');
    const 건것 = await 도구부르기('edit', { doc_id, edits: [
      { op: 'set_link', id, find: '교육부 누리집', url: 'https://www.moe.go.kr' },
      { op: 'insert_memo', id, find: '참고', text: '문구 확인' },
    ] }, 방);
    expect(건것.isError, 건것.content[0]?.text).toBeUndefined();
    // 짜임을 바꿨으니 ID 를 다시 받는다
    const id2 = await 찾기(방, doc_id, '누리집');
    await 되쓰기(방, doc_id, id2, (g) => g.replace('참고하세요', '참고하십시오'));
    const p = d.찾기(id2);
    if (!p.ok || p.value.갈래 !== '문단') throw new Error('문단이 없다');
    const 꼴 = 짜임(p.value.문단.el);
    expect(꼴, '링크 안에 제 글이 있어야 한다').toMatch(/fieldBegin:HYPERLINK>.*«교육부 누리집».*<fieldEnd>/);
    expect(꼴, '메모 안에 제 글이 있어야 한다').toMatch(/fieldBegin:MEMO.*«참고».*<fieldEnd>/);
    expect(p.value.문단.글).toContain('하십시오');
  });

  it('**통째로 딴 글을 주면 서식을 잃고, 잃은 것을 센다**', async () => {
    const { 방, doc_id, d } = await 새문서([{ kind: 'body', text: '가나 **다라** 마바' }]);
    const id = await 찾기(방, doc_id, '마바');
    const r = d.글바꾸기(id, '전혀 다른 글');
    expect(r.ok && r.value.잃은서식).toBe(1);
    void 방;
  });
});

describe('칸에 쓸 때 칸 안의 안쪽 표를 안 건드린다', () => {
  it('**안쪽 표의 글이 그대로 남는다**', async () => {
    const { 방, doc_id, d } = await 새문서([{ kind: 'table', rows: [['바깥 글']] }]);
    // 바깥 칸 안에 표를 하나 더 넣는다 — 회신서가 이 꼴이다
    const 칸 = ((await 도구부르기('find', { doc_id, text: '바깥 글', kind: 'cell' }, 방))
      .structuredContent!['matches'] as { id: string }[])[0]!.id;
    // 칸에 표를 넣는 op 은 없다 — 다른 문서에서 짠 표를 그 칸 첫 런에 옮겨 단다
    const 짬 = await 새문서([{ kind: 'table', rows: [['안쪽 가', '안쪽 나']] }]);
    const 안표 = findAll(짬.d.구역들[0]!.root, 'hp:tbl')[0]!;
    const 셀 = d.찾기(칸);
    if (!셀.ok || 셀.value.갈래 !== '셀') throw new Error('칸이 없다');
    const 첫문단 = childrenNamed(셀.value.셀.subList, 'hp:p')[0]!;
    const 런 = childrenNamed(첫문단, 'hp:run')[0]!;
    런.children.push(안표);
    안표.parent = 런;
    const 안글 = () => findAll(d.구역들[0]!.root, 'hp:tbl').slice(1)
      .flatMap((t) => findAll(t, 'hp:t')).map((t) => 글자칸읽기(t)).join('|');
    const 전 = 안글();
    expect(전, '안쪽 표가 있어야 이 시험이 뭔가를 본다').toContain('안쪽 가');
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'set_text', id: 칸, text: '새 내용' }] }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    expect(안글(), '안쪽 표 글이 비면 안 된다').toBe(전);
  });
});

describe('표 고침이 글·짜임을 안 잃는다', () => {
  it('**세로 합침 바로 아래·표 맨 뒤에 줄을 넣어도 표가 안 깨진다**', async () => {
    // 예산표 「운영비(세 줄 합침)」 아래에 항목을 더하는 흔한 일이다. 전에는 본뜬 줄에
    // 합침에 덮인 칸이 없어 새 줄도 칸이 모자랐고, 거절하면서 깨진 줄을 남겼다.
    const { 방, doc_id, d } = await 새문서([{
      kind: 'table', rows: [['운영비', '가', '1'], ['', '나', '2'], ['', '다', '3']],
      merges: [{ row: 0, col: 0, rowspan: 3 }],
    }]);
    const 표 = ((await 도구부르기('get_outline', { doc_id }, 방)).structuredContent!['items'] as { id: string; kind: string }[])
      .find((x) => x.kind === 'table')!.id;
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'insert_row', id: 표 }] }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    expect(d.검사(), '표가 깨지면 안 된다').toEqual([]);
    const 칸들 = (await 도구부르기('get_content', { doc_id, id: 표 }, 방)).structuredContent!['cells'] as { row: number }[];
    expect(칸들.filter((c) => c.row === 3).length, '새 줄에 칸이 다 있어야 한다').toBe(3);
  });

  it('**칸을 합치면 덮이는 칸의 글이 합친 칸으로 옮겨 온다**', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'table', rows: [['보도시점', '2025.12.12.(금)']] }]);
    const 칸 = ((await 도구부르기('find', { doc_id, text: '보도시점', kind: 'cell' }, 방))
      .structuredContent!['matches'] as { id: string }[])[0]!.id;
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'merge_cells', id: 칸, colspan: 2 }] }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    const 글 = (await 도구부르기('get_content', { doc_id, id: 칸 }, 방)).structuredContent!['text'] as string;
    expect(글).toContain('보도시점');
    expect(글, '덮인 칸의 날짜가 사라지면 안 된다').toContain('2025.12.12.(금)');
  });

  it('**줄을 넣어도 칸 안 필드가 같은 id 로 복제되지 않는다**', async () => {
    const { 방, doc_id, d } = await 새문서([{ kind: 'table', rows: [['누리집 주소', '값']] }]);
    const 문단 = ((await 도구부르기('find', { doc_id, text: '누리집', kind: 'paragraph' }, 방))
      .structuredContent!['matches'] as { id: string }[])[0]!.id;
    await 도구부르기('edit', { doc_id, edits: [{ op: 'set_link', id: 문단, find: '누리집', url: 'https://example.com' }] }, 방);
    const 표 = ((await 도구부르기('get_outline', { doc_id }, 방)).structuredContent!['items'] as { id: string; kind: string }[])
      .find((x) => x.kind === 'table')!.id;
    await 도구부르기('edit', { doc_id, edits: [{ op: 'insert_row', id: 표, count: 2 }] }, 방);
    const id들 = d.구역들.flatMap((s) => findAll(s.root, 'hp:fieldBegin')).map((f) => getAttr(f, 'id'));
    expect(new Set(id들).size, `필드 id 가 겹친다: ${id들.join(',')}`).toBe(id들.length);
  });
});
