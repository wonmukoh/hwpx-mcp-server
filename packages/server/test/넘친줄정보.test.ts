/**
 * **save_document 는 한글 2024 가 안 열던 파일을 고쳤다는 것을 말한다.**
 *
 * 저장할 때 글보다 뒤를 가리키는 줄 정보를 지운다 (`@hwpx/doc` `넘친줄정보지우기`).
 * 조용히 고치면 사용자는 「원본이 안 열리던 파일」이었다는 것을 모른다 — 수와 말로 알린다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { HwpxContainer } from '@hwpx/container';
import { parseXml, serializeXml, findAll, childrenNamed, setAttr } from '@hwpx/owpml';
import { 도구부르기, 문서방 } from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');

/** 첫 줄 정보 든 문단의 마지막 줄을 글 한참 뒤(9999)로 보낸 파일 */
function 넘친파일(): string {
  const c = HwpxContainer.open(fs.readFileSync(path.join(뿌리, '자료', '기준파일', 'ref-text-basic.hwpx')));
  const s = c.sectionNames()[0]!;
  const doc = parseXml(c.readText(s));
  const p = findAll(doc.root, 'hp:p').find((x) => childrenNamed(x, 'hp:linesegarray').length > 0)!;
  const segs = childrenNamed(childrenNamed(p, 'hp:linesegarray')[0]!, 'hp:lineseg');
  setAttr(segs[segs.length - 1]!, 'textpos', '9999');
  c.writeText(s, serializeXml(doc));
  c.mimetype바로잡기();
  const 파일 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), '넘친줄-')), '넘친.hwpx');
  fs.writeFileSync(파일, c.save());
  return 파일;
}

describe('save_document — 넘친 줄 정보', () => {
  it('**지운 수를 lineseg_cleared 로, 말로도 알린다**', async () => {
    const 방 = new 문서방();
    const doc_id = (await 도구부르기('open_document', { path: 넘친파일() }, 방)).structuredContent!['doc_id'] as string;
    const 낼곳 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), '넘친줄-')), '낸것.hwpx');
    const r = await 도구부르기('save_document', { doc_id, path: 낼곳 }, 방);
    expect(r.structuredContent!['ok']).toBe(true);
    expect(r.structuredContent!['lineseg_cleared']).toBe(1);
    expect(r.content[0]?.text ?? '').toContain('한글 2024 에서 안 열리는');
  });

  it('멀쩡한 파일이면 말하지 않는다', async () => {
    const 방 = new 문서방();
    const 원래 = path.join(뿌리, '자료', '기준파일', 'ref-text-basic.hwpx');
    const doc_id = (await 도구부르기('open_document', { path: 원래 }, 방)).structuredContent!['doc_id'] as string;
    const 낼곳 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), '넘친줄-')), '낸것.hwpx');
    const r = await 도구부르기('save_document', { doc_id, path: 낼곳 }, 방);
    expect(r.structuredContent!['lineseg_cleared']).toBeUndefined();
    expect(r.content[0]?.text ?? '').not.toContain('한글 2024');
    expect(fs.readFileSync(낼곳).equals(fs.readFileSync(원래))).toBe(true);
  });
});
