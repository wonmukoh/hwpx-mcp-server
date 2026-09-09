import { describe, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findAll, textOf, getAttr } from '@hwpx/owpml';
import { 도구부르기, 문서방 } from '../src/index.js';
import { 문서 } from '@hwpx/doc';

describe('훑기', () => {
  it('shape 에 text 를 주면 어디로 가나', async () => {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('create_document', {}, 방)).structuredContent!['doc_id'] as string;
    const r = await 도구부르기('compose', { doc_id, blocks: [
      { kind: 'shape', text: '상자 안 글', width: 300, height: 60, background: '#F2F5F9' },
    ] }, 방);
    console.log('  compose:', r.isError ? '✗ ' + (r.content[0]?.text ?? '').slice(0, 90) : '○');
    if (r.isError) return;

    const 낼곳 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hwpx-box-')), 'x.hwpx');
    await 도구부르기('save_document', { doc_id, path: 낼곳 }, 방);
    const d = 문서.열기(fs.readFileSync(낼곳));

    const rects = findAll(d.구역들[0]!.root, 'hp:rect');
    console.log('  hp:rect', rects.length, '개');
    for (const rect of rects) {
      const 자식 = (rect as any).children.filter((c: any) => c.name).map((c: any) => c.name);
      console.log('   자식 차례:', 자식.join(' → '));
      const dt = findAll(rect, 'hp:drawText');
      console.log('   hp:drawText', dt.length, '개');
      if (dt.length) {
        const 글 = findAll(dt[0]!, 'hp:t').map((t) => textOf(t)).join('');
        console.log('   상자 안 글: «' + 글 + '»');
        console.log('   vertAlign:', getAttr(findAll(dt[0]!, 'hp:subList')[0]!, 'vertAlign'));
      }
    }
    const 바깥글 = d.구역들[0]!.문단들.map((p) => p.글).filter((x) => x.trim());
    console.log('  바깥 문단 글:', JSON.stringify(바깥글));
    console.log('  낼곳:', 낼곳);
  });
});
