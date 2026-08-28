/**
 * 파서가 정말 일을 하는지, 그리고 **왕복 검사가 고장을 잡는지** 확인한다.
 *
 * 왕복 시험이 첫 시도에 통과했다. 그럴수록 의심해야 한다.
 * 파서가 아무것도 안 하고 원본을 그대로 뱉어도 왕복은 통과하기 때문이다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  attrRaw, childElements, childrenNamed, firstChildNamed,
  markDirty, parseXml, serializeXml,
  type ElementNode,
} from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');

function 요소수(el: ElementNode): number {
  let n = 1;
  for (const c of el.children) if (c.kind === 'element') n += 요소수(c);
  return n;
}

function 깊이(el: ElementNode): number {
  let d = 0;
  for (const c of el.children) if (c.kind === 'element') d = Math.max(d, 깊이(c));
  return d + 1;
}

describe('파서가 실제로 나무를 만든다', () => {
  it('요소·속성·자식을 제대로 읽는다', () => {
    const doc = parseXml(
      `<?xml version="1.0"?><a x="1" y='2'><b/><c>글</c><!--주석--></a>`
    );
    expect(doc.root.name).toBe('a');
    expect(doc.root.attrs.map((v) => v.name)).toEqual(['x', 'y']);
    expect(attrRaw(doc.root, 'y')).toBe('2');
    expect(doc.root.attrs[1]!.quote).toBe("'");     // 홑따옴표를 기억한다

    const kids = childElements(doc.root);
    expect(kids.map((k) => k.name)).toEqual(['b', 'c']);
    expect(kids[0]!.selfClosing).toBe(true);
    expect(kids[1]!.selfClosing).toBe(false);
    expect(doc.root.children.some((c) => c.kind === 'comment')).toBe(true);
  });

  it('이름이 겹치는 태그를 헷갈리지 않는다', () => {
    // 지금 쓰는 MCP 가 반복해서 물린 함정.
    // 정규식이 <hp:p> 를 찾다가 <hp:pic> 을 물었다.
    const doc = parseXml('<hp:p><hp:pic/><hp:pos/></hp:p>');
    const kids = childElements(doc.root);
    expect(doc.root.name).toBe('hp:p');
    expect(kids.map((k) => k.name)).toEqual(['hp:pic', 'hp:pos']);
    expect(childrenNamed(doc.root, 'hp:p')).toHaveLength(0);
  });

  it('같은 이름이 겹쳐 있어도 짝을 맞춘다', () => {
    const doc = parseXml('<p><p><p>속</p></p><q/></p>');
    expect(깊이(doc.root)).toBe(3);
    expect(childElements(doc.root).map((k) => k.name)).toEqual(['p', 'q']);
  });

  it('실제 문서를 통째로 읽는다 (겉핥기가 아니다)', () => {
    const file = path.join(뿌리, '자료', '기준파일', 'ref-table-basic.hwpx');
    expect(fs.existsSync(file)).toBe(true);

    // zip 없이 읽기 위해 시험용으로 header.xml 만 꺼낸다
    const parts = 부품들(file);
    const sec = parts.find((p) => /section0\.xml$/.test(p.name))!;
    const doc = parseXml(sec.text);

    expect(doc.root.name).toBe('hs:sec');
    expect(요소수(doc.root)).toBeGreaterThan(50);
    expect(깊이(doc.root)).toBeGreaterThan(5);

    // 표가 실제로 나무에 들어 있나
    const 표 = 모두찾기(doc.root, 'hp:tbl');
    expect(표).toHaveLength(1);
    expect(attrRaw(표[0]!, 'rowCnt')).toBe('3');
    expect(모두찾기(표[0]!, 'hp:tc')).toHaveLength(9);
  });
});

describe('왕복 검사가 고장을 잡는다', () => {
  const 원본 = `<a x="1"   y='2'><b/><c>글 &amp; 글</c>\n  <d></d></a>`;

  it('손을 안 대면 그대로다', () => {
    expect(serializeXml(parseXml(원본))).toBe(원본);
  });

  it('속성 순서를 바꾸면 달라진다 — 검사가 잡아야 한다', () => {
    const doc = parseXml(원본);
    doc.root.attrs.reverse();
    markDirty(doc.root);
    expect(serializeXml(doc)).not.toBe(원본);
  });

  it('자기닫음을 풀면 달라진다 — 검사가 잡아야 한다', () => {
    const doc = parseXml(원본);
    const b = firstChildNamed(doc.root, 'b')!;
    b.selfClosing = false;
    markDirty(b);
    const 나온것 = serializeXml(doc);
    expect(나온것).toContain('<b></b>');
    expect(나온것).not.toBe(원본);
  });

  it('이스케이프를 풀면 달라진다 — 검사가 잡아야 한다', () => {
    const doc = parseXml(원본);
    const c = firstChildNamed(doc.root, 'c')!;
    const t = c.children[0]!;
    if (t.kind === 'text') { t.raw = t.raw.replace('&amp;', '&'); markDirty(t); }
    expect(serializeXml(doc)).not.toBe(원본);
  });

  it('공백을 다듬으면 달라진다 — 검사가 잡아야 한다', () => {
    const doc = parseXml(원본);
    doc.root.attrs[0]!.beforeName = ' ';
    doc.root.attrs[1]!.beforeName = ' ';
    markDirty(doc.root);
    expect(serializeXml(doc)).not.toBe(원본);
  });
});

describe('고친 자리만 바뀐다', () => {
  it('속성 하나를 바꿔도 나머지는 원본 그대로다', () => {
    const 원본 = `<a>\n  <b x="1"   y="2"/>\n  <c z='3'>글</c>\n</a>`;
    const doc = parseXml(원본);
    const b = firstChildNamed(doc.root, 'b')!;
    b.attrs[0]!.raw = '9';
    markDirty(b);

    const 나온것 = serializeXml(doc);
    expect(나온것).toBe(`<a>\n  <b x="9"   y="2"/>\n  <c z='3'>글</c>\n</a>`);
    //                          ↑ 여기만 바뀌고 공백·홑따옴표는 그대로
  });
});

// ── 시험용 zip 읽기 (왕복.test.ts 와 같은 것) ─────────────────────────────
import * as zlib from 'node:zlib';

function 부품들(file: string): { name: string; text: string }[] {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('zip 이 아니다');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: { name: string; text: string }[] = [];

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    const lhNameLen = buf.readUInt16LE(localOff + 26);
    const lhExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    if (/\.(xml|hpf)$/i.test(name)) {
      const data = method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);
      out.push({ name, text: data.toString('utf8') });
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function 모두찾기(el: ElementNode, name: string): ElementNode[] {
  const out: ElementNode[] = [];
  const 훑기 = (n: ElementNode) => {
    for (const c of n.children) {
      if (c.kind !== 'element') continue;
      if (c.name === name) out.push(c);
      훑기(c);
    }
  };
  훑기(el);
  return out;
}
