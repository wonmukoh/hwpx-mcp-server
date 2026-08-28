/**
 * zip 컨테이너. **고치지 않은 부품은 원본 압축 바이트를 그대로 쓴다.**
 *
 * 왜 직접 쓰나:
 *   보통 zip 라이브러리로는 왕복 무손실이 안 된다. 다시 압축하면
 *   deflate 구현이 달라 바이트가 달라지고, 타임스탬프·플래그·순서도 바뀐다.
 *   XML 계층에서 쓴 것과 같은 수법을 쓴다 — 안 건드린 것은 원본 조각 그대로.
 *
 * 실측(문서 113편 / 항목 1396개)으로 알아낸 한글 zip 의 성질:
 *   - `mimetype` 이 **언제나 첫 항목이고 STORE** (113/113)
 *   - 여분 필드(extra field) 가 **하나도 없다**
 *   - 데이터 서술자를 **안 쓴다**
 *   - 지역 헤더와 중앙 디렉터리가 **어긋나지 않는다**
 *   - 그림은 형식에 따라 갈린다 — 아래 `압축방식정하기` 참고
 */

import * as zlib from 'node:zlib';

// ── CRC-32 ────────────────────────────────────────────────────────────────
const CRC표 = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

export function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = CRC표[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

// ── 항목 ──────────────────────────────────────────────────────────────────

export const STORE = 0;
export const DEFLATE = 8;

export interface ZipEntry {
  name: string;
  method: number;
  /** 일반 목적 플래그. 원본 그대로 보존한다 */
  flags: number;
  modTime: number;
  modDate: number;
  crc: number;
  compSize: number;
  uncompSize: number;
  versionMadeBy: number;
  versionNeeded: number;
  internalAttrs: number;
  externalAttrs: number;
  /** 지역 헤더의 여분 필드 (한글 문서엔 없지만 남의 것을 지키려면 보존해야 한다) */
  extraLocal: Buffer;
  extraCentral: Buffer;
  comment: Buffer;
  /** 원본의 **압축된** 바이트. 안 고쳤으면 이걸 그대로 쓴다 */
  compressed: Buffer;
  /** 압축을 푼 내용. 필요할 때 한 번만 푼다 */
  plainCache?: Buffer;
  dirty: boolean;
}

export interface ZipArchive {
  entries: ZipEntry[];
  /** 이름 → 항목 */
  byName: Map<string, ZipEntry>;
  /** zip 전체 주석 */
  comment: Buffer;
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

// ── 읽기 ──────────────────────────────────────────────────────────────────

/** 중앙 디렉터리 끝(EOCD)을 찾는다 */
function findEocd(buf: Buffer): number {
  const 최소 = Math.max(0, buf.length - 66_000);
  for (let i = buf.length - 22; i >= 최소; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

export function readZip(buf: Buffer): ZipArchive {
  const eocd = findEocd(buf);
  if (eocd === -1) throw new ZipError('zip 이 아니다 (중앙 디렉터리 끝을 못 찾음)');

  const 항목수 = buf.readUInt16LE(eocd + 10);
  const 중앙시작 = buf.readUInt32LE(eocd + 16);
  const 주석길이 = buf.readUInt16LE(eocd + 20);
  const comment = Buffer.from(buf.subarray(eocd + 22, eocd + 22 + 주석길이));

  const entries: ZipEntry[] = [];
  const byName = new Map<string, ZipEntry>();
  let p = 중앙시작;

  for (let i = 0; i < 항목수; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) {
      throw new ZipError(`중앙 디렉터리 ${i}번째 항목이 깨졌다`);
    }

    const versionMadeBy = buf.readUInt16LE(p + 4);
    const versionNeeded = buf.readUInt16LE(p + 6);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const modTime = buf.readUInt16LE(p + 12);
    const modDate = buf.readUInt16LE(p + 14);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const internalAttrs = buf.readUInt16LE(p + 36);
    const externalAttrs = buf.readUInt32LE(p + 38);
    const localOff = buf.readUInt32LE(p + 42);

    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const extraCentral = Buffer.from(buf.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen));
    const entryComment = Buffer.from(
      buf.subarray(p + 46 + nameLen + extraLen, p + 46 + nameLen + extraLen + commentLen)
    );

    // 지역 헤더에서 자료가 어디서 시작하는지 구한다
    if (buf.readUInt32LE(localOff) !== 0x04034b50) {
      throw new ZipError(`${name}: 지역 헤더가 깨졌다`);
    }
    const lhNameLen = buf.readUInt16LE(localOff + 26);
    const lhExtraLen = buf.readUInt16LE(localOff + 28);
    const extraLocal = Buffer.from(
      buf.subarray(localOff + 30 + lhNameLen, localOff + 30 + lhNameLen + lhExtraLen)
    );
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
    const compressed = Buffer.from(buf.subarray(dataStart, dataStart + compSize));

    const e: ZipEntry = {
      name, method, flags, modTime, modDate, crc, compSize, uncompSize,
      versionMadeBy, versionNeeded, internalAttrs, externalAttrs,
      extraLocal, extraCentral, comment: entryComment,
      compressed, dirty: false,
    };
    entries.push(e);
    byName.set(name, e);

    p += 46 + nameLen + extraLen + commentLen;
  }

  return { entries, byName, comment };
}

// ── 내용 읽고 쓰기 ────────────────────────────────────────────────────────

/** 항목의 내용을 푼다 (한 번 풀면 기억한다) */
export function entryData(e: ZipEntry): Buffer {
  if (e.plainCache) return e.plainCache;
  let out: Buffer;
  if (e.method === STORE) {
    out = e.compressed;
  } else if (e.method === DEFLATE) {
    out = zlib.inflateRawSync(e.compressed);
  } else {
    throw new ZipError(`${e.name}: 모르는 압축 방식 ${e.method}`);
  }
  e.plainCache = out;
  return out;
}

/**
 * 그림을 넣을 때 어떤 압축 방식을 쓸까.
 *
 * 실측(문서 113편)이 답을 줬다:
 *   jpg 57 STORE / 0 DEFLATE      png 41 STORE / 0 DEFLATE
 *   bmp  0 STORE / 26 DEFLATE     wmf  0 STORE / 1 DEFLATE
 *
 * 규칙은 '한글이 압축을 못 읽는다' 가 아니라
 * **이미 압축된 형식은 그냥 담고, 아닌 형식은 압축한다** 이다.
 * (bmp 는 다시 압축하면 74% 가 줄어든다. jpg 는 줄지 않는다)
 */
export function 압축방식정하기(name: string): number {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  // 이미 압축된 형식
  if (['jpg', 'jpeg', 'png', 'gif', 'zip', 'jp2', 'webp'].includes(ext)) return STORE;
  return DEFLATE;
}

/** 항목 내용을 갈아 끼운다 */
export function setEntryData(e: ZipEntry, data: Buffer, method?: number): void {
  const m = method ?? e.method;
  e.plainCache = data;
  e.uncompSize = data.length;
  e.crc = crc32(data);
  e.method = m;
  e.compressed = m === STORE ? data : zlib.deflateRawSync(data, { level: 6 });
  e.compSize = e.compressed.length;
  e.dirty = true;
}

/** 새 항목을 만든다 */
export function createEntry(name: string, data: Buffer, method?: number): ZipEntry {
  const m = method ?? 압축방식정하기(name);
  const compressed = m === STORE ? data : zlib.deflateRawSync(data, { level: 6 });
  return {
    name, method: m,
    flags: m === DEFLATE ? 0x04 : 0,     // 한글이 쓰는 값 (압축 옵션 표시)
    modTime: 0, modDate: 0x21,           // 1980-01-01. 재현 가능하게 고정한다
    crc: crc32(data),
    compSize: compressed.length,
    uncompSize: data.length,
    versionMadeBy: 0x0b17,               // 실측에서 가장 흔한 값
    versionNeeded: 20,
    internalAttrs: 0, externalAttrs: 0,
    extraLocal: Buffer.alloc(0),
    extraCentral: Buffer.alloc(0),
    comment: Buffer.alloc(0),
    compressed, plainCache: data, dirty: true,
  };
}

// ── 쓰기 ──────────────────────────────────────────────────────────────────

export function writeZip(zip: ZipArchive): Buffer {
  const 조각: Buffer[] = [];
  const 중앙: Buffer[] = [];
  let 위치 = 0;

  for (const e of zip.entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(e.versionNeeded, 4);
    lh.writeUInt16LE(e.flags, 6);
    lh.writeUInt16LE(e.method, 8);
    lh.writeUInt16LE(e.modTime, 10);
    lh.writeUInt16LE(e.modDate, 12);
    lh.writeUInt32LE(e.crc, 14);
    lh.writeUInt32LE(e.compSize, 18);
    lh.writeUInt32LE(e.uncompSize, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(e.extraLocal.length, 28);

    조각.push(lh, nameBuf, e.extraLocal, e.compressed);
    const 지역위치 = 위치;
    위치 += 30 + nameBuf.length + e.extraLocal.length + e.compressed.length;

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(e.versionMadeBy, 4);
    ch.writeUInt16LE(e.versionNeeded, 6);
    ch.writeUInt16LE(e.flags, 8);
    ch.writeUInt16LE(e.method, 10);
    ch.writeUInt16LE(e.modTime, 12);
    ch.writeUInt16LE(e.modDate, 14);
    ch.writeUInt32LE(e.crc, 16);
    ch.writeUInt32LE(e.compSize, 20);
    ch.writeUInt32LE(e.uncompSize, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(e.extraCentral.length, 30);
    ch.writeUInt16LE(e.comment.length, 32);
    ch.writeUInt16LE(0, 34);                      // 디스크 번호
    ch.writeUInt16LE(e.internalAttrs, 36);
    ch.writeUInt32LE(e.externalAttrs, 38);
    ch.writeUInt32LE(지역위치, 42);

    중앙.push(ch, nameBuf, e.extraCentral, e.comment);
  }

  const 중앙시작 = 위치;
  const 중앙버퍼 = Buffer.concat(중앙);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);                       // 이 디스크 번호
  eocd.writeUInt16LE(0, 6);                       // 중앙 디렉터리 시작 디스크
  eocd.writeUInt16LE(zip.entries.length, 8);
  eocd.writeUInt16LE(zip.entries.length, 10);
  eocd.writeUInt32LE(중앙버퍼.length, 12);
  eocd.writeUInt32LE(중앙시작, 16);
  eocd.writeUInt16LE(zip.comment.length, 20);

  return Buffer.concat([...조각, 중앙버퍼, eocd, zip.comment]);
}
