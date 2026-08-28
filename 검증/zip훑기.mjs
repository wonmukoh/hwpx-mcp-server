/**
 * 한글이 만드는 zip 이 실제로 어떤 모양인지 잰다.
 *
 * 추측하지 않는다. 압축 방식·순서·플래그·여분 필드·타임스탬프를 세어 본다.
 * 이걸 알아야 '고치지 않은 부품은 원본 그대로' 를 할 수 있다.
 *
 *   node zip훑기.mjs 목록파일
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

function 읽기(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) return null;

  const 항목수 = buf.readUInt16LE(eocd + 10);
  const 주석길이 = buf.readUInt16LE(eocd + 20);
  let p = buf.readUInt32LE(eocd + 16);
  const 중앙시작 = p;
  const 항목 = [];

  for (let i = 0; i < 항목수 && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const e = {
      순서: i,
      versionMadeBy: buf.readUInt16LE(p + 4),
      versionNeeded: buf.readUInt16LE(p + 6),
      flags: buf.readUInt16LE(p + 8),
      method: buf.readUInt16LE(p + 10),
      modTime: buf.readUInt16LE(p + 12),
      modDate: buf.readUInt16LE(p + 14),
      crc: buf.readUInt32LE(p + 16),
      compSize: buf.readUInt32LE(p + 20),
      uncompSize: buf.readUInt32LE(p + 24),
      nameLen: buf.readUInt16LE(p + 28),
      extraLenCentral: buf.readUInt16LE(p + 30),
      commentLen: buf.readUInt16LE(p + 32),
      diskStart: buf.readUInt16LE(p + 34),
      internalAttrs: buf.readUInt16LE(p + 36),
      externalAttrs: buf.readUInt32LE(p + 38),
      localOff: buf.readUInt32LE(p + 42),
    };
    e.name = buf.toString('utf8', p + 46, p + 46 + e.nameLen);

    // 지역 헤더
    const lo = e.localOff;
    e.localSig = buf.readUInt32LE(lo);
    e.localFlags = buf.readUInt16LE(lo + 6);
    e.localMethod = buf.readUInt16LE(lo + 8);
    e.localCrc = buf.readUInt32LE(lo + 14);
    e.localCompSize = buf.readUInt32LE(lo + 18);
    e.localNameLen = buf.readUInt16LE(lo + 26);
    e.extraLenLocal = buf.readUInt16LE(lo + 28);
    e.dataStart = lo + 30 + e.localNameLen + e.extraLenLocal;

    항목.push(e);
    p += 46 + e.nameLen + e.extraLenCentral + e.commentLen;
  }

  return { 파일크기: buf.length, 항목, 중앙시작, eocd, 주석길이 };
}

const 목록파일 = process.argv[2];
const 파일들 = fs.readFileSync(목록파일, 'utf8').split('\n')
  .map((s) => s.trim()).filter((s) => s && fs.existsSync(s));

const 통계 = {
  압축방식: new Map(),
  플래그: new Map(),
  여분지역: new Map(),
  여분중앙: new Map(),
  makeBy: new Map(),
  첫항목: new Map(),
  mimetype압축: new Map(),
  BinData압축: new Map(),
  타임스탬프: new Set(),
  주석있음: 0,
  데이터서술자: 0,
  지역중앙불일치: [],
};

let 문서 = 0, 총항목 = 0;

for (const file of 파일들) {
  const z = 읽기(file);
  if (!z) continue;
  문서++;
  const 이름 = path.basename(file);

  통계.첫항목.set(z.항목[0]?.name ?? '(없음)', (통계.첫항목.get(z.항목[0]?.name ?? '(없음)') ?? 0) + 1);
  if (z.주석길이 > 0) 통계.주석있음++;

  for (const e of z.항목) {
    총항목++;
    const m = e.method === 0 ? 'STORE' : e.method === 8 ? 'DEFLATE' : String(e.method);
    통계.압축방식.set(m, (통계.압축방식.get(m) ?? 0) + 1);
    통계.플래그.set(e.flags, (통계.플래그.get(e.flags) ?? 0) + 1);
    통계.여분지역.set(e.extraLenLocal, (통계.여분지역.get(e.extraLenLocal) ?? 0) + 1);
    통계.여분중앙.set(e.extraLenCentral, (통계.여분중앙.get(e.extraLenCentral) ?? 0) + 1);
    통계.makeBy.set(e.versionMadeBy, (통계.makeBy.get(e.versionMadeBy) ?? 0) + 1);
    통계.타임스탬프.add(`${e.modDate}:${e.modTime}`);

    if (e.flags & 0x08) 통계.데이터서술자++;
    if (e.name === 'mimetype') 통계.mimetype압축.set(m, (통계.mimetype압축.get(m) ?? 0) + 1);
    if (e.name.startsWith('BinData/') && !e.name.endsWith('/')) {
      통계.BinData압축.set(m, (통계.BinData압축.get(m) ?? 0) + 1);
    }

    // 지역 헤더와 중앙 디렉터리가 어긋나는가
    if (!(e.flags & 0x08)) {
      if (e.localCrc !== e.crc || e.localCompSize !== e.compSize || e.localMethod !== e.method) {
        통계.지역중앙불일치.push(`${이름} / ${e.name}`);
      }
    }
  }
}

const 보기 = (m, n = 6) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
  .map(([k, v]) => `${k}:${v}`).join('  ');

console.log(`문서 ${문서}편 / 항목 ${총항목}개\n`);
console.log(`압축 방식     ${보기(통계.압축방식)}`);
console.log(`mimetype      ${보기(통계.mimetype압축)}`);
console.log(`BinData       ${보기(통계.BinData압축)}`);
console.log(`첫 항목       ${보기(통계.첫항목, 3)}`);
console.log(`일반목적 플래그 ${보기(통계.플래그)}`);
console.log(`여분 필드(지역) ${보기(통계.여분지역)}`);
console.log(`여분 필드(중앙) ${보기(통계.여분중앙)}`);
console.log(`versionMadeBy  ${보기(통계.makeBy)}`);
console.log(`서로 다른 타임스탬프 ${통계.타임스탬프.size}가지`);
console.log(`데이터 서술자 쓰는 항목 ${통계.데이터서술자}개`);
console.log(`zip 주석 있는 문서 ${통계.주석있음}편`);
console.log(`지역/중앙 헤더 불일치 ${통계.지역중앙불일치.length}건`);
for (const s of 통계.지역중앙불일치.slice(0, 5)) console.log(`   ${s}`);

// 한 편의 항목 순서를 그대로 보여 준다
const 표본 = 파일들.find((f) => /교육부-2026업무계획/.test(f)) ?? 파일들[0];
const z = 읽기(표본);
console.log(`\n--- ${path.basename(표본)} 항목 순서 ---`);
for (const e of z.항목) {
  const m = e.method === 0 ? 'STORE  ' : 'DEFLATE';
  console.log(`  ${String(e.순서).padStart(2)} ${m} ${String(e.uncompSize).padStart(8)} → ${String(e.compSize).padStart(8)}  ${e.name}`);
}
