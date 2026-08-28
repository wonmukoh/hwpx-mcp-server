/**
 * 왕복 무손실 시험 — 1단계의 **유일한 합격 기준**.
 *
 * 기준 파일과 실제 문서를 파싱했다가 다시 쓴다.
 * 바이트가 하나라도 다르면 실패다.
 *
 * 이게 안 되면 남의 문서를 열 수 없다. 열면 망가뜨린다.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { parseXml, serializeXml, type Node } from '../src/index.js';

const 뿌리 = path.resolve(__dirname, '../../..');
const 기준파일 = path.join(뿌리, '자료', '기준파일');
const 표본들 = [
  path.join(뿌리, '자료', '표본', '공개'),
  path.join(뿌리, '자료', '표본', '로컬'),
];

// ── zip 읽기 (의존성 없이) ────────────────────────────────────────────────
interface ZipEntry {
  name: string;
  data: Buffer;
}

function readZip(file: string): ZipEntry[] {
  const buf = fs.readFileSync(file);

  // 중앙 디렉터리 끝(EOCD) 찾기
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error(`zip 이 아니다: ${file}`);

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];

  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    // 지역 헤더에서 실제 자료 시작 위치를 구한다
    const lhNameLen = buf.readUInt16LE(localOff + 26);
    const lhExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    const data = method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);
    out.push({ name, data });

    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** 그 문서 안의 XML 부품들 */
function xmlParts(file: string): { name: string; text: string }[] {
  return readZip(file)
    .filter((e) => /\.(xml|hpf|rels)$/i.test(e.name) && e.data.length > 0)
    .map((e) => ({ name: e.name, text: e.data.toString('utf8') }));
}

function hwpxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.hwpx'))
    .map((f) => path.join(dir, f));
}

/** 어디서부터 달라지는지 짚어 준다 */
function 첫차이(a: string, b: string): string {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  if (i === n && a.length === b.length) return '(같다)';
  const 앞 = a.slice(Math.max(0, i - 60), i);
  return [
    `${i}번째 글자부터 다르다 (원본 ${a.length}자 / 다시 쓴 것 ${b.length}자)`,
    `  …${앞}`,
    `  원본  : ${JSON.stringify(a.slice(i, i + 80))}`,
    `  다시쓴: ${JSON.stringify(b.slice(i, i + 80))}`,
  ].join('\n');
}

// ── 시험 ──────────────────────────────────────────────────────────────────

describe('XML 왕복 — 손대지 않으면 바이트가 같아야 한다', () => {
  const 기준 = hwpxFiles(기준파일);
  const 표본 = 표본들.flatMap(hwpxFiles);

  it('기준 파일이 있어야 한다', () => {
    expect(기준.length).toBeGreaterThanOrEqual(20);
  });

  for (const file of [...기준, ...표본]) {
    const 이름 = path.basename(file);
    it(`${이름}`, () => {
      const parts = xmlParts(file);
      expect(parts.length).toBeGreaterThan(0);

      for (const { name, text } of parts) {
        let 다시: string;
        try {
          다시 = serializeXml(parseXml(text));
        } catch (e) {
          throw new Error(`${이름} / ${name} 파싱 실패:\n${(e as Error).message}`);
        }
        if (다시 !== text) {
          throw new Error(`${이름} / ${name} 왕복이 안 맞다:\n${첫차이(text, 다시)}`);
        }
      }
    });
  }
});

/**
 * 위 시험만으로는 **다시 쓰는 길을 한 번도 안 지나간다.**
 * 손 안 댄 노드는 원본 조각을 그대로 뱉으니 사실상 아무것도 시험하지 않는다.
 *
 * 그 틈으로 버그가 빠져나갔다: `name=""` 을 `name` 으로 써서 한글이 파일을 거부했다.
 * 802개 XML 부품 가운데 349개가 그 꼴이었는데 시험은 전부 통과라고 했다.
 *
 * 그래서 **전부 고친 것으로 표시하고** 다시 쓴다. 그래도 바이트가 같아야 한다.
 * 문서 하나하나, 요소 하나하나가 손으로 다시 쓰는 길을 밟는다.
 */
describe('XML 왕복 — 전부 고쳤다 치고 다시 써도 바이트가 같아야 한다', () => {
  const 기준 = hwpxFiles(기준파일);
  const 표본 = 표본들.flatMap(hwpxFiles);

  function 전부더럽히기(node: Node): void {
    node.dirty = true;
    if (node.kind === 'element') for (const c of node.children) 전부더럽히기(c);
  }

  for (const file of [...기준, ...표본]) {
    const 이름 = path.basename(file);
    it(`${이름}`, () => {
      for (const { name, text } of xmlParts(file)) {
        const doc = parseXml(text);
        for (const c of doc.children) 전부더럽히기(c);
        const 손으로 = serializeXml(doc);
        if (손으로 !== text) {
          throw new Error(`${이름} / ${name} 손으로 다시 쓰면 달라진다:\n${첫차이(text, 손으로)}`);
        }
      }
    });
  }

  it('빈 값과 값 없음을 가른다', () => {
    // 이 둘은 raw 만 보면 똑같다. 섞으면 한글이 파일을 거부한다.
    for (const 원본 of ['<a b=""/>', '<a b/>', "<a b=''/>", '<a b = "" />']) {
      const doc = parseXml(원본);
      for (const c of doc.children) 전부더럽히기(c);
      expect(serializeXml(doc)).toBe(원본);
    }
  });
});
