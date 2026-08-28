/**
 * 도구 표면 — **클라이언트가 받아들일 수 있는 모양인가.**
 *
 * Claude·Codex·Gemini 가 JSON Schema 를 받아들이는 범위가 다르다.
 * 넓게 쓰면 어떤 클라이언트에서는 도구가 아예 안 보인다.
 * 그래서 좁혀 두고 **여기서 강제한다** — 규칙을 어기면 빌드가 깨진다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  도구들, 서버이름, 서버판, 판읽기, 놓인자리, 스키마린트, 금지키워드, 최대중첩, 출력최대중첩, 차림표, 도구부르기, 문서방,
  인자검사, 절대경로검사,
} from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');

describe('스키마 린터가 헛돌지 않는다', () => {
  it('금지 키워드를 잡는다', () => {
    for (const 금지 of 금지키워드) {
      const 탈 = 스키마린트({ type: 'object', description: 'x', [금지]: {} });
      expect(탈.some((t) => t.무엇.includes(금지)), 금지).toBe(true);
    }
  });

  it('튜플형 items 를 잡는다', () => {
    const 탈 = 스키마린트({ type: 'array', description: 'x', items: [{ type: 'string' }] });
    expect(탈.some((t) => t.무엇.includes('튜플'))).toBe(true);
  });

  it('숫자 enum 을 잡는다 (모델이 못 외운다)', () => {
    const 탈 = 스키마린트({
      type: 'object', description: 'x',
      properties: { a: { type: 'string', description: 'a', enum: [1, 2] } },
    });
    expect(탈.some((t) => t.무엇.includes('문자열이 아닌'))).toBe(true);
  });

  it('너무 깊은 중첩을 잡는다', () => {
    const 깊은것 = {
      type: 'object', description: '1',
      properties: { a: { type: 'object', description: '2',
        properties: { b: { type: 'object', description: '3',
          properties: { c: { type: 'string', description: '4' } } } } } },
    };
    expect(스키마린트(깊은것).some((t) => t.무엇.includes('중첩'))).toBe(true);
  });

  it('설명 없는 속성을 잡는다', () => {
    const 탈 = 스키마린트({
      type: 'object', description: 'x', properties: { a: { type: 'string' } },
    });
    expect(탈.some((t) => t.무엇.includes('설명'))).toBe(true);
  });

  it('required 에만 있고 properties 에 없는 것을 잡는다', () => {
    const 탈 = 스키마린트({
      type: 'object', description: 'x', properties: {}, required: ['없는것'],
    });
    expect(탈.some((t) => t.무엇.includes('없는것'))).toBe(true);
  });

  it('멀쩡한 스키마는 안 잡는다', () => {
    expect(스키마린트({
      type: 'object', description: 'x',
      properties: { a: { type: 'string', description: 'a' } },
      required: ['a'],
    })).toEqual([]);
  });
});

describe('도구 스키마가 규칙을 지킨다', () => {
  for (const t of 도구들) {
    it(`${t.name} — 입력 스키마`, () => {
      const 최대 = t.중첩예외?.최대 ?? 최대중첩;
      const 탈 = 스키마린트(t.inputSchema).filter((x) => {
        if (!x.무엇.includes('중첩이')) return true;
        const m = /중첩이 (\d+)단계/.exec(x.무엇);
        return !m || Number(m[1]) > 최대;
      });
      if (탈.length) {
        throw new Error(`${t.name}:\n${탈.map((x) => `  ${x.어디}: ${x.무엇}`).join('\n')}`);
      }
    });

    if (t.outputSchema) {
      it(`${t.name} — 출력 스키마`, () => {
        // 출력은 한 단계 더 준다 — 목록-레코드가 본질적으로 4단계다
        const 최대 = Math.max(출력최대중첩, t.중첩예외?.최대 ?? 0);
        const 탈 = 스키마린트(t.outputSchema).filter((x) => {
          if (!x.무엇.includes('중첩이')) return true;
          const m = /중첩이 (\d+)단계/.exec(x.무엇);
          return !m || Number(m[1]) > 최대;
        });
        if (탈.length) {
          throw new Error(`${t.name} 출력:\n${탈.map((x) => `  ${x.어디}: ${x.무엇}`).join('\n')}`);
        }
      });
    }
  }

  it('중첩 예외에는 **왜인지 적혀 있다**', () => {
    for (const t of 도구들) {
      if (!t.중첩예외) continue;
      expect(t.중첩예외.왜.length, t.name).toBeGreaterThan(30);
    }
  });
});

describe('도구 설명은 모델이 읽는 글이다', () => {
  it('언제 쓰는지가 적혀 있다', () => {
    for (const t of 도구들) {
      expect(t.description.length, t.name).toBeGreaterThan(40);
      // 도구 이름만 되풀이하는 설명은 쓸모가 없다
      expect(t.description.toLowerCase().replace(/[^a-z_]/g, ''), t.name).not.toBe(t.name);
    }
  });

  it('이름이 규칙 하나를 따른다 (소문자·밑줄)', () => {
    for (const t of 도구들) expect(t.name, t.name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('30개 안쪽이다', () => {
    expect(도구들.length).toBeLessThanOrEqual(30);
  });

  it('이름이 겹치지 않는다', () => {
    expect(new Set(도구들.map((t) => t.name)).size).toBe(도구들.length);
  });
});

describe('주석이 제대로 붙었다', () => {
  it('읽기 도구에 readOnlyHint 가 있다', () => {
    for (const 이름 of ['get_outline', 'get_content', 'find', 'get_styles', 'list_documents']) {
      const t = 도구들.find((x) => x.name === 이름)!;
      expect(t.annotations?.readOnlyHint, 이름).toBe(true);
    }
  });

  it('덮어쓸 수 있는 도구에 destructiveHint 가 있다', () => {
    expect(도구들.find((t) => t.name === 'save_document')!.annotations?.destructiveHint).toBe(true);
  });

  it('고치는 도구에는 readOnlyHint 를 달지 않는다', () => {
    for (const 이름 of ['compose', 'create_document', 'save_document']) {
      const t = 도구들.find((x) => x.name === 이름)!;
      expect(t.annotations?.readOnlyHint, 이름).not.toBe(true);
    }
  });
});

describe('차림표는 늘 같은 순서다', () => {
  it('두 번 불러도 순서가 같다', () => {
    expect(차림표().map((t) => t.name)).toEqual(차림표().map((t) => t.name));
  });

  it('이름순이다 (캐시가 안 깨지게)', () => {
    const 이름들 = 차림표().map((t) => t.name);
    expect(이름들).toEqual([...이름들].sort());
  });
});

describe('인자 검사는 **쓸 수 있는 값을 알려 준다**', () => {
  const s = {
    type: 'object' as const, description: 'x',
    properties: {
      a: { type: 'string' as const, description: 'a', enum: ['left', 'right'] },
      n: { type: 'integer' as const, description: 'n', minimum: 1 },
    },
    required: ['a'],
  };

  it('없는 필수 인자를 짚는다', () => {
    const 탈 = 인자검사({}, s);
    expect(탈[0]!.어디).toBe('a');
    expect(탈[0]!.무엇).toContain('꼭 있어야');
  });

  it('열거값이 틀리면 **쓸 수 있는 값을 다 적는다**', () => {
    const 탈 = 인자검사({ a: '가운데' }, s);
    expect(탈[0]!.무엇).toContain('left, right');
    expect(탈[0]!.무엇).toContain('가운데');
  });

  it('모르는 인자면 **쓸 수 있는 인자를 적는다**', () => {
    const 탈 = 인자검사({ a: 'left', 엉뚱한것: 1 }, s);
    expect(탈.some((t) => t.무엇.includes('a, n'))).toBe(true);
  });

  it('탈을 **모아서** 준다 (하나씩 말하면 되풀이하게 된다)', () => {
    const 탈 = 인자검사({ n: 0.5, 엉뚱한것: 1 }, s);
    expect(탈.length).toBeGreaterThanOrEqual(3);
  });

  it('멀쩡한 인자는 안 잡는다', () => {
    expect(인자검사({ a: 'left', n: 3 }, s)).toEqual([]);
  });
});

describe('경로는 절대 경로만', () => {
  it('절대 경로를 받는다', () => {
    for (const p of ['C:\\Users\\a\\b.hwpx', 'C:/Users/a/b.hwpx', '/home/a/b.hwpx', '\\\\서버\\몫\\a.hwpx']) {
      expect(절대경로검사(p).ok, p).toBe(true);
    }
  });

  it('상대 경로는 **왜 안 되는지** 말한다', () => {
    const r = 절대경로검사('문서.hwpx');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.어떻게).toContain('작업 폴더');
  });
});

describe('도구를 부른다', () => {
  it('모르는 도구는 있는 것을 알려 준다', async () => {
    const r = await 도구부르기('없는도구', {}, new 문서방());
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain('create_document');
  });

  it('한 바퀴 — 만들고 쓰고 읽는다', async () => {
    const 방 = new 문서방();
    const 만들기 = await 도구부르기('create_document', {}, 방);
    const doc_id = 만들기.structuredContent!['doc_id'] as string;
    expect(doc_id).toMatch(/^doc_/);
    // 첫 손잡이가 번호처럼 보이면 안 된다
    expect(doc_id).not.toBe('doc_000000');

    const 조판 = await 도구부르기('compose', {
      doc_id,
      blocks: [{ kind: 'body', text: '**굵은** 줄' }],
    }, 방);
    expect(조판.isError).toBeUndefined();

    const 뼈대 = await 도구부르기('get_outline', { doc_id }, 방);
    const 것들 = 뼈대.structuredContent!['items'] as { preview: string }[];
    expect(것들.some((x) => x.preview.includes('굵은 줄'))).toBe(true);
  });

  it('결과가 **세 겹**이다', async () => {
    const r = await 도구부르기('create_document', {}, new 문서방());
    expect(r.content.length).toBe(2);
    expect(r.structuredContent).toBeDefined();
    // content[1] 의 JSON 이 structuredContent 와 같아야 한다
    expect(JSON.parse(r.content[1]!.text)).toEqual(r.structuredContent);
  });

  it('실패해도 **던지지 않고** isError 로 준다', async () => {
    const r = await 도구부르기('get_outline', { doc_id: 'doc_없는것' }, new 문서방());
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain('→');
  });
});

describe('문서방', () => {
  it('한 시간 안 쓴 것은 닫힌다', async () => {
    let 지금 = 0;
    const 방 = new 문서방(() => 지금);
    const 만들기 = await 도구부르기('create_document', {}, 방);
    const doc_id = 만들기.structuredContent!['doc_id'] as string;
    expect(방.꺼내기(doc_id)).toBeDefined();

    지금 += 61 * 60 * 1000;
    expect(방.꺼내기(doc_id)).toBeUndefined();
  });

  it('못 찾으면 **다시 열라고** 말한다', () => {
    const { 어떻게 } = new 문서방().못찾음말('doc_없는것');
    expect(어떻게).toContain('open_document');
  });
});

describe('edit — 열어 놓은 문서를 고친다', () => {
  /**
   * **이 시험이 늦게 생겼다.** 7단계까지 다 끝냈다고 적은 뒤에야,
   * 열어 놓은 문서를 고치는 도구가 **하나도 없다**는 것을 알았다.
   * 검증이 문서 층을 직접 부르고 있어서 도구 표면의 구멍을 못 봤다.
   *
   * 그러니 여기서는 **도구만** 쓴다.
   */
  async function 표든문서() {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방))
      .structuredContent!['doc_id'] as string;
    await 도구부르기('compose', {
      doc_id,
      blocks: [
        { kind: 'body', text: '첫 줄 가나다' },
        { kind: 'table', headers: ['구분', '값'], rows: [['가', '1'], ['나', '2']] },
      ],
    }, 방);
    return { 방, doc_id };
  }

  it('문단 글을 간다', async () => {
    const { 방, doc_id } = await 표든문서();
    const 뼈대 = await 도구부르기('get_outline', { doc_id }, 방);
    const p = (뼈대.structuredContent!['items'] as { id: string; kind: string }[])
      .find((x) => x.kind === 'paragraph')!;

    const r = await 도구부르기('edit', {
      doc_id, edits: [{ op: 'set_text', id: p.id, text: '바꾼 줄' }],
    }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    expect(r.structuredContent!['done']).toBe(1);

    const 확인 = await 도구부르기('find', { doc_id, text: '바꾼 줄' }, 방);
    expect(확인.structuredContent!['count']).toBeGreaterThan(0);
  });

  it('셀 글을 간다 (find 가 준 cell_ ID 로)', async () => {
    const { 방, doc_id } = await 표든문서();
    const f = await 도구부르기('find', { doc_id, text: '구분' }, 방);
    const 셀 = (f.structuredContent!['matches'] as { id: string; kind: string }[])
      .find((x) => x.kind === 'cell');
    expect(셀, 'find 가 셀 ID 를 줘야 한다').toBeDefined();

    const r = await 도구부르기('edit', {
      doc_id, edits: [{ op: 'set_text', id: 셀!.id, text: '갈래' }],
    }, 방);
    expect(r.isError).toBeUndefined();
    expect((await 도구부르기('find', { doc_id, text: '갈래' }, 방)).structuredContent!['count'])
      .toBeGreaterThan(0);
  });

  it('**여러 개를 한 번에** 한다', async () => {
    const { 방, doc_id } = await 표든문서();
    const r = await 도구부르기('edit', {
      doc_id,
      edits: [
        { op: 'replace', find: '가나다', replace: '라마바' },
        { op: 'replace', find: '구분', replace: '갈래' },
      ],
    }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    expect(r.structuredContent!['done']).toBe(2);
  });

  it('**아무것도 안 하고 됐다고 하지 않는다**', async () => {
    const { 방, doc_id } = await 표든문서();
    const r = await 도구부르기('edit', {
      doc_id, edits: [{ op: 'replace', find: '있지도 않은 글', replace: 'x' }],
    }, 방);
    expect(r.isError, '못 찾았으면 실패라고 해야 한다').toBe(true);
    expect(r.content[0]!.text).toContain('찾지 못했다');
  });

  it('**중간에 실패하면 어디까지 됐는지 말한다**', async () => {
    const { 방, doc_id } = await 표든문서();
    const r = await 도구부르기('edit', {
      doc_id,
      edits: [
        { op: 'replace', find: '가나다', replace: '라마바' },
        { op: 'replace', find: '있지도 않은 글', replace: 'x' },
      ],
    }, 방);
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain('1번째');
    expect(r.content[0]!.text).toContain('앞의 1개는 이미 됐다');
  });

  it('표에 줄을 넣는다', async () => {
    const { 방, doc_id } = await 표든문서();
    const 뼈대 = await 도구부르기('get_outline', { doc_id }, 방);
    const t = (뼈대.structuredContent!['items'] as { id: string; kind: string; rows: number }[])
      .find((x) => x.kind === 'table')!;
    const 앞 = t.rows;

    const r = await 도구부르기('edit', {
      doc_id, edits: [{ op: 'insert_row', id: t.id, count: 2 }],
    }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();

    const 뒤 = await 도구부르기('get_content', { doc_id, id: t.id }, 방);
    expect(뒤.structuredContent!['rows']).toBe(앞 + 2);
  });

  it('서식을 준다', async () => {
    const { 방, doc_id } = await 표든문서();
    const 뼈대 = await 도구부르기('get_outline', { doc_id }, 방);
    const p = (뼈대.structuredContent!['items'] as { id: string; kind: string }[])
      .find((x) => x.kind === 'paragraph')!;
    const r = await 도구부르기('edit', {
      doc_id, edits: [{ op: 'set_style', id: p.id, bold: true, size: 15 }],
    }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
  });

  it('모르는 ID 는 **무엇이 있는지 알려 주며** 거절한다', async () => {
    const { 방, doc_id } = await 표든문서();
    const r = await 도구부르기('edit', {
      doc_id, edits: [{ op: 'set_text', id: 'p_없는것', text: 'x' }],
    }, 방);
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain('→');
  });

  it('고칠 것이 없으면 거절한다', async () => {
    const { 방, doc_id } = await 표든문서();
    const r = await 도구부르기('edit', { doc_id, edits: [] }, 방);
    expect(r.isError).toBe(true);
  });
});

describe('get_outline 이 표 안까지 본다', () => {
  /**
   * 양식은 글이 거의 다 표 안에 있다. 실제로 학교 가정통신문은
   * **문서 전체가 문단 하나에 든 표 둘**이라 뼈대가 1개로 나왔다.
   * 그것만 보고는 무엇이 있는지 알 수 없다.
   */
  async function 표든문서() {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방))
      .structuredContent!['doc_id'] as string;
    await 도구부르기('compose', {
      doc_id,
      blocks: [{ kind: 'table', headers: ['구분', '값'], rows: [['가', '1']] }],
    }, 방);
    return { 방, doc_id };
  }

  it('안 켜면 표만 낸다', async () => {
    const { 방, doc_id } = await 표든문서();
    const r = await 도구부르기('get_outline', { doc_id }, 방);
    const 것들 = r.structuredContent!['items'] as { kind: string }[];
    expect(것들.some((x) => x.kind === 'cell')).toBe(false);
  });

  it('**켜면 셀까지 낸다**', async () => {
    const { 방, doc_id } = await 표든문서();
    const r = await 도구부르기('get_outline', { doc_id, in_tables: true }, 방);
    const 셀들 = (r.structuredContent!['items'] as { kind: string; preview: string }[])
      .filter((x) => x.kind === 'cell');
    expect(셀들.length).toBeGreaterThan(0);
    expect(셀들.some((x) => x.preview.includes('구분'))).toBe(true);
  });

  it('셀 ID 로 **바로 고칠 수 있다**', async () => {
    const { 방, doc_id } = await 표든문서();
    const r = await 도구부르기('get_outline', { doc_id, in_tables: true }, 방);
    const 셀 = (r.structuredContent!['items'] as { id: string; kind: string; preview: string }[])
      .find((x) => x.kind === 'cell' && x.preview.includes('구분'))!;

    const e = await 도구부르기('edit', {
      doc_id, edits: [{ op: 'set_text', id: 셀.id, text: '갈래' }],
    }, 방);
    expect(e.isError, e.content[0]?.text).toBeUndefined();
  });

  it('빈 칸은 안 낸다 (뼈대가 어지러워진다)', async () => {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방))
      .structuredContent!['doc_id'] as string;
    await 도구부르기('compose', {
      doc_id, blocks: [{ kind: 'table', rows: [['가', ''], ['', '']] }],
    }, 방);
    const r = await 도구부르기('get_outline', { doc_id, in_tables: true }, 방);
    const 셀들 = (r.structuredContent!['items'] as { kind: string }[]).filter((x) => x.kind === 'cell');
    expect(셀들.length).toBe(1);
  });
});

describe('edit / insert_image — 셀에 그림', () => {
  /**
   * Draftsmith 가 쓰는 셋 가운데 하나가 그림이다.
   * 가정통신문의 교표는 **맨 위 표의 첫 칸**에 들어간다.
   */
  async function 그림파일() {
    const os = await import('node:os');
    const { HwpxContainer } = await import('@hwpx/container');
    const 길 = path.join(os.tmpdir(), 'hwpx-edit-pic.png');
    fs.writeFileSync(길,
      HwpxContainer.open(fs.readFileSync(path.join(뿌리, '자료', '기준파일', 'ref-image.hwpx')))
        .read('BinData/image1.png'));
    return 길;
  }

  async function 표든문서() {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방))
      .structuredContent!['doc_id'] as string;
    await 도구부르기('compose', {
      doc_id, blocks: [{ kind: 'table', rows: [['교표', '이름']] }],
    }, 방);
    return { 방, doc_id };
  }

  it('**셀에 그림이 들어간다**', async () => {
    const { 방, doc_id } = await 표든문서();
    const f = await 도구부르기('find', { doc_id, text: '교표' }, 방);
    const 셀 = (f.structuredContent!['matches'] as { id: string; kind: string }[])
      .find((x) => x.kind === 'cell')!;

    const r = await 도구부르기('edit', {
      doc_id, edits: [{ op: 'insert_image', id: 셀.id, path: await 그림파일(), width: 40 }],
    }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();

    // **파일에 진짜 들어갔나** — 도구가 통과했다고 된 것이 아니다
    const 낼곳 = path.join((await import('node:os')).tmpdir(), 'hwpx-edit-img.hwpx');
    await 도구부르기('save_document', { doc_id, path: 낼곳, overwrite: true }, 방);
    const { 문서: 문서클래스 } = await import('@hwpx/doc');
    const { findAll: 찾기다 } = await import('@hwpx/owpml');
    const 뒤 = 문서클래스.열기(fs.readFileSync(낼곳));
    expect(찾기다(뒤.구역들[0]!.root, 'hp:pic').length).toBe(1);
    // BinData 와 manifest 가 짝이 맞아야 한글이 그림을 찾는다
    expect(뒤.컨테이너.binDataNames().length).toBe(1);
    expect(뒤.검사()).toEqual([]);
  });

  it('**표에 넣으려 하면 거절한다** (어디에 넣을지 모른다)', async () => {
    const { 방, doc_id } = await 표든문서();
    const 뼈대 = await 도구부르기('get_outline', { doc_id }, 방);
    const t = (뼈대.structuredContent!['items'] as { id: string; kind: string }[])
      .find((x) => x.kind === 'table')!;
    const r = await 도구부르기('edit', {
      doc_id, edits: [{ op: 'insert_image', id: t.id, path: await 그림파일() }],
    }, 방);
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain('셀 ID');
  });

  it('없는 파일은 거절한다', async () => {
    const { 방, doc_id } = await 표든문서();
    const f = await 도구부르기('find', { doc_id, text: '교표' }, 방);
    const 셀 = (f.structuredContent!['matches'] as { id: string; kind: string }[])
      .find((x) => x.kind === 'cell')!;
    const r = await 도구부르기('edit', {
      doc_id, edits: [{ op: 'insert_image', id: 셀.id, path: 'C:\없는곳\없다.png' }],
    }, 방);
    expect(r.isError).toBe(true);
  });

  it('상대 경로는 거절한다', async () => {
    const { 방, doc_id } = await 표든문서();
    const f = await 도구부르기('find', { doc_id, text: '교표' }, 방);
    const 셀 = (f.structuredContent!['matches'] as { id: string; kind: string }[])
      .find((x) => x.kind === 'cell')!;
    const r = await 도구부르기('edit', {
      doc_id, edits: [{ op: 'insert_image', id: 셀.id, path: 'pic.png' }],
    }, 방);
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain('절대 경로');
  });
});

describe('get_outline 이 셀 안에 든 표까지 낸다', () => {
  /**
   * 학교 가정통신문은 **바깥 표(2x3) 의 한 칸에 회신서(3x7)** 가 들어 있다.
   * 안 내려가면 그 표를 가리킬 길이 없어, 줄을 넣으려다 **바깥 표**에 넣는다.
   * 실제로 그래서 1쪽짜리가 3쪽이 됐다.
   */
  it('**겹친 표가 다 나온다**', async () => {
    const 방 = new 문서방();
    // **저장소 안 기준파일을 쓴다.** 예전에는 남의 폴더를 가리키고
    // 파일이 없으면 조용히 건너뛰었다 — 그 기계에서는 아무것도 안 재는 시험이었다.
    const 길 = path.join(뿌리, '자료', '기준파일', 'ref-table-nested.hwpx');

    const doc_id = (await 도구부르기('open_document', { path: 길, read_only: true }, 방))
      .structuredContent!['doc_id'] as string;
    const r = await 도구부르기('get_outline', { doc_id, in_tables: true }, 방);
    const 표들 = (r.structuredContent!['items'] as { kind: string; rows: number; in_cell?: string }[])
      .filter((x) => x.kind === 'table');

    expect(표들.length, '바깥 표와 회신서 둘 다 나와야 한다').toBeGreaterThanOrEqual(2);
    // 회신서는 셀 안에 들어 있으니 in_cell 이 붙는다
    expect(표들.some((x) => x.in_cell !== undefined), '셀 안에 든 표에는 그 셀 ID 가 붙어야 한다').toBe(true);
  });

  it('겹친 표의 줄 수가 제대로 나온다', async () => {
    const 방 = new 문서방();
    const 길 = path.join(뿌리, '자료', '기준파일', 'ref-table-nested.hwpx');

    const doc_id = (await 도구부르기('open_document', { path: 길, read_only: true }, 방))
      .structuredContent!['doc_id'] as string;
    const r = await 도구부르기('get_outline', { doc_id, in_tables: true }, 방);
    const 안표 = (r.structuredContent!['items'] as { kind: string; rows: number; cols: number; in_cell?: string }[])
      .find((x) => x.kind === 'table' && x.in_cell !== undefined);
    expect(안표, '셀 안에 든 표가 있어야 한다').toBeDefined();
    expect(안표!.rows).toBeGreaterThan(1);
    expect(안표!.cols).toBeGreaterThan(1);
  });
});

describe('이어서 고치기 — 강조가 조용히 사라지지 않는다', () => {
  /**
   * Draftsmith 가 가장 걱정한 자리다:
   *
   * > 「이어서 고치기」로 문서를 다섯 번 고치면 강조가 **한 번에 하나씩 조용히 사라진다.**
   * > 결재 올릴 때야 「어? 굵게 한 데가 없네」 하고 알아차린다.
   * > 그때는 어느 판에서 날아갔는지 알 길이 없다.
   *
   * 실제로 그랬다 — `replace` 가 런을 넘어 찾으면서 셋을 하나로 합쳐 굵기를 날렸다.
   * **못 찾는 것이 몰래 망가뜨리는 것보다 낫다.**
   */
  async function 굵은글자수(방: InstanceType<typeof 문서방>, doc_id: string) {
    const { 문서: 문서클래스 } = await import('@hwpx/doc');
    const { parseXml: 읽기, findAll: 찾기다, getAttr: 속성 } = await import('@hwpx/owpml');
    const os = await import('node:os');
    const 낼곳 = path.join(os.tmpdir(), `hwpx-again-${doc_id}.hwpx`);
    await 도구부르기('save_document', { doc_id, path: 낼곳, overwrite: true }, 방);

    const d = 문서클래스.열기(fs.readFileSync(낼곳));
    const 머리 = 읽기(d.머리.toXml()).root;
    const 굵은id = new Set(찾기다(머리, 'hh:charPr')
      .filter((cp) => 찾기다(cp, 'hh:bold').length > 0)
      .map((cp) => 속성(cp, 'id')));
    let n = 0;
    for (const s of d.구역들) {
      for (const p of s.모든문단들) {
        for (const r of p.런들) {
          if (!굵은id.has(속성(r, 'charPrIDRef'))) continue;
          n += 찾기다(r, 'hp:t').map((t) => (t.children[0] as { raw?: string } | undefined)?.raw ?? '').join('').length;
        }
      }
    }
    return { 굵은수: n, 파일: 낼곳 };
  }

  it('**세 번 이어서 고쳐도 굵은 글자 수가 그대로다**', async () => {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방))
      .structuredContent!['doc_id'] as string;
    // `**…**` 가 런을 가른다 — Draftsmith 지침의 emphasize 와 같은 길이다
    await 도구부르기('compose', {
      doc_id,
      blocks: [
        { kind: 'body', text: '2026학년도 **한빛초등학교** 운영 계획' },
        { kind: 'body', text: '가정통신문 **회신 기한**은 3월 20일입니다' },
      ],
    }, 방);

    const 처음 = await 굵은글자수(방, doc_id);
    expect(처음.굵은수, '굵은 글자가 있어야 이 시험이 뜻이 있다').toBeGreaterThan(0);

    // 「이어서 고치기」 — 열고 고치고 저장하기를 되풀이한다
    let 길 = 처음.파일;
    for (const [찾을, 바꿀] of [['3월 20일', '3월 25일'], ['2026학년도', '2027학년도'], ['가정통신문', '안내문']]) {
      const 다시 = (await 도구부르기('open_document', { path: 길 }, 방))
        .structuredContent!['doc_id'] as string;
      const r = await 도구부르기('edit', {
        doc_id: 다시, edits: [{ op: 'replace', find: 찾을, replace: 바꿀 }],
      }, 방);
      expect(r.isError, `'${찾을}' 을 못 바꿨다: ${r.content[0]?.text}`).toBeUndefined();
      길 = (await 굵은글자수(방, 다시)).파일;
      await 도구부르기('close_document', { doc_id: 다시 }, 방);
    }

    const 끝 = await 굵은글자수(방,
      (await 도구부르기('open_document', { path: 길 }, 방)).structuredContent!['doc_id'] as string);
    expect(끝.굵은수, '고칠 때마다 굵기가 한 자씩 사라지면 안 된다').toBe(처음.굵은수);
  });
});

describe('get_content 가 칸 ID 를 준다', () => {
  /**
   * Draftsmith 초안이 「`insert_row` 뒤에 `get_content(id:"tbl_…")` 로
   * 셀 id 를 다시 받는다」 고 적었는데, 그때 `cells` 는 **글만** 주고 있었다.
   * 초안 글이 틀린 게 아니라 **도구가 그 일을 못 하고 있었다.**
   */
  async function 표든문서() {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방))
      .structuredContent!['doc_id'] as string;
    await 도구부르기('compose', {
      doc_id, blocks: [{ kind: 'table', headers: ['구분', '값'], rows: [['가', '1']] }],
    }, 방);
    const 뼈대 = await 도구부르기('get_outline', { doc_id }, 방);
    const 표id = (뼈대.structuredContent!['items'] as { id: string; kind: string }[])
      .find((x) => x.kind === 'table')!.id;
    return { 방, doc_id, 표id };
  }

  it('칸마다 id·글·자리를 준다', async () => {
    const { 방, doc_id, 표id } = await 표든문서();
    const r = await 도구부르기('get_content', { doc_id, id: 표id }, 방);
    const 칸들 = r.structuredContent!['cells'] as { id: string; text: string; row: number; col: number }[];
    expect(칸들.length).toBe(4);
    expect(칸들[0]!.id).toMatch(/^cell_/);
    expect(칸들[0]!.text).toBe('구분');
    expect(칸들[0]!.row).toBe(0);
  });

  it('**그 id 로 바로 고칠 수 있다**', async () => {
    const { 방, doc_id, 표id } = await 표든문서();
    const 칸들 = (await 도구부르기('get_content', { doc_id, id: 표id }, 방))
      .structuredContent!['cells'] as { id: string; text: string }[];
    const r = await 도구부르기('edit', {
      doc_id, edits: [{ op: 'set_text', id: 칸들[0]!.id, text: '갈래' }],
    }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
  });

  it('**줄을 넣은 뒤 새 칸의 id 를 받을 수 있다**', async () => {
    const { 방, doc_id, 표id } = await 표든문서();
    await 도구부르기('edit', { doc_id, edits: [{ op: 'insert_row', id: 표id, count: 1 }] }, 방);
    const 칸들 = (await 도구부르기('get_content', { doc_id, id: 표id }, 방))
      .structuredContent!['cells'] as { id: string; row: number }[];
    expect(칸들.length).toBe(6);
    const 새칸 = 칸들.filter((c) => c.row === 2);
    expect(새칸.length).toBe(2);
    const r = await 도구부르기('edit', {
      doc_id, edits: [{ op: 'set_text', id: 새칸[0]!.id, text: '새 줄' }],
    }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
  });

  it('**빈 표인지 알려 준다** (빈 표 찾기에 쓴다)', async () => {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방))
      .structuredContent!['doc_id'] as string;
    await 도구부르기('compose', {
      doc_id, blocks: [{ kind: 'table', rows: [['', ''], ['', '']] }],
    }, 방);
    const 뼈대 = await 도구부르기('get_outline', { doc_id }, 방);
    const 표id = (뼈대.structuredContent!['items'] as { id: string; kind: string }[])
      .find((x) => x.kind === 'table')!.id;
    const r = await 도구부르기('get_content', { doc_id, id: 표id }, 방);
    expect(r.structuredContent!['empty']).toBe(true);
  });

  it('안 빈 표는 empty 가 false 다', async () => {
    const { 방, doc_id, 표id } = await 표든문서();
    const r = await 도구부르기('get_content', { doc_id, id: 표id }, 방);
    expect(r.structuredContent!['empty']).toBe(false);
  });
});

describe('id 없이 문서 전체 글을 읽는다', () => {
  /**
   * 「고치기 전에 전체 흐름을 먼저 읽는다」 를 하려면 이 길이 있어야 한다.
   * 없을 때는 get_outline 의 미리보기를 이어 붙이는 수밖에 없었는데,
   * 미리보기는 잘린 글이라 **흐름을 읽는 데 못 쓴다.**
   */
  async function 글든문서() {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방))
      .structuredContent!['doc_id'] as string;
    await 도구부르기('compose', {
      doc_id, blocks: [
        { kind: 'heading', text: '첫 머리' },
        { kind: 'body', text: '본문 한 줄' },
        { kind: 'body', text: '본문 두 줄' },
      ],
    }, 방);
    return { 방, doc_id };
  }

  it('id 를 안 줘도 잘 된다', async () => {
    const { 방, doc_id } = await 글든문서();
    const r = await 도구부르기('get_content', { doc_id }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    expect(r.structuredContent!['kind']).toBe('document');
  });

  it('문단 글이 **잘리지 않고 순서대로** 온다', async () => {
    const { 방, doc_id } = await 글든문서();
    const 글 = (await 도구부르기('get_content', { doc_id }, 방))
      .structuredContent!['text'] as string;
    expect(글).toContain('첫 머리');
    expect(글).toContain('본문 한 줄');
    expect(글.indexOf('첫 머리')).toBeLessThan(글.indexOf('본문 한 줄'));
    expect(글.indexOf('본문 한 줄')).toBeLessThan(글.indexOf('본문 두 줄'));
  });

  it('id 를 주면 그 요소만 낸다 (하던 대로)', async () => {
    const { 방, doc_id } = await 글든문서();
    const 뼈대 = await 도구부르기('get_outline', { doc_id }, 방);
    const p = (뼈대.structuredContent!['items'] as { id: string; kind: string }[])
      .find((x) => x.kind !== 'table')!;
    const r = await 도구부르기('get_content', { doc_id, id: p.id }, 방);
    expect(r.structuredContent!['kind']).not.toBe('document');
    expect(r.structuredContent!['id']).toBe(p.id);
  });
});

describe('find 가 빈 표를 가려 준다', () => {
  /** 초안이 「find 로 빈 표를 고른다」 고 적었는데, 답에 그럴 열쇠가 없었다. */
  async function 표둘문서(첫줄: string[]) {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방))
      .structuredContent!['doc_id'] as string;
    await 도구부르기('compose', {
      doc_id, blocks: [{ kind: 'table', rows: [첫줄, ['', '']] }],
    }, 방);
    const r = await 도구부르기('find', { doc_id, kind: 'table' }, 방);
    return (r.structuredContent!['matches'] as Record<string, unknown>[])[0]!;
  }

  it('빈 표는 empty 가 true 다', async () => {
    expect((await 표둘문서(['', '']))['empty']).toBe(true);
  });

  it('안 빈 표는 empty 가 false 다', async () => {
    expect((await 표둘문서(['가', '나']))['empty']).toBe(false);
  });

  it('줄·칸 수도 같이 온다', async () => {
    const m = await 표둘문서(['가', '나']);
    expect(m['rows']).toBe(2);
    expect(m['cols']).toBe(2);
  });
});

describe('빈 자리를 찾는 길 — find(kind:"paragraph")', () => {
  /**
   * Draftsmith 가 지침대로 통신문을 한 편 끝까지 만들어 보고 찾은 구멍이다.
   * **인사말 본문이 통째로 비어 나왔다.** 그 자리가 빈 문단이라
   * `find(text: …)` 로는 채울 자리가 있는 줄도 몰랐다.
   *
   * 도구가 답을 갖고 있었다 — `kind:"paragraph"` 로 훑으면 빈 문단도 나온다.
   * 다만 지침이 **차례가 문서 순서라는 것**을 전제로 쓰므로 여기서 못 박는다.
   */
  async function 빈자리든문서() {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방))
      .structuredContent!['doc_id'] as string;
    await 도구부르기('compose', {
      doc_id, blocks: [
        { kind: 'body', text: '첫째' },
        { kind: 'body', text: '' },
        { kind: 'body', text: '셋째' },
        { kind: 'body', text: '넷째' },
      ],
    }, 방);
    return { 방, doc_id };
  }

  it('빈 문단도 나온다 (text 로는 못 찾는 것)', async () => {
    const { 방, doc_id } = await 빈자리든문서();
    const r = await 도구부르기('find', { doc_id, kind: 'paragraph' }, 방);
    const 빈것 = (r.structuredContent!['matches'] as { preview: string }[])
      .filter((m) => m.preview.trim() === '');
    expect(빈것.length, '빈 자리를 못 내면 채울 데가 있는 줄 모른다').toBeGreaterThan(0);
  });

  it('**차례가 문서 순서다** (지침이 이걸 전제로 쓴다)', async () => {
    const { 방, doc_id } = await 빈자리든문서();
    const 글들 = (await 도구부르기('find', { doc_id, kind: 'paragraph' }, 방))
      .structuredContent!['matches'] as { preview: string }[];
    const 자리 = (글: string) => 글들.findIndex((m) => m.preview.includes(글));
    expect(자리('첫째')).toBeGreaterThanOrEqual(0);
    expect(자리('첫째')).toBeLessThan(자리('셋째'));
    expect(자리('셋째')).toBeLessThan(자리('넷째'));
  });

  it('**칸 안 문단은 어느 칸인지 알려 준다** (in_cell)', async () => {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방))
      .structuredContent!['doc_id'] as string;
    await 도구부르기('compose', {
      doc_id, blocks: [{ kind: 'table', headers: ['구분', '값'], rows: [['가', '나']] }],
    }, 방);
    const 글들 = (await 도구부르기('find', { doc_id, kind: 'paragraph' }, 방))
      .structuredContent!['matches'] as { preview: string; in_cell?: string }[];
    const 칸속 = 글들.find((m) => m.preview.includes('구분'));
    expect(칸속?.in_cell, '칸 안 문단인데 어느 칸인지 안 알려 준다').toMatch(/^cell_/);
  });

  it('칸 밖 문단에는 in_cell 이 안 붙는다', async () => {
    const { 방, doc_id } = await 빈자리든문서();
    const 글들 = (await 도구부르기('find', { doc_id, kind: 'paragraph' }, 방))
      .structuredContent!['matches'] as { preview: string; in_cell?: string }[];
    expect(글들.find((m) => m.preview.includes('첫째'))?.in_cell).toBeUndefined();
  });

});

describe('회신서 꼴 — 표 안의 표', () => {
  /**
   * 가정통신문 회신서가 이 꼴이다. 바깥 표(2x3) 칸 안에 회신서 표(3x7)가 들어 있다.
   * **실제로 쓰는 빈 서식**이다 — 합성한 것이 아니다.
   * 표를 자기 자신 안에 본떠 만든 합성 파일은 한글이 열다 멎었다.
   * 옛 MCP 는 이 안쪽 표를 **아예 못 봤고**(표를 1개로 셌다),
   * 그래서 줄을 넣으라면 바깥 표에 넣어 회신서를 통째로 복제했다.
   */
  async function 회신서꼴() {
    const 방 = new 문서방();
    const 길 = path.join(뿌리, '자료', '기준파일', 'ref-table-nested.hwpx');
    const doc_id = (await 도구부르기('open_document', { path: 길 }, 방))
      .structuredContent!['doc_id'] as string;
    return { 방, doc_id };
  }

  it('바깥 표와 안쪽 표를 **둘 다** 낸다', async () => {
    const { 방, doc_id } = await 회신서꼴();
    const 것들 = (await 도구부르기('get_outline', { doc_id, in_tables: true }, 방))
      .structuredContent!['items'] as { id: string; kind: string; in_cell?: string }[];
    const 표들 = 것들.filter((x) => x.kind === 'table');
    expect(표들.length, '안쪽 표를 못 보면 줄을 바깥에 넣어 회신서가 복제된다').toBe(2);
  });

  it('안쪽 표에 **어느 칸에 들었는지**가 붙는다', async () => {
    const { 방, doc_id } = await 회신서꼴();
    const 것들 = (await 도구부르기('get_outline', { doc_id, in_tables: true }, 방))
      .structuredContent!['items'] as { id: string; kind: string; in_cell?: string }[];
    const 안표 = 것들.find((x) => x.kind === 'table' && x.in_cell !== undefined);
    expect(안표?.in_cell).toMatch(/^cell_/);
  });

  it('**안쪽 표 문단은 바깥 칸이 아니라 안쪽 칸을 가리킨다**', async () => {
    const { 방, doc_id } = await 회신서꼴();
    const 것들 = (await 도구부르기('get_outline', { doc_id, in_tables: true }, 방))
      .structuredContent!['items'] as { id: string; kind: string; in_cell?: string }[];
    const 안표 = 것들.find((x) => x.kind === 'table' && x.in_cell !== undefined)!;
    const 안표꼬리 = 안표.id.slice(4);

    const 글들 = (await 도구부르기('find', { doc_id, kind: 'paragraph' }, 방))
      .structuredContent!['matches'] as { id: string; in_cell?: string }[];
    const 안쪽것 = 글들.filter((m) => m.in_cell?.startsWith(`cell_${안표꼬리}_`));
    expect(안쪽것.length,
      '다 바깥 칸으로 나오면 회신서 안의 자리를 곧바로 못 집는다').toBeGreaterThan(0);
  });

  it('안쪽 표에 줄을 넣어도 바깥 표 줄 수는 그대로다', async () => {
    const { 방, doc_id } = await 회신서꼴();
    const 것들 = (await 도구부르기('get_outline', { doc_id, in_tables: true }, 방))
      .structuredContent!['items'] as { id: string; kind: string; rows?: number; in_cell?: string }[];
    const 바깥 = 것들.find((x) => x.kind === 'table' && x.in_cell === undefined)!;
    const 안표 = 것들.find((x) => x.kind === 'table' && x.in_cell !== undefined)!;
    const 바깥줄앞 = 바깥.rows!;

    const r = await 도구부르기('edit', {
      doc_id, edits: [{ op: 'insert_row', id: 안표.id, count: 1 }],
    }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();

    const 뒤 = (await 도구부르기('get_outline', { doc_id, in_tables: true }, 방))
      .structuredContent!['items'] as { id: string; kind: string; rows?: number }[];
    expect(뒤.find((x) => x.id === 바깥.id)?.rows, '바깥 표가 같이 늘면 쪽이 늘어난다').toBe(바깥줄앞);
    expect(뒤.find((x) => x.id === 안표.id)?.rows).toBe(안표.rows! + 1);
  });
});

describe('한도 — **잘린 것을 잘렸다고 말한다**', () => {
  /**
   * Draftsmith 가 계획서로 옮겨 가자마자 나온 것.
   * `find(kind:"paragraph")` 기본 한도가 50 이었는데 계획서는 문단이 84개다.
   * **「4. 예산사용계획」이 51번째 뒤에 있었다.**
   *
   * 지침대로 「훑어서 빈 자리를 채운다」 를 하면 앞 세 절만 채우고
   * **예산 표를 빈 채로 두고 끝낸다.** 그러고도 자기가 뭘 안 봤는지 모른다.
   *
   * 사람 말로는 "(앞 50개만)" 이라고 알려 주고 있었다. 그것으로는 모자랐다 —
   * **답에 담아야 안다.**
   */
  async function 문단많은문서(몇개: number) {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방))
      .structuredContent!['doc_id'] as string;
    await 도구부르기('compose', {
      doc_id,
      blocks: Array.from({ length: 몇개 }, (_, i) => ({ kind: 'body', text: `${i}번 줄` })),
    }, 방);
    return { 방, doc_id };
  }

  it('**훑으면 50개를 넘겨도 다 온다** (뒷절이 안 잘린다)', async () => {
    const { 방, doc_id } = await 문단많은문서(84);
    const r = await 도구부르기('find', { doc_id, kind: 'paragraph' }, 방);
    const 것들 = r.structuredContent!['matches'] as { preview: string }[];
    expect(것들.some((m) => m.preview.includes('83번 줄')),
      '뒷절이 잘리면 예산 표를 빈 채로 두고 끝낸다').toBe(true);
    expect(r.structuredContent!['truncated']).toBe(false);
  });

  it('그래도 넘치면 **truncated 로 알려 준다**', async () => {
    const { 방, doc_id } = await 문단많은문서(20);
    const r = await 도구부르기('find', { doc_id, kind: 'paragraph', limit: 5 }, 방);
    expect(r.structuredContent!['truncated'], '잘렸는데 안 알려 주면 못 본 줄도 모른다').toBe(true);
    expect((r.structuredContent!['matches'] as unknown[]).length).toBe(5);
    expect(r.structuredContent!['count']).toBeGreaterThan(5);
  });

  it('잘렸으면 **무엇을 하라고** 말한다', async () => {
    const { 방, doc_id } = await 문단많은문서(20);
    const r = await 도구부르기('find', { doc_id, kind: 'paragraph', limit: 5 }, 방);
    expect(r.content[0]?.text).toContain('limit');
  });

  it('안 잘렸으면 truncated 가 false 다', async () => {
    const { 방, doc_id } = await 문단많은문서(5);
    const r = await 도구부르기('find', { doc_id, kind: 'paragraph' }, 방);
    expect(r.structuredContent!['truncated']).toBe(false);
  });

  it('get_outline 도 잘린 것을 잘렸다고 한다', async () => {
    const { 방, doc_id } = await 문단많은문서(20);
    const r = await 도구부르기('get_outline', { doc_id, limit: 5 }, 방);
    expect(r.structuredContent!['truncated']).toBe(true);
    expect(r.content[0]?.text).toContain('limit');
  });

  it('get_outline 도 안 잘렸으면 false 다', async () => {
    const { 방, doc_id } = await 문단많은문서(5);
    const r = await 도구부르기('get_outline', { doc_id }, 방);
    expect(r.structuredContent!['truncated']).toBe(false);
  });

  it('**실제 계획서 양식이 통째로 온다** (「4. 예산사용계획」까지)', async () => {
    const 방 = new 문서방();
    const 길 = path.join(뿌리, '자료', '기준파일', 'ref-table-nested.hwpx');
    const doc_id = (await 도구부르기('open_document', { path: 길 }, 방))
      .structuredContent!['doc_id'] as string;
    const 연것 = await 도구부르기('open_document', { path: 길 }, 방);
    const r = await 도구부르기('find', { doc_id, kind: 'paragraph' }, 방);
    expect(r.structuredContent!['count'])
      .toBe(연것.structuredContent!['paragraphs']);
    expect(r.structuredContent!['truncated']).toBe(false);
  });
});

describe('한 칸에 문단이 여럿일 때', () => {
  /**
   * Draftsmith 가 계획서를 끝까지 만들며 찾았다.
   * 실제 계획서 양식에 **한 칸에 빈 문단이 둘인 칸이 4개** 있었다.
   *
   * 그때 도구는 이랬다.
   *   - `set_text(cell_…)` 이 **첫 문단만** 갈고 "1곳이 바뀌었다" 고 했다.
   *     둘째 줄의 옛 글은 그대로 남았다. **조용한 반쪽 쓰기다.**
   *   - `get_content(cell_…)` 이 다 이어 붙여 "첫 줄 글둘째 줄 글" 을 줬다.
   *     두 줄인 줄도 모르고, 그대로 다시 넣으면 한 줄이 된다.
   */
  /**
   * **문단이 정말 둘인 칸을 고른다.** 하나뿐인 칸을 잡으면
   * 아래 시험들이 조용히 건너뛰어 아무것도 안 본다 — 실제로 그럴 뻔했다.
   */
  async function 문단둘인칸() {
    const 방 = new 문서방();
    const 길 = path.join(뿌리, '자료', '기준파일', 'ref-table-nested.hwpx');
    const doc_id = (await 도구부르기('open_document', { path: 길 }, 방))
      .structuredContent!['doc_id'] as string;
    const 글들 = (await 도구부르기('find', { doc_id, kind: 'paragraph' }, 방))
      .structuredContent!['matches'] as { id: string; in_cell?: string }[];
    const 셈 = new Map<string, number>();
    for (const m of 글들) if (m.in_cell) 셈.set(m.in_cell, (셈.get(m.in_cell) ?? 0) + 1);
    const 찾은것 = [...셈].find(([, n]) => n > 1);
    expect(찾은것, '문단 둘인 칸이 없으면 이 시험들은 아무것도 안 본다').toBeDefined();
    return { 방, doc_id, 칸id: 찾은것![0] };
  }

  it('**text 가 줄바꿈으로 갈라져 온다** (이어 붙이면 두 줄인 줄 모른다)', async () => {
    const { 방, doc_id, 칸id } = await 문단둘인칸();
    await 도구부르기('edit', {
      doc_id, edits: [{ op: 'set_text', id: 칸id, text: `윗줄\n아랫줄` }],
    }, 방);
    const 글 = (await 도구부르기('get_content', { doc_id, id: 칸id }, 방))
      .structuredContent!['text'] as string;
    expect(글, '"윗줄아랫줄" 로 오면 그대로 다시 넣었을 때 한 줄이 된다')
      .toBe(`윗줄\n아랫줄`);
  });

  it('표를 통째로 볼 때도 칸 글이 갈라져 온다', async () => {
    const { 방, doc_id, 칸id } = await 문단둘인칸();
    await 도구부르기('edit', {
      doc_id, edits: [{ op: 'set_text', id: 칸id, text: `윗줄\n아랫줄` }],
    }, 방);
    const 표id = `tbl_${칸id.split('_')[1]}`;
    const 칸들 = (await 도구부르기('get_content', { doc_id, id: 표id }, 방))
      .structuredContent!['cells'] as { id: string; text: string }[];
    expect(칸들.find((c) => c.id === 칸id)?.text).toBe(`윗줄\n아랫줄`);
  });

  it('칸 글을 **문단마다 나눠** 준다', async () => {
    const { 방, doc_id, 칸id } = await 문단둘인칸();
    const r = await 도구부르기('get_content', { doc_id, id: 칸id }, 방);
    const 문단들 = r.structuredContent!['paragraphs'] as { id: string; text: string }[];
    expect(문단들.length).toBeGreaterThan(0);
    expect(문단들[0]!.id).toMatch(/^p_/);
  });

  it('**줄바꿈으로 여러 문단을 한 번에 채운다**', async () => {
    const { 방, doc_id, 칸id } = await 문단둘인칸();
    const 문단수 = ((await 도구부르기('get_content', { doc_id, id: 칸id }, 방))
      .structuredContent!['paragraphs'] as unknown[]).length;
    expect(문단수, '문단이 둘이어야 이 시험이 뜻이 있다').toBeGreaterThanOrEqual(2);
    const r = await 도구부르기('edit', {
      doc_id, edits: [{ op: 'set_text', id: 칸id, text: `윗줄\n아랫줄` }],
    }, 방);
    expect(r.isError, r.content[0]?.text).toBeUndefined();
    const 뒤 = (await 도구부르기('get_content', { doc_id, id: 칸id }, 방))
      .structuredContent!['paragraphs'] as { text: string }[];
    expect(뒤[0]!.text).toBe('윗줄');
    expect(뒤[1]!.text).toBe('아랫줄');
  });

  it('**남는 문단을 비운다** (옛 글이 뒤에 안 남는다)', async () => {
    const { 방, doc_id, 칸id } = await 문단둘인칸();
    const 문단수 = ((await 도구부르기('get_content', { doc_id, id: 칸id }, 방))
      .structuredContent!['paragraphs'] as unknown[]).length;
    expect(문단수).toBeGreaterThanOrEqual(2);
    await 도구부르기('edit', {
      doc_id, edits: [{ op: 'set_text', id: 칸id, text: `윗줄\n아랫줄` }],
    }, 방);
    await 도구부르기('edit', {
      doc_id, edits: [{ op: 'set_text', id: 칸id, text: '한 줄만' }],
    }, 방);
    const 뒤 = (await 도구부르기('get_content', { doc_id, id: 칸id }, 방))
      .structuredContent!['paragraphs'] as { text: string }[];
    expect(뒤[0]!.text).toBe('한 줄만');
    expect(뒤[1]!.text, '옛 글이 남으면 "한 줄만아랫줄" 이 된다').toBe('');
  });

  it('**문단보다 줄이 많으면 거절한다** (말없이 합치지 않는다)', async () => {
    const { 방, doc_id, 칸id } = await 문단둘인칸();
    const 문단수 = ((await 도구부르기('get_content', { doc_id, id: 칸id }, 방))
      .structuredContent!['paragraphs'] as unknown[]).length;
    const 너무많이 = Array.from({ length: 문단수 + 2 }, (_, i) => `${i}줄`).join('\n');
    const r = await 도구부르기('edit', {
      doc_id, edits: [{ op: 'set_text', id: 칸id, text: 너무많이 }],
    }, 방);
    expect(r.isError, '넘치는데 받으면 줄이 사라진 줄도 모른다').toBe(true);
    expect(r.content[0]?.text).toContain('문단');
  });
});

describe('낸 답이 제 outputSchema 를 지킨다', () => {
  /**
   * `outputSchema.required` 는 **늘 낸다는 약속**이다.
   * 적어 놓고 안 내면 엄격한 클라이언트가 그 답을 통째로 거절한다.
   *
   * 실제로 어겼다 — `get_content` 가 `id` 를 필수로 적어 놓고,
   * `id` 없이 부르면(문서 전체 읽기) `id` 를 안 냈다.
   * 갈래별 시험은 다 통과했다. **약속과 답을 맞대 보는 시험이 없었다.**
   */
  /**
   * 부르고, **약속한 필수 열쇠를 정말 내는지** 잰다.
   *
   * 잰 열쇠 수를 함께 돌려준다 — 부르는 쪽이 「정말 뭘 재긴 했나」 를
   * 못 박을 수 있어야 한다. 필수가 하나도 없는 도구를 넣으면
   * 이 도우미는 아무것도 안 재고 통과한다.
   */
  async function 지키나(이름: string, 인자: Record<string, unknown>, 방: 문서방) {
    const r = await 도구부르기(이름, 인자, 방);
    expect(r.isError, `${이름}: ${r.content[0]?.text}`).toBeUndefined();
    const 스키마 = 도구들.find((t) => t.name === 이름)!.outputSchema as
      { required?: string[] } | undefined;
    const 낸것 = r.structuredContent ?? {};
    const 잰것 = 스키마?.required ?? [];
    for (const k of 잰것) {
      expect(k in 낸것, `${이름} 이 필수 열쇠 '${k}' 를 안 냈다`).toBe(true);
    }
    return { r, 잰수: 잰것.length };
  }

  it('**읽기 도구 다섯이 필수 열쇠를 다 낸다**', async () => {
    const 방 = new 문서방();
    const 길 = path.join(뿌리, '자료', '기준파일', 'ref-table-nested.hwpx');
    const 연것 = await 지키나('open_document', { path: 길 }, 방);
    const doc_id = 연것.r.structuredContent!['doc_id'] as string;
    let 잰수 = 연것.잰수;
    for (const [이름, 인자] of [
      ['get_outline', { doc_id, in_tables: true }],
      ['find', { doc_id, kind: 'paragraph' }],
      ['get_styles', { doc_id }],
      ['list_documents', {}],
    ] as [string, Record<string, unknown>][]) {
      잰수 += (await 지키나(이름, 인자, 방)).잰수;
    }
    // open 2 + outline 3 + find 3 + styles 1 + list 2 = 11.
    // **어림수가 아니라 센 수다.** 어느 도구가 required 를 잃으면 여기서 걸린다.
    expect(잰수, '잰 열쇠 수가 달라졌다 — 어느 도구의 required 가 바뀌었나').toBe(11);
  });

  it('**get_content 는 id 를 줘도 안 줘도 필수를 다 낸다**', async () => {
    const 방 = new 문서방();
    const 길 = path.join(뿌리, '자료', '기준파일', 'ref-table-nested.hwpx');
    const doc_id = (await 도구부르기('open_document', { path: 길 }, 방))
      .structuredContent!['doc_id'] as string;

    // id 없이 = 문서 전체. 여기서 id 를 안 내고 있었다.
    const 전체 = await 지키나('get_content', { doc_id }, 방);
    expect(전체.r.structuredContent!['id'], '무엇을 읽은 것인지는 그때도 있어야 한다').toBe(doc_id);

    const 뼈대 = await 도구부르기('get_outline', { doc_id, in_tables: true }, 방);
    const 것들 = 뼈대.structuredContent!['items'] as { id: string; kind: string }[];
    await 지키나('get_content', { doc_id, id: 것들.find((x) => x.kind === 'table')!.id }, 방);
    await 지키나('get_content', { doc_id, id: 것들.find((x) => x.kind === 'cell')!.id }, 방);

    // 뼈대에는 문단이 안 보일 수 있다 — 이 양식은 글이 거의 다 칸 안에 있다.
    // 문단 ID 는 find 로 받는다.
    const 문단들 = (await 도구부르기('find', { doc_id, kind: 'paragraph' }, 방))
      .structuredContent!['matches'] as { id: string }[];
    expect(문단들.length, '문단이 없으면 이 갈래를 못 잰다').toBeGreaterThan(0);
    await 지키나('get_content', { doc_id, id: 문단들[0]!.id }, 방);
  });

  it('**고치는 도구 다섯도 필수 열쇠를 다 낸다**', async () => {
    const 방 = new 문서방();
    const 만든것 = await 지키나('create_document', {}, 방);
    const doc_id = 만든것.r.structuredContent!['doc_id'] as string;
    let 잰수 = 만든것.잰수;
    잰수 += (await 지키나('compose', {
      doc_id, blocks: [{ kind: 'body', text: '가나다' }],
    }, 방)).잰수;
    const p = (await 도구부르기('find', { doc_id, text: '가나다' }, 방))
      .structuredContent!['matches'] as { id: string }[];
    잰수 += (await 지키나('edit', {
      doc_id, edits: [{ op: 'set_text', id: p[0]!.id, text: '라마바' }],
    }, 방)).잰수;
    const 낼곳 = path.join(os.tmpdir(), '약속시험.hwpx');
    잰수 += (await 지키나('save_document', { doc_id, path: 낼곳, overwrite: true }, 방)).잰수;
    잰수 += (await 지키나('close_document', { doc_id }, 방)).잰수;
    fs.rmSync(낼곳, { force: true });
    // create 2 + compose 2 + edit 2 + save 1 + close 1 = 8
    expect(잰수, '잰 열쇠 수가 달라졌다 — 어느 도구의 required 가 바뀌었나').toBe(8);
  });
});

describe('판 번호가 갈라지지 않는다', () => {
  /**
   * `package.json` 은 0.4.0 인데 서버는 클라이언트에게 **0.1.0 이라고 말하고 있었다.**
   * 판이 두 군데 따로 적혀 있었기 때문이다.
   *
   * 짜서 깔아 보는 갈래가 「서버 판 0.1.0」 을 찍어 줘서 알았다.
   * 그 갈래는 vitest 밖에 있어서, 고장을 내도 낱개 시험은 다 통과했다 —
   * **재는 자리와 고친 자리가 달랐다.** 그래서 여기로 옮겨 온다.
   */
  it('**서버가 말하는 판이 package.json 과 같다**', () => {
    const 적힌것 = JSON.parse(
      fs.readFileSync(path.join(뿌리, 'package.json'), 'utf8'),
    ) as { name: string; version: string };
    expect(서버판, '판이 두 군데 따로 적혀 있으면 갈라진다').toBe(적힌것.version);
    expect(서버이름).toBe(적힌것.name);
  });

  it('못 읽었을 때 그럴듯한 수를 지어내지 않는다', () => {
    // 0.0.0 이면 「못 읽었다」 가 눈에 보인다. 0.1.0 같은 수를 넣으면 갈라진 것을 못 알아본다.
    expect(서버판).not.toBe('0.0.0');
    expect(서버판).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('판 읽기가 묶는 방식에 안 흔들린다', () => {
  /**
   * 판 읽기가 `import.meta.url` 하나에 걸려 있었다.
   * **CJS 로 묶으면 그게 없다** — esbuild 는 `import.meta` 를 빈 객체로 바꾼다.
   * 그러면 `fileURLToPath(undefined)` 가 던지고 걷기가 시작도 못 한다.
   *
   * 앱에 번들해 넣은 쪽에서 **바로 옆에 package.json 이 있는데도**
   * 서버가 자기를 `0.0.0` 이라 말했다. 재현해서 확인했다.
   *
   * 이제 `__dirname` 으로도 자리를 찾는다.
   */
  it('놓인 자리를 찾는다', () => {
    expect(놓인자리(), '자리를 못 찾으면 판을 영영 못 읽는다').toBeTypeOf('string');
  });

  it('**시작 자리를 밖에서 줘도 읽는다** (번들이 어디 놓이든)', () => {
    const 뿌리판 = JSON.parse(
      fs.readFileSync(path.join(뿌리, 'package.json'), 'utf8'),
    ) as { version: string };
    // 깊은 자리에서 시작해도 위로 걸어 찾는다
    expect(판읽기(path.join(뿌리, 'packages', 'server', 'src'))).toBe(뿌리판.version);
    // 바로 그 자리에 있어도 찾는다 — 번들은 package.json 옆에 놓인다
    expect(판읽기(뿌리)).toBe(뿌리판.version);
  });

  it('**자리를 못 찾으면 0.0.0 이다** — 그럴듯한 수를 지어내지 않는다', () => {
    // 지어내면 갈라진 것을 못 알아본다. 실제로 이 대체값 덕에 번들에서 죽은 걸 알았다.
    expect(판읽기(undefined)).toBe('0.0.0');
    expect(판읽기(os.tmpdir())).toBe('0.0.0');
  });

  it('**이름이 다른 package.json 은 안 읽는다** (남의 판을 제 판이라 하지 않는다)', () => {
    const 방 = fs.mkdtempSync(path.join(os.tmpdir(), '판시험-'));
    fs.writeFileSync(path.join(방, 'package.json'),
      JSON.stringify({ name: '남의것', version: '9.9.9' }), 'utf8');
    expect(판읽기(방), '이름을 안 보면 옆에 놓인 아무 package.json 이나 읽는다').toBe('0.0.0');
    fs.rmSync(방, { recursive: true, force: true });
  });

  it('뿌리에 닿으면 멈춘다 (끝없이 안 걷는다)', () => {
    expect(판읽기(path.parse(뿌리).root)).toBe('0.0.0');
  });
});
