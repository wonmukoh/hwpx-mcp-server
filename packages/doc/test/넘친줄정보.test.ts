/**
 * **한글 2024 가 안 여는 줄 정보를 저장할 때 지운다.**
 *
 * 한글 2024(13.0)는 문단 하나라도 lineseg `textpos` 가 그 문단 글 길이를 넘으면 파일을
 * 아예 안 연다 (2026-11-05, `자료/실측.md` 38). 남이 만든 양식이 이미 그렇게 넘쳐 있으면
 * 우리는 그대로 내보냈다. 이제 저장 길목에서 그 문단의 줄 정보만 지운다.
 *
 * 지킬 것 셋:
 * - 넘친 문단의 줄 정보는 지운다 — 표 칸 안 문단까지
 * - **그 문단만** 지운다. 나머지 줄 정보는 그대로다
 * - 멀쩡한 파일은 바이트가 그대로다 — 한 칸 넘는 것(`길이 + 1`)은 한글이 열므로 멀쩡한 것이다
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HwpxContainer } from '@hwpx/container';
import { parseXml, serializeXml, findAll, childrenNamed, getAttr, setAttr, type ElementNode } from '@hwpx/owpml';
import { 문서 } from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');
const 기준파일 = path.join(뿌리, '자료', '기준파일');

/** 글만 든 문단의 글자 수 — 글 아닌 것이 섞였으면 undefined */
function 글만든문단길이(p: ElementNode): number | undefined {
  let n = 0;
  for (const r of childrenNamed(p, 'hp:run')) {
    for (const c of r.children) {
      if (c.kind !== 'element') continue;
      if (c.name !== 'hp:t') return undefined;
      for (const t of c.children) {
        if (t.kind !== 'text' || t.raw.includes('&')) return undefined;
        n += [...t.raw].length;
      }
    }
  }
  return n;
}

function 줄정보든문단수(바이트: Buffer): number {
  const c = HwpxContainer.open(바이트);
  let n = 0;
  for (const s of c.sectionNames()) {
    for (const p of findAll(parseXml(c.readText(s)).root, 'hp:p')) {
      if (childrenNamed(p, 'hp:linesegarray').length) n++;
    }
  }
  return n;
}

/**
 * 기준 파일에서 **글만 든 문단** 하나를 골라 마지막 줄의 textpos 를 `글길이 + 넘침` 으로 바꾼다.
 * `칸안` 이면 표 칸 안 문단을 고른다.
 */
function 심기(이름: string, 넘침: number, 칸안 = false): { 바이트: Buffer; 글: string } {
  const c = HwpxContainer.open(fs.readFileSync(path.join(기준파일, 이름)));
  const s = c.sectionNames()[0]!;
  const doc = parseXml(c.readText(s));
  for (const p of findAll(doc.root, 'hp:p')) {
    const 안인가 = (() => { for (let e = p.parent; e; e = e.parent) if (e.name === 'hp:tc') return true; return false; })();
    if (안인가 !== 칸안) continue;
    const L = 글만든문단길이(p);
    if (L === undefined || L === 0) continue;
    const segs = childrenNamed(p, 'hp:linesegarray').flatMap((a) => childrenNamed(a, 'hp:lineseg'));
    if (!segs.length) continue;
    setAttr(segs[segs.length - 1]!, 'textpos', String(L + 넘침));
    c.writeText(s, serializeXml(doc));
    c.mimetype바로잡기();
    const 글 = findAll(p, 'hp:t').map((t) => t.children.map((x) => (x.kind === 'text' ? x.raw : '')).join('')).join('');
    return { 바이트: c.save(), 글 };
  }
  throw new Error(`${이름} 에 줄 정보 든 글 문단이 없다 — 시험을 다시 짜라`);
}

describe('넘친 줄 정보를 저장할 때 지운다', () => {
  it('글보다 둘 넘게 뒤를 가리키는 문단의 줄 정보를 지운다 — 그 문단만', () => {
    const { 바이트, 글 } = 심기('ref-text-basic.hwpx', 2);
    const 전 = 줄정보든문단수(바이트);
    const d = 문서.열기(바이트);
    expect(d.dirty).toBe(false);
    const 낸것 = d.저장();
    expect(d.지운넘친줄정보).toBe(1);
    expect(줄정보든문단수(낸것)).toBe(전 - 1);

    // 그 문단은 글이 그대로이고 줄 정보만 없다
    const c = HwpxContainer.open(낸것);
    const 그문단 = c.sectionNames().flatMap((s) => findAll(parseXml(c.readText(s)).root, 'hp:p'))
      .find((p) => findAll(p, 'hp:t').map((t) => t.children.map((x) => (x.kind === 'text' ? x.raw : '')).join('')).join('') === 글);
    expect(그문단).toBeDefined();
    expect(childrenNamed(그문단!, 'hp:linesegarray')).toHaveLength(0);

    // 다시 열어 저장하면 더 지울 것이 없다
    const d2 = 문서.열기(낸것);
    expect(d2.저장().equals(낸것)).toBe(true);
    expect(d2.지운넘친줄정보).toBe(0);
  });

  it('표 칸 안 문단도 본다', () => {
    const { 바이트 } = 심기('ref-table-basic.hwpx', 50, true);
    const d = 문서.열기(바이트);
    const 낸것 = d.저장();
    expect(d.지운넘친줄정보).toBe(1);
    expect(줄정보든문단수(낸것)).toBe(줄정보든문단수(바이트) - 1);
  });

  it('**한 칸 넘는 것은 그대로 둔다** — 한글이 연다', () => {
    const { 바이트 } = 심기('ref-text-basic.hwpx', 1);
    const d = 문서.열기(바이트);
    expect(d.저장().equals(바이트)).toBe(true);
    expect(d.지운넘친줄정보).toBe(0);
  });

  it('글을 고치고 저장해도 지운다 (고친 것과 함께)', () => {
    const { 바이트, 글 } = 심기('ref-text-basic.hwpx', 30);
    const d = 문서.열기(바이트);
    d.ID매기기();
    const 첫 = d.구역들[0]!.모든문단들.find((p) => p.글.length > 0 && p.글 !== 글)!;
    expect(d.글바꾸기(d.이름표.아이디(첫.el), '바꾼 글').ok).toBe(true);
    d.저장();
    expect(d.지운넘친줄정보).toBe(1);
  });

  it('기준 파일과 공개 표본은 지울 것이 없고 바이트가 그대로다', () => {
    const 파일들 = [
      ...fs.readdirSync(기준파일).filter((x) => x.endsWith('.hwpx')).map((x) => path.join(기준파일, x)),
      ...['공개', '로컬'].flatMap((갈래) => {
        const 곳 = path.join(뿌리, '자료', '표본', 갈래);
        return fs.existsSync(곳) ? fs.readdirSync(곳).filter((x) => x.endsWith('.hwpx')).map((x) => path.join(곳, x)) : [];
      }),
    ];
    expect(파일들.length).toBeGreaterThan(20);
    for (const f of 파일들) {
      const 바이트 = fs.readFileSync(f);
      const d = 문서.열기(바이트);
      expect(d.저장().equals(바이트), path.basename(f)).toBe(true);
      expect(d.지운넘친줄정보, path.basename(f)).toBe(0);
    }
  });
});
