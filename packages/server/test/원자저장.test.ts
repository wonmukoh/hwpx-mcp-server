/**
 * **쓰다가 실패해도 원본이 그대로다** (2026-10-07 견딤성 검토).
 *
 * 디스크가 차거나 OneDrive 가 끊겨 **쓰는 도중** 실패하는 것을 흉내 낸다 — 이름에 「잘림」이
 * 든 파일에 쓰면 앞 10바이트만 쓰고 ENOSPC 로 던진다. 바로 덮어쓰면 원본이 잘려 남고,
 * 임시 파일에 썼다가 이름을 바꾸면 원본은 그대로다.
 */

import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('node:fs', async (가져오기) => {
  const 진짜 = await 가져오기<typeof import('node:fs')>();
  return {
    ...진짜,
    writeFileSync: ((p: fs.PathOrFileDescriptor, d: string | NodeJS.ArrayBufferView, o?: fs.WriteFileOptions) => {
      if (String(p).includes('잘림') && Buffer.isBuffer(d)) {
        진짜.writeFileSync(p, d.subarray(0, 10));
        throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
      }
      return 진짜.writeFileSync(p, d, o);
    }) as typeof fs.writeFileSync,
  };
});

const { 도구부르기, 문서방 } = await import('../src/index.js');

describe('원자적 저장', () => {
  it('**쓰는 도중 실패해도 원본이 바이트째 그대로다** — 자리 없음은 할 일로 말한다', async () => {
    const 뿌리 = path.resolve(__dirname, '../../..');
    const 원래 = path.join(뿌리, '자료', '표본', '공개', '교육부-2026대학혁신지원사업-보도자료.hwpx');
    const 파일 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), '원자-')), '잘림.hwpx');
    fs.copyFileSync(원래, 파일);
    const 원본 = fs.readFileSync(파일);

    const 방 = new 문서방();
    const doc_id = (await 도구부르기('open_document', { path: 파일 }, 방)).structuredContent!['doc_id'] as string;
    await 도구부르기('edit', { doc_id, edits: [{ op: 'replace', find: '교육부', replace: '교육청', limit: 1 }] }, 방);
    const r = await 도구부르기('save_document', { doc_id, overwrite: true }, 방);
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain('자리가 없다');
    expect(fs.readFileSync(파일).equals(원본)).toBe(true);
    expect(fs.readdirSync(path.dirname(파일))).toEqual(['잘림.hwpx']);
  });
});
