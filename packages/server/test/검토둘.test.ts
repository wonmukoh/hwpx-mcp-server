/**
 * **2026-10-07 검토에서 나온 것들** — 처음 쓰는 교사처럼 일을 시켜 본 검토자와,
 * 이상한 입력을 두드려 본 검토자가 따로 찾은 것.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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

describe('묶음 가운데 op 이 던져도 어디까지 됐는지 말한다', () => {
  it('**앞 고침이 들어갔으면 done 이 그 수다** — 「터졌다, done: 0」이 아니다', async () => {
    const { 방, doc_id, id } = await 한문단('처음 글');
    const r = await 도구부르기('edit', {
      doc_id,
      edits: [{ op: 'set_text', id, text: '고친 글' }, { op: 'set_style', id, background: 'banana' }],
    }, 방);
    expect(r.isError).toBe(true);
    expect(r.structuredContent!['done']).toBe(1);
    expect(r.content[0]?.text).toContain('2번째');
    expect(await 글(방, doc_id, id)).toBe('고친 글');
  });
});

describe('잃은 서식을 버리지 않고 말한다', () => {
  it('**서식이 다른 낱말들에 걸쳐 고치면 note 가 몇 가지가 합쳐졌는지 말한다**', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'body', text: '앞 **굵은 낱말** 뒤' }]);
    const id = await 문단(방, doc_id, '굵은');
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'set_text', id, text: '완전히 다른 글이다' }] }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    const 결과 = (r.structuredContent!['results'] as { note?: string }[])[0]!;
    expect(결과.note).toContain('합쳐졌다');
  });
});

describe('입구에서 막는다 — 어느 인자든', () => {
  it('**글꼴 이름·링크 주소에 든 제어문자를 거절한다** — 깨진 XML 을 저장하지 않는다', async () => {
    const { 방, doc_id, id } = await 한문단('글');
    for (const 고침 of [
      { op: 'set_style', id, font: 'a\u0001b' },
      { op: 'set_link', id, find: '글', url: 'https://a\u0000b' },
      { op: 'set_bookmark', id, name: 'a\u0001b' },
    ]) {
      const r = await 도구부르기('edit', { doc_id, edits: [고침] }, 방);
      expect(r.isError, JSON.stringify(고침)).toBe(true);
      expect(r.content[0]?.text).toContain('U+000');
    }
    const c = await 도구부르기('compose', { doc_id, blocks: [{ kind: 'body', text: '가' }], body_font: 'x\u0002' }, 방);
    expect(c.isError).toBe(true);
  });

  it('짝 없는 대리 글자를 거절한다 (말없이 U+FFFD 로 바뀌던 것)', async () => {
    const { 방, doc_id, id } = await 한문단('글');
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'set_text', id, text: '가\uD800나' }] }, 방);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('짝 없는');
  });

  it('**인자 이름이 __proto__·constructor 여도 터지지 않고 모르는 인자라 한다**', async () => {
    const { 방, doc_id } = await 한문단('글');
    const 인자 = JSON.parse(`{"doc_id":"${doc_id}","constructor":1,"__proto__":{"x":1}}`) as Record<string, unknown>;
    const r = await 도구부르기('get_outline', 인자, 방);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('모르는 인자');
  });

  it('범위 밖 수를 거절한다 — limit 0, 그림 너비 음수, 단 간격, 끝없는 수', async () => {
    const { 방, doc_id, id } = await 한문단('굵게 굵게');
    for (const [도구, 인자] of [
      ['edit', { doc_id, edits: [{ op: 'replace', id, find: '굵게', replace: '가', limit: 0 }] }],
      ['get_outline', { doc_id, limit: -1 }],
      ['edit', { doc_id, edits: [{ op: 'set_columns', id, count: 2, gap: 1e12 }] }],
      ['edit', { doc_id, edits: [{ op: 'set_style', id, size: Infinity }] }],
      ['compose', { doc_id, blocks: [{ kind: 'body', text: '가', size: -5 }] }],
      ['compose', { doc_id, blocks: [{ kind: 'body', text: '가' }], letter_spacing: -1000 }],
    ] as const) {
      const r = await 도구부르기(도구, 인자 as Record<string, unknown>, 방);
      expect(r.isError, `${도구} ${JSON.stringify(인자)}`).toBe(true);
    }
  });

  it('find 의 빈 글을 거절한다', async () => {
    const { 방, doc_id } = await 한문단('글');
    expect((await 도구부르기('find', { doc_id, text: '' }, 방)).isError).toBe(true);
  });

  it('**compose 의 틀린 색은 짜기 전에 막는다** — 아무것도 안 들어가고 done 0', async () => {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방)).structuredContent!['doc_id'] as string;
    const r = await 도구부르기('compose', { doc_id, blocks: [
      { kind: 'heading', text: '첫 절' },
      { kind: 'body', text: '본문 하나' },
      { kind: 'band', text: '띠', background: 'red' },
    ] }, 방);
    expect(r.isError).toBe(true);
    expect(r.structuredContent!['done']).toBe(0);
    expect(r.content[0]?.text).toContain('blocks[2].background');
    const 글 = (await 도구부르기('get_content', { doc_id }, 방)).structuredContent!['text'] as string;
    expect(글).not.toContain('띠');
  });
});

describe('큰 표에서도 멈추지 않는다', () => {
  it('**줄 3000개 표를 짜고 줄을 넣고 저장해도 몇 초 안이다** — 전에는 표 검사가 (줄×칸)² 이었다', async () => {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방)).structuredContent!['doc_id'] as string;
    const 시작 = Date.now();
    const r = await 도구부르기('compose', { doc_id, blocks: [{ kind: 'table', headers: ['가', '나', '다', '라', '마', '바'],
      rows: Array.from({ length: 3000 }, () => ['1', '2', '3', '4', '5', '6']) }] }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    const tbl = ((r.structuredContent!['created'] as { ids: string[] }[])[0]!.ids).find((x) => x.startsWith('tbl_'))!;
    await 도구부르기('edit', { doc_id, edits: [{ op: 'insert_row', id: tbl, count: 1000 }] }, 방);
    expect(Date.now() - 시작).toBeLessThan(20_000);
  }, 60_000);

  it('쓸 일 없는 크기는 입구에서 막는다 — 칸 하나를 500×500 으로 나누기', async () => {
    const { 방, doc_id } = await 새문서([{ kind: 'table', headers: ['가', '나'], rows: [['1', '2']] }]);
    const 칸 = ((await 도구부르기('find', { doc_id, kind: 'cell' }, 방)).structuredContent!['matches'] as { id: string }[])[0]!.id;
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'split_cell', id: 칸, rows: 500, cols: 500 }] }, 방);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('100 이하');
  });
});

describe('compose 값을 짜기 전에 본다', () => {
  for (const [무엇, 블록] of [
    ['shape 테두리 색 이름', { kind: 'shape', text: '가', border_color: 'blue' }],
    ['shape 배경 색 이름', { kind: 'shape', text: '가', background: 'yellow' }],
    ['표 밖 칸 꾸밈', { kind: 'table', rows: [['1', '2']], cells: [{ row: 9, col: 9, background: '#FFFFFF' }] }],
    ['칸 선 꼴', { kind: 'table', rows: [['1', '2']], cells: [{ row: 0, top: 'thick red' }] }],
    ['개조식 수준 9', { kind: 'outline', items: [{ text: '가', level: 9 }] }],
  ] as const) {
    it(`**${무엇}** 은 거절한다`, async () => {
      const 방 = new 문서방();
      const doc_id = (await 도구부르기('create_document', {}, 방)).structuredContent!['doc_id'] as string;
      const r = await 도구부르기('compose', { doc_id, blocks: [블록] }, 방);
      expect(r.isError, JSON.stringify(블록)).toBe(true);
    });
  }
});

describe('find 가 어디서 찾았는지 말한다', () => {
  it('**머리말 안 문단에 in_header 를 붙인다**', async () => {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방)).structuredContent!['doc_id'] as string;
    await 도구부르기('compose', { doc_id, blocks: [{ kind: 'body', text: '본문 글' }], header_text: '머리말 글' }, 방);
    const r = await 도구부르기('find', { doc_id, text: '머리말 글', kind: 'paragraph' }, 방);
    const 찾은것 = r.structuredContent!['matches'] as { in_header?: string }[];
    expect(찾은것[0]!.in_header).toBe('header');
    const 본 = (await 도구부르기('find', { doc_id, text: '본문 글', kind: 'paragraph' }, 방)).structuredContent!['matches'] as { in_header?: string }[];
    expect(본[0]!.in_header).toBeUndefined();
  });
});

describe('고장 내보기가 짚은 빈자리', () => {
  it('**끝없는 수는 범위 위가 없는 인자로도 못 들어온다** (limit: Infinity)', async () => {
    const { 방, doc_id } = await 한문단('글');
    const r = await 도구부르기('find', { doc_id, text: '글', limit: Infinity }, 방);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('끝이 있는');
  });

  it('**크기 0 인 그림은 거절한다** — 받으면 너비·높이가 NaN', async () => {
    const { 방, doc_id, id } = await 한문단('글');
    // 0×0 PNG — 머리(IHDR)만 있으면 크기는 읽힌다
    const 머리 = Buffer.alloc(13);
    머리[8] = 8; 머리[9] = 2;
    const 토막 = (종류: string, 몸: Buffer) => {
      const 길이 = Buffer.alloc(4); 길이.writeUInt32BE(몸.length);
      return Buffer.concat([길이, Buffer.from(종류, 'latin1'), 몸, Buffer.alloc(4)]);
    };
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      토막('IHDR', 머리), 토막('IEND', Buffer.alloc(0))]);
    const 자리 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), '빈그림-')), '빈.png');
    fs.writeFileSync(자리, png);
    const r = await 도구부르기('edit', { doc_id, edits: [{ op: 'insert_image', id, path: 자리, width: 50 }] }, 방);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('0×0');
  });
});
