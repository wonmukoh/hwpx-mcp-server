/**
 * **2026-09-27 전면 검토에서 나온 것들** — 결과가 거짓말하거나 막다른 길로 보내던 자리.
 *
 * 검토자 셋(처음 쓰는 사람 · 코드 감사 · 도구 설명 대조)이 따로 찾은 것을 여기 모았다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findAll } from '@hwpx/owpml';
import { 도구부르기, 도구들, 문서방 } from '../src/index.js';

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

describe('replace 는 어구를 하나씩 세고, 빈칸 종류를 안 가린다', () => {
  it('**limit: 1 이면 하나만 바꾼다** — 한 글자 칸에 세 번 들어 있어도', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'body', text: '교육 교육 교육' }]);
    const id = await 문단(방, doc_id, '교육');
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'replace', id, find: '교육', replace: '敎育', limit: 1 }] }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    const 글 = (await 도구부르기('get_content', { doc_id, id }, 방)).structuredContent!['text'] as string;
    expect(글.split('敎育').length - 1).toBe(1);
    expect(글.split('교육').length - 1).toBe(2);
  });

  it('**전각 빈칸이 든 어구를 보통 빈칸으로 쳐도 바꾼다** — find 와 같은 잣대', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'body', text: '학생\u3000등하교 지도' }]);
    const f = await 도구부르기('find', { doc_id, text: '학생 등하교' }, 방);
    expect((f.structuredContent!['matches'] as unknown[]).length).toBeGreaterThan(0);
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'replace', find: '학생 등하교', replace: '학생 통학' }] }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
  });
});

describe('「이미 그랬다」는 0 이지 실패가 아니다 — 서식 op 도', () => {
  it('**이미 굵은 칸에 굵게를 줘도 뒤 고침이 들어간다**', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'body', text: '앞 문단' }, { kind: 'body', text: '뒤 문단' }]);
    const 앞 = await 문단(방, doc_id, '앞 문단');
    const 뒤 = await 문단(방, doc_id, '뒤 문단');
    const r = await 도구부르기('edit', { doc_id, edits: [
      { op: 'set_style', id: 앞, bold: true },
      { op: 'set_style', id: 앞, bold: true },          // 이미 굵다
      { op: 'set_style', id: 앞, align: 'center' },
      { op: 'set_style', id: 앞, align: 'center' },     // 이미 가운데
      { op: 'set_text', id: 뒤, text: '뒤 문단 고침' },
    ] }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    const 결과 = r.structuredContent!['results'] as { changed: number }[];
    expect(결과[1]!.changed).toBe(0);
    expect(결과[3]!.changed).toBe(0);
    expect(결과[4]!.changed).toBe(1);
  });
});

describe('틀린 서식 값은 문서에 들어가기 전에 거절한다', () => {
  for (const [무엇, 값] of [
    ['음수 크기', { size: -3 }],
    ['색 이름', { color: 'red' }],
    ['모르는 강조점', { emphasis: 'WHATEVER' }],
    ['색 이름 든 테두리', { border: '1 mm red' }],
  ] as const) {
    it(`**${무엇}** → 거절하고, 앞 고침 수(done)를 말한다`, async () => {
      const { 방, doc_id } = await 새문서([{ kind: 'body', text: '글' }]);
      const id = await 문단(방, doc_id, '글');
      const r = await 도구부르기('edit', { doc_id, edits: [
        { op: 'set_text', id, text: '글 고침' },
        { op: 'set_style', id, ...값 },
      ] }, 방);
      expect(r.isError).toBe(true);
      expect(r.structuredContent!['done'], '몇 개가 들어갔는지 알려야 다시 부를 자리를 안다').toBe(1);
    });
  }
});

describe('실패 결과도 outputSchema 의 required 를 지킨다', () => {
  /**
   * 공식 SDK Client 는 isError 결과라도 structuredContent 를 outputSchema 로 검증하고,
   * 안 맞으면 예외를 던진다. 그러면 reason·how 가 통째로 사라진다.
   */
  const 모자란것 = (이름: string, 값: Record<string, unknown>) => {
    const t = 도구들.find((x) => x.name === 이름)!;
    const 필수 = ((t.outputSchema as { required?: string[] } | undefined)?.required) ?? [];
    return 필수.filter((k) => !(k in 값));
  };

  it.each([
    ['find', { doc_id: 'doc_없음', text: '가' }],
    ['get_outline', { doc_id: 'doc_없음' }],
    ['get_content', { doc_id: 'doc_없음', id: 'p_없음' }],
    ['edit', { doc_id: 'doc_없음', edits: [] }],
    ['compose', { doc_id: 'doc_없음', blocks: [] }],
  ] as const)('%s 가 실패해도 필수 필드를 다 싣는다', async (이름, 인자) => {
    const 방 = new 문서방();
    const r = await 도구부르기(이름, 인자 as Record<string, unknown>, 방);
    expect(r.isError).toBe(true);
    expect(모자란것(이름, r.structuredContent ?? {})).toEqual([]);
    expect(r.structuredContent!['reason'], 'Draftsmith 가 reason 을 읽는다').toBeTypeOf('string');
  });
});

describe('render_html 은 있는 파일을 묻지 않고 덮어쓰지 않는다', () => {
  it('**원본 .hwpx 자리에는 안 쓰고, 있는 .html 은 overwrite 없이 안 덮는다**', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'body', text: '글' }]);
    const 자리 = fs.mkdtempSync(path.join(os.tmpdir(), 'hwpx-render-'));
    const 원본 = path.join(자리, '원본.hwpx');
    fs.writeFileSync(원본, 'PK-원본');
    const r1 = await 도구부르기('render_html', { doc_id, path: 원본 }, 방);
    expect(r1.isError).toBe(true);
    expect(fs.readFileSync(원본, 'utf8'), '원본이 덮이면 안 된다').toBe('PK-원본');

    const html = path.join(자리, '미리보기.html');
    fs.writeFileSync(html, '옛것');
    const r2 = await 도구부르기('render_html', { doc_id, path: html }, 방);
    expect(r2.isError).toBe(true);
    expect(fs.readFileSync(html, 'utf8')).toBe('옛것');
    const r3 = await 도구부르기('render_html', { doc_id, path: html, overwrite: true }, 방);
    expect(r3.isError, r3.content[0]?.text).toBeUndefined();
  });

  it('**읽기만 하는 도구라고 말하지 않는다**', () => {
    const t = 도구들.find((x) => x.name === 'render_html')!;
    expect(t.annotations?.readOnlyHint).not.toBe(true);
  });
});

describe('주·메모는 한 번씩, 문서 차례대로', () => {
  it('**표 칸 안의 각주·메모가 get_content 에 두 번 안 나온다**', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'body', text: '앞 본문' }, { kind: 'table', rows: [['칸 글']] }]);
    const 칸문단 = await 문단(방, doc_id, '칸 글');
    await 도구부르기('edit', { doc_id, edits: [
      { op: 'insert_note', id: 칸문단, text: '칸 안 각주' },
      { op: 'insert_memo', id: 칸문단, find: '칸 글', text: '칸 안 메모' },
    ] }, 방);
    const 전체 = (await 도구부르기('get_content', { doc_id }, 방)).structuredContent!;
    expect((전체['notes'] as unknown[]).length).toBe(1);
    expect((전체['memos'] as unknown[]).length).toBe(1);
  });

  it('**나중에 앞쪽에 단 각주가 1번이 된다** — 넣은 차례가 아니라 문서 차례', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'body', text: '첫 문단' }, { kind: 'body', text: '둘째 문단' }]);
    const 첫 = await 문단(방, doc_id, '첫 문단');
    const 둘 = await 문단(방, doc_id, '둘째 문단');
    await 도구부르기('edit', { doc_id, edits: [{ op: 'insert_note', id: 둘, text: '뒤쪽 주' }] }, 방);
    const 첫문단 = await 문단(방, doc_id, '첫 문단');
    void 첫;
    await 도구부르기('edit', { doc_id, edits: [{ op: 'insert_note', id: 첫문단, text: '앞쪽 주' }] }, 방);
    const 주들 = (await 도구부르기('get_content', { doc_id }, 방)).structuredContent!['notes'] as { number: string; text: string }[];
    const 번호 = Object.fromEntries(주들.map((x) => [x.text, x.number]));
    expect(번호['앞쪽 주']).toBe('1');
    expect(번호['뒤쪽 주']).toBe('2');
  });

  it('**문단 끝에 둘째 주를 달면 첫째 주 뒤로 간다**', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'body', text: '한 문단' }]);
    const id = await 문단(방, doc_id, '한 문단');
    await 도구부르기('edit', { doc_id, edits: [{ op: 'insert_note', id, text: '첫째' }] }, 방);
    const id2 = await 문단(방, doc_id, '한 문단');
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'insert_note', id: id2, text: '둘째' }] }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    const 주들 = (await 도구부르기('get_content', { doc_id }, 방)).structuredContent!['notes'] as { number: string; text: string }[];
    expect(주들.map((x) => `${x.number}:${x.text}`)).toEqual(['1:첫째', '2:둘째']);
  });
});

describe('compose 가 중간에 멈추면 그 블록은 하나도 안 남긴다', () => {
  it('**개조식 셋째 항목에서 멈추면 앞 두 항목도 안 남고, done 과 앞 블록 ID 를 준다**', async () => {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방)).structuredContent!['doc_id'] as string;
    const r = await 도구부르기('compose', { doc_id, blocks: [
      { kind: 'title', text: '운동회 계획' },
      { kind: 'outline', items: [{ level: 1, text: '목적' }, { level: 2, text: '협동심' }, { level: 2, text: '**닫지 않은 굵게' }] },
    ] }, 방);
    expect(r.isError).toBe(true);
    expect(r.structuredContent!['done']).toBe(1);
    expect((r.structuredContent!['created'] as unknown[]).length).toBe(1);
    const 글 = (await 도구부르기('get_content', { doc_id }, 방)).structuredContent!['text'] as string;
    expect(글).toContain('운동회 계획');
    expect(글, '실패한 블록의 앞 항목이 남으면 다시 보낼 때 두 번 들어간다').not.toContain('목적');
  });
});

describe('칸을 넣어도 있던 칸의 비율이 남는다', () => {
  it('**좁은 연번 칸은 좁게, 넓은 내용 칸은 넓게 남는다**', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'table', rows: [['1', '내용', '비고']], widths: [20, 120, 40] }]);
    const 표 = ((await 도구부르기('get_outline', { doc_id }, 방)).structuredContent!['items'] as { id: string; kind: string }[])
      .find((x) => x.kind === 'table')!.id;
    const d = 방.꺼내기(doc_id)!.d;
    const 폭 = () => { const t = d.찾기(표); if (!t.ok || t.value.갈래 !== '표') throw 0; return t.value.표.열폭 as number[]; };
    const 전 = 폭();
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'insert_col', id: 표, at: 3 }] }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    const 뒤 = 폭();
    expect(뒤.length).toBe(4);
    expect(뒤.reduce((a, b) => a + b, 0), '표 전체 폭은 그대로').toBe(전.reduce((a, b) => a + b, 0));
    expect(뒤[0]! < 뒤[2]! && 뒤[2]! < 뒤[1]!, `비율이 뒤집혔다: ${전} → ${뒤}`).toBe(true);
    expect(Math.abs(뒤[1]! / 뒤[0]! - 전[1]! / 전[0]!), '연번:내용 비율').toBeLessThan(0.2);
  });
});

describe('compose 의 칸·도형·캡션·머리말 글도 탭·줄 나눔을 개체로 쓴다', () => {
  it('**날 탭·날 줄바꿈 글자가 글자 칸에 남지 않는다**', async () => {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방)).structuredContent!['doc_id'] as string;
    const r = await 도구부르기('compose', { doc_id, header_text: '머리\t말', blocks: [
      { kind: 'table', caption: '표\t1', rows: [['가\t나', '첫\u3000둘']] },
      { kind: 'shape', text: '상자\t글\n둘째 줄' },
    ] }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    const d = 방.꺼내기(doc_id)!.d;
    const 날것 = d.구역들.flatMap((s) => findAll(s.root, 'hp:t'))
      .filter((t) => t.children.some((c) => c.kind === 'text' && /[\t\n\u3000\u00a0]/.test(c.raw)));
    expect(날것.length, '날 글자로 남은 글자 칸').toBe(0);
  });
});

describe('빠진 것의 옛 ID 는 죽는다', () => {
  it('**붙여서 흡수된 표의 ID 로는 아무것도 못 한다** — 「바뀌었다」고 하지 않는다', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'table', rows: [['가', '나']] }, { kind: 'table', rows: [['다', '라']] }]);
    const 표들 = ((await 도구부르기('get_outline', { doc_id }, 방)).structuredContent!['items'] as { id: string; kind: string }[])
      .filter((x) => x.kind === 'table').map((x) => x.id);
    await 도구부르기('edit', { doc_id, edits: [{ op: 'join_tables', id: 표들[0], with_id: 표들[1] }] }, 방);
    expect((await 도구부르기('get_content', { doc_id, id: 표들[1] }, 방)).isError).toBe(true);
    expect((await 도구부르기('edit', { doc_id, edits: [{ op: 'delete_table', id: 표들[1] }] }, 방)).isError).toBe(true);
  });
});

describe('말해야 할 것을 말한다', () => {
  it('**render_html 이 못 그린 링크·메모를 not_rendered 로 알린다**', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'body', text: '누리집을 참고하세요.' }]);
    const id = await 문단(방, doc_id, '누리집');
    await 도구부르기('edit', { doc_id, edits: [
      { op: 'set_link', id, find: '누리집', url: 'https://example.com' },
      { op: 'insert_memo', id, find: '참고', text: '확인' },
    ] }, 방);
    const r = await 도구부르기('render_html', { doc_id }, 방);
    const 못 = r.structuredContent!['not_rendered'] as string[];
    expect(못.some((x) => x.startsWith('링크'))).toBe(true);
    expect(못).toContain('메모');
  });

  it('**.hwpx 가 아닌 이름으로는 저장하지 않는다**', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'body', text: '글' }]);
    const 자리 = fs.mkdtempSync(path.join(os.tmpdir(), 'hwpx-ext-'));
    const r = await 도구부르기('save_document', { doc_id, path: path.join(자리, '문서.hwp') }, 방);
    expect(r.isError).toBe(true);
    expect(fs.existsSync(path.join(자리, '문서.hwp'))).toBe(false);
  });

  it('**구역이 여럿이면 get_outline 이 구역 수를 말한다**', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'body', text: '가' }, { kind: 'section_break' }, { kind: 'body', text: '나' }]);
    const r = await 도구부르기('get_outline', { doc_id }, 방);
    expect(r.structuredContent!['sections']).toBe(2);
    expect(r.content[0]?.text).toContain('구역이 2개');
  });
});
