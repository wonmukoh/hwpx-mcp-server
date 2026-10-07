/**
 * **2026-10-07 검토에서 나온 것들** — 처음 쓰는 교사처럼 일을 시켜 본 검토자와,
 * 이상한 입력을 두드려 본 검토자가 따로 찾은 것.
 */

import { describe, expect, it } from 'vitest';
import { 도구부르기, 문서방 } from '../src/index.js';

async function 새문서(블록들: unknown[]) {
  const 방 = new 문서방();
  const doc_id = (await 도구부르기('create_document', {}, 방)).structuredContent!['doc_id'] as string;
  const 짬 = await 도구부르기('compose', { doc_id, blocks: 블록들 }, 방);
  expect(짬.isError, 짬.content[0]?.text).toBeUndefined();
  return { 방, doc_id };
}

async function 문단(방: 문서방, doc_id: string, 글: string): Promise<string> {
  const r = await 도구부르기('find', { doc_id, text: 글, kind: 'paragraph' }, 방);
  return (r.structuredContent!['matches'] as { id: string }[])[0]!.id;
}

/** 줄 나눔(
)이 든 글은 compose body 가 문단으로 가르니, 문단을 만든 뒤 set_text 로 넣는다 */
async function 한문단(글: string) {
  const { 방, doc_id } = await 새문서([{ kind: 'body', text: '자리' }]);
  const id = await 문단(방, doc_id, '자리');
  const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'set_text', id, text: 글 }] }, 방);
  expect(r.isError, r.content[0]?.text).toBeUndefined();
  return { 방, doc_id, id };
}

async function 글(방: 문서방, doc_id: string, id: string): Promise<string> {
  return (await 도구부르기('get_content', { doc_id, id }, 방)).structuredContent!['text'] as string;
}

describe('빈칸은 종류만 안 가리고 개수는 가린다', () => {
  const 원래 = '1.\t목적　안내  (두 칸)\n둘째 줄 끝';

  it('**「두 칸 → 한 칸」 replace 가 탭·전각 빈칸·줄 나눔을 안 건드린다**', async () => {
    const { 방, doc_id, id } = await 한문단(원래);
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'replace', id, find: '  ', replace: ' ' }] }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    expect(await 글(방, doc_id, id)).toBe('1.\t목적　안내 (두 칸)\n둘째 줄 끝');
    expect((r.structuredContent!['results'] as { changed: number }[])[0]!.changed).toBe(1);
  });

  it('빈칸 하나를 지우면 가로 빈칸만 지워진다 — 탭·줄 나눔은 남는다', async () => {
    const { 방, doc_id, id } = await 한문단('가 나\t다\n라');
    await 도구부르기('edit', { doc_id, edits: [{ op: 'replace', id, find: ' ', replace: '' }] }, 방);
    expect(await 글(방, doc_id, id)).toBe('가나\t다\n라');
  });

  it('**find 는 빈칸 개수를 가린다** — 「(지 면)」이 「(지  면)」에 안 걸린다', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'body', text: '(지  면)' }]);
    const r = await 도구부르기('find', { doc_id, text: '(지 면)' }, 방);
    expect(r.structuredContent?.['count'] ?? 0).toBe(0);
  });

  it('전각 빈칸은 여전히 보통 빈칸으로 찾고 바꾼다', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'body', text: '대학　‧　전문대학' }]);
    const f = await 도구부르기('find', { doc_id, text: '대학 ‧ 전문대학' }, 방);
    expect((f.structuredContent!['matches'] as unknown[]).length).toBe(1);
  });

  it('이미 같은 글로 바꾸는 것은 센 것으로 치지 않는다', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'body', text: '교육 교육' }]);
    const id = await 문단(방, doc_id, '교육');
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'replace', id, find: '교육', replace: '교육' }] }, 방);
    expect((r.structuredContent!['results'] as { changed: number }[])[0]!.changed).toBe(0);
  });
});

describe('find 는 빈칸으로 탭·줄 나눔도 찾고, replace 는 그 자리면 어떻게 하라고 한다', () => {
  it('**replace 가 막다른 길이 아니다** — 탭 자리를 \t 로 적으라고 일러 준다', async () => {
    const { 방, doc_id, id } = await 한문단('1.\t목적');
    const f = await 도구부르기('find', { doc_id, text: '1. 목적' }, 방);
    expect((f.structuredContent!['matches'] as unknown[]).length).toBeGreaterThan(0);
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'replace', id, find: '1. 목적', replace: '1. 목표' }] }, 방);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('\\t(탭)');
    const 됨 = await 도구부르기('edit', { doc_id, edits: [{ op: 'replace', id, find: '1.\t목적', replace: '1.\t목표' }] }, 방);
    expect(됨.isError, 됨.content[0]?.text).toBeUndefined();
  });
});
