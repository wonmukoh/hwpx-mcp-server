/**
 * **한글의 글 내보내기와 대 보고 나온 것들** (2026-10-07).
 *
 * 표본 35편을 한글로 열어 글만 뽑고(`SaveAs …, "UNICODE"`), 우리 `get_content` 와
 * 한 글자씩 견줬다. 한글은 정답지다 — 사람이 보는 글이 그것이다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { 도구부르기, 문서방 } from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');
const 덧말파일 = path.join(뿌리, '자료', '기준파일', 'ref-dutmal.hwpx');

async function 열기(파일: string) {
  const 방 = new 문서방();
  const r = await 도구부르기('open_document', { path: 파일 }, 방);
  expect(r.isError, r.content[0]?.text).toBeUndefined();
  return { 방, doc_id: r.structuredContent!['doc_id'] as string };
}

async function 덧말문단(방: 문서방, doc_id: string): Promise<string> {
  const r = await 도구부르기('find', { doc_id, text: 'DUTMAL-REF-TEXT', kind: 'paragraph' }, 방);
  const 찾은것 = r.structuredContent!['matches'] as { id: string }[];
  expect(찾은것.length, '덧말 단 낱말을 find 가 못 찾는다').toBe(1);
  return 찾은것[0]!.id;
}

describe('덧말 단 낱말이 본문에서 빠지지 않는다', () => {
  it('**get_content 에 덧말 본문이 나온다** — 위의 작은 글(subText)은 안 섞는다', async () => {
    const { 방, doc_id } = await 열기(덧말파일);
    const 글 = (await 도구부르기('get_content', { doc_id }, 방)).structuredContent!['text'] as string;
    expect(글).toContain('DUTMAL-REF-TEXT');
    expect(글).not.toContain('DUTMAL-TOP');
  });

  it('**덧말 뒤에 글을 붙여도 덧말이 남는다** — 저장하고 다시 열어도', async () => {
    const { 방, doc_id } = await 열기(덧말파일);
    const id = await 덧말문단(방, doc_id);
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'set_text', id, text: 'DUTMAL-REF-TEXT 뒤에 붙임' }] }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();

    const 자리 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), '덧말-')), '뒤.hwpx');
    await 도구부르기('save_document', { doc_id, path: 자리 }, 방);
    const 다시 = await 열기(자리);
    const 글 = (await 도구부르기('get_content', { doc_id: 다시.doc_id }, 다시.방)).structuredContent!['text'] as string;
    expect(글).toBe('DUTMAL-REF-TEXT 뒤에 붙임');
  });

  it('**덧말 앞에 글을 넣으면 덧말 앞에 들어간다** — 받아 줄 글자 칸이 없어도', async () => {
    const { 방, doc_id } = await 열기(덧말파일);
    const id = await 덧말문단(방, doc_id);
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'set_text', id, text: '앞에 넣음 DUTMAL-REF-TEXT' }] }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    const 글 = (await 도구부르기('get_content', { doc_id, id }, 방)).structuredContent!['text'] as string;
    expect(글).toBe('앞에 넣음 DUTMAL-REF-TEXT');
  });

  it('**덧말 글을 고치려 하면 거절하고 까닭을 댄다** — 말없이 엉뚱한 칸을 고치지 않는다', async () => {
    const { 방, doc_id } = await 열기(덧말파일);
    const id = await 덧말문단(방, doc_id);
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'set_text', id, text: 'DUTMAL-REF-XXXX' }] }, 방);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('덧말');
    const 글 = (await 도구부르기('get_content', { doc_id, id }, 방)).structuredContent!['text'] as string;
    expect(글).toBe('DUTMAL-REF-TEXT');
  });

  it('**덧말 앞뒤를 한꺼번에 고쳐도 된다** — 고친 곳을 따로 가르니 덧말은 안 걸린다', async () => {
    const { 방, doc_id } = await 열기(덧말파일);
    const id = await 덧말문단(방, doc_id);
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'set_text', id, text: '가 DUTMAL-REF-TEXT 나' }] }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    const 자리 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), '덧말-')), '둘.hwpx');
    await 도구부르기('save_document', { doc_id, path: 자리 }, 방);
    const 다시 = await 열기(자리);
    const 글 = (await 도구부르기('get_content', { doc_id: 다시.doc_id }, 다시.방)).structuredContent!['text'] as string;
    expect(글).toBe('가 DUTMAL-REF-TEXT 나');
  });
});

const 보도자료 = path.join(뿌리, '자료', '표본', '공개', '교육부-2026대학혁신지원사업-보도자료.hwpx');
const 업무계획 = path.join(뿌리, '자료', '표본', '공개', '교육부-2026업무계획.hwpx');

async function 문단찾기(방: 문서방, doc_id: string, 글: string): Promise<string> {
  const r = await 도구부르기('find', { doc_id, text: 글, kind: 'paragraph' }, 방);
  return (r.structuredContent!['matches'] as { id: string }[])[0]!.id;
}

describe('한글이 저절로 붙이는 번호·글머리표를 알려 준다', () => {
  it('**뼈대와 칸 읽기가 번호·글머리표를 알려 준다** — 한글 내보내기와 같은 표지', async () => {
    const { 방, doc_id } = await 열기(보도자료);
    const 뼈 = (await 도구부르기('get_outline', { doc_id, limit: 2000, in_tables: true }, 방)).structuredContent!;
    const 칸 = (뼈['items'] as { id: string; numbered_lines?: number }[]).filter((x) => x.numbered_lines);
    expect(칸.map((x) => x.numbered_lines)).toEqual([3]);
    const 읽은것 = (await 도구부르기('get_content', { doc_id, id: 칸[0]!.id }, 방)).structuredContent!;
    const 줄들 = 읽은것['paragraphs'] as { text: string; numbering?: string }[];
    expect(줄들.map((x) => x.numbering)).toEqual(['-', '-', '-']);
    expect(줄들[0]!.text).toContain('미래 인재 양성');
    // 글에는 안 든다 — 되읽은 글을 그대로 되써도 번호가 두 번 안 붙는다
    expect(줄들[0]!.text.startsWith('-')).toBe(false);
  });

  it('**문단 get_content 가 numbering 을 주고, 문서 get_content 는 몇 개인지 말한다**', async () => {
    const { 방, doc_id } = await 열기(업무계획);
    const id = await 문단찾기(방, doc_id, '교육을 둘러싼 환경 변화에 적극 대응');
    const r = (await 도구부르기('get_content', { doc_id, id }, 방)).structuredContent!;
    expect(r['numbering']).toBe('1.');
    expect(String(r['text']).startsWith('1.')).toBe(false);
    const 온 = await 도구부르기('get_content', { doc_id }, 방);
    expect(온.structuredContent!['numbered_paragraphs']).toBe(1);
    expect(온.content[0]?.text).toContain('numbering');
  });

  it('**번호가 붙는 문단에 번호를 또 쓰면 note 로 알린다** — 고치기는 한다', async () => {
    const { 방, doc_id } = await 열기(업무계획);
    const id = await 문단찾기(방, doc_id, '교육을 둘러싼 환경 변화에 적극 대응');
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'set_text', id, text: '1. 환경 변화 대응' }] }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    const 결과 = (r.structuredContent!['results'] as { note?: string }[])[0]!;
    expect(결과.note).toContain('「1.」');
    expect(r.content[0]?.text).toContain('알아 둘 것');
  });

  it('번호를 빼고 쓰면 아무 말도 안 한다 — 「목 적」·「3.1절」은 번호로 안 친다', async () => {
    const { 방, doc_id } = await 열기(업무계획);
    const id = await 문단찾기(방, doc_id, '교육을 둘러싼 환경 변화에 적극 대응');
    for (const 글 of ['환경 변화 대응', '목 적', '3.1절 기념 행사']) {
      const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'set_text', id, text: 글 }] }, 방);
      expect((r.structuredContent!['results'] as { note?: string }[])[0]!.note, 글).toBeUndefined();
    }
  });

  it('글머리표 문단에 같은 글머리표를 또 쓰면 알린다', async () => {
    const { 방, doc_id } = await 열기(보도자료);
    const id = await 문단찾기(방, doc_id, '지방 주도 성장의 기반이 되는');
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'set_text', id, text: '- 지방 주도 성장 지원' }] }, 방);
    expect((r.structuredContent!['results'] as { note?: string }[])[0]!.note).toContain('「-」');
  });
});

describe('set_text 는 다 할 수 있을 때만 고친다', () => {
  it('**한 곳이 덧말에 걸리면 다른 곳도 안 고친다** — 반쯤 고치고 거절하지 않는다', async () => {
    const { 방, doc_id } = await 열기(덧말파일);
    const id = await 덧말문단(방, doc_id);
    // 앞 곳은 덧말 안(D→X, 못 함), 뒤 곳은 끝에 덧붙임(할 수 있음). 둘은 멀리 떨어져 따로 간다.
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'set_text', id, text: 'XUTMAL-REF-TEXT 끝' }] }, 방);
    expect(r.isError).toBe(true);
    const 글 = (await 도구부르기('get_content', { doc_id, id }, 방)).structuredContent!['text'] as string;
    expect(글).toBe('DUTMAL-REF-TEXT');
  });
});
