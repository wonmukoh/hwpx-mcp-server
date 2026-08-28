/**
 * **조판이 할 줄 아는 것과, 도구 표면에 뚫린 것이 어긋나면 안 된다.**
 *
 * 실제로 어긋나 있었다. `compose` 는 `image` 블록을 다 만들어 놓았는데
 * 스키마에 `path` 자리가 없어서, 모델이 그림 경로를 주면
 * "모르는 인자다" 로 **거절당했다.** 있는 기능이 없는 기능이 된 것이다.
 *
 * 아홉 자리가 그렇게 막혀 있었다:
 *   path width height caption   ← image 블록이 통째로 못 쓰였다
 *   space_before space_after    ← 문단 사이 간격
 *   indent_left hanging         ← 개조식 내어쓰기
 *
 * 낱개 시험은 조판 층만 보고, 도구 시험은 스키마만 봤다.
 * **둘 사이의 틈은 아무도 안 봤다.** 그래서 이 시험이 있다.
 *
 * 재는 법: `블록.ts` 의 인터페이스 필드를 글에서 긁어 스키마와 견준다.
 * 타입은 돌 때 사라지니 소스를 읽는 수밖에 없다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { 도구들 } from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');

/**
 * `블록.ts` 의 **블록 인터페이스**에 적힌 필드 이름들.
 *
 * 이름이 `…블록` 인 것만 센다. `항목` 같은 속살 인터페이스는 뺀다 —
 * 그건 `blocks[].items[]` 안에 사는 것이 맞다.
 */
function 조판이아는것(): Set<string> {
  const 글 = fs.readFileSync(path.join(뿌리, 'packages', 'compose', 'src', '블록.ts'), 'utf8');
  const 나온것 = new Set<string>();
  for (const m of 글.matchAll(/export interface (\S+) \{([\s\S]*?)\n\}/g)) {
    if (!m[1]!.endsWith('블록')) continue;
    for (const f of m[2]!.matchAll(/^ {2}(\w+)\??:/gm)) 나온것.add(f[1]!);
  }
  나온것.delete('kind');   // 갈래는 enum 으로 따로 본다
  return 나온것;
}

/**
 * **블록 하나가 직접 받는** 필드 이름들 — `blocks[].properties` 만 본다.
 *
 * 처음엔 스키마 아무 데나 그 이름이 있으면 통과시켰다. 그랬더니
 * `italic` 을 실수로 `items[]` 안에 넣었는데 시험이 통과했다 —
 * 그러고도 모델은 `blocks[0].italic` 을 못 줬다.
 * **어디에 있느냐가 곧 쓸 수 있느냐다.**
 */
function 표면에뚫린것(): Set<string> {
  const s = 도구들.find((t) => t.name === 'compose')!.inputSchema as Record<string, unknown>;
  const blocks = (s['properties'] as Record<string, Record<string, unknown>>)['blocks']!;
  const 알맹이 = blocks['items'] as Record<string, unknown>;
  return new Set(Object.keys(알맹이['properties'] as Record<string, unknown>));
}

describe('조판이 아는 것은 도구 표면에도 뚫려 있어야 한다', () => {
  it('**블록 필드가 하나도 막혀 있지 않다**', () => {
    const 아는것 = 조판이아는것();
    const 뚫린것 = 표면에뚫린것();
    const 막힌것 = [...아는것].filter((f) => !뚫린것.has(f)).sort();

    // 막힌 것이 있으면 그 이름을 다 보여 준다 — 하나씩 찾게 하지 않는다
    expect(막힌것, `조판은 아는데 모델이 못 주는 것: ${막힌것.join(', ')}`).toEqual([]);
  });

  it('재는 자가 살아 있다 — 필드를 못 긁으면 이 시험은 헛돈다', () => {
    const 아는것 = 조판이아는것();
    // 늘 있는 것들이 안 잡히면 정규식이 깨진 것이다
    for (const 꼭있어야 of ['text', 'path', 'width', 'caption', 'hanging', 'space_before']) {
      expect(아는것.has(꼭있어야), `블록.ts 에서 ${꼭있어야} 를 못 긁었다`).toBe(true);
    }
    expect(아는것.size).toBeGreaterThan(15);
  });

  it('image 블록을 **진짜로** 부를 수 있다 (스키마에 자리가 있는 것과 다른 물음이다)', async () => {
    const { 도구부르기, 문서방 } = await import('../src/index.js');
    const { HwpxContainer } = await import('@hwpx/container');
    const os = await import('node:os');

    const 그림 = path.join(os.tmpdir(), 'hwpx-blocksurface.png');
    const c = HwpxContainer.open(fs.readFileSync(path.join(뿌리, '자료', '기준파일', 'ref-image.hwpx')));
    fs.writeFileSync(그림, c.read('BinData/image1.png'));

    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방))
      .structuredContent!['doc_id'] as string;
    const r = await 도구부르기('compose', {
      doc_id,
      blocks: [{ kind: 'image', path: 그림, width: 120, caption: '〈그림 1〉 시험' }],
    }, 방);

    expect(r.isError, r.content[0]?.text).toBeUndefined();
  });
});
