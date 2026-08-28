/**
 * 파서를 **넓게** 시험한다.
 *
 * 시험 코드에 넣은 32편이 통과했다고 파서가 옳은 것은 아니다.
 * 0단계에서 표본 한 편으로 일반화했다가 틀린 적이 있다.
 * 그래서 손에 닿는 문서를 전부 훑는다.
 *
 * 두 가지를 본다:
 *   가) 그대로 다시 쓰기 — 손 안 댄 노드는 원본 조각을 뱉으니 사실상 공짜다
 *   나) **전부 고쳤다 치고 다시 쓰기** — 여는 태그를 손으로 다시 짜는 길을 밟는다
 *
 * 나) 가 없으면 다시 쓰는 길은 한 번도 안 지나간다.
 * 실제로 그 틈으로 `name=""` 을 `name` 으로 쓰는 버그가 빠져나가 한글이 파일을 거부했다.
 *
 *   node 왕복훑기.mjs 목록파일
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 한글 경로가 섞이면 URL 을 손으로 다루면 안 된다. fileURLToPath 를 쓴다.
const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);

// tsx 없이 돌리려고 소스를 직접 읽어 쓴다 (파서는 의존성이 없다)
const { parseXml, serializeXml } = await import(
  pathToFileURL(path.join(뿌리, '검증', '.빌드', 'index.js')).href
);

function readZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66_000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) return null;

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
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
    if (/\.(xml|hpf|rels)$/i.test(name) && compSize > 0) {
      try {
        out.push({ name, text: (method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw)).toString('utf8') });
      } catch { /* 못 푸는 부품은 건너뛴다 */ }
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** 나무 전체를 고친 것으로 표시한다 — 다시 쓰는 길을 강제로 밟게 한다 */
/** 나무 전체를 고친 것으로 표시한다 — 다시 쓰는 길을 강제로 밟게 한다 */
function 전부더럽히기(node) {
  node.dirty = true;
  if (node.kind === 'element') for (const c of node.children) 전부더럽히기(c);
}

/**
 * 태그 짝이 맞나 — **우리 파서를 쓰지 않고** 센다.
 *
 * 파싱이 실패했을 때 우리 잘못인지 문서가 깨진 것인지 갈라야 한다.
 * 갈라 말하지 않으면 둘 중 하나를 놓친다: 남의 버그를 우리 것으로 떠안거나,
 * 우리 버그를 남 탓으로 덮거나.
 */
function 짝안맞는태그(xml) {
  const 셈 = new Map();
  for (const m of xml.matchAll(/<(\/?)([A-Za-z_][\w.:-]*)([^>]*?)(\/?)>/g)) {
    const [, 닫음, 이름, 속, 자기닫음] = m;
    if (자기닫음 || 속.trim().endsWith('/')) continue;
    const c = 셈.get(이름) ?? { 열림: 0, 닫힘: 0 };
    if (닫음) c.닫힘++; else c.열림++;
    셈.set(이름, c);
  }
  return [...셈].filter(([, c]) => c.열림 !== c.닫힘)
    .map(([이름, c]) => `${이름} 여는 것 ${c.열림}/닫는 것 ${c.닫힘}`);
}

function 첫차이(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return `${i}번째 글자 (원본 ${a.length} / 다시 ${b.length})\n` +
    `   원본  : ${JSON.stringify(a.slice(i, i + 100))}\n` +
    `   다시쓴: ${JSON.stringify(b.slice(i, i + 100))}`;
}

const 목록파일 = process.argv[2];
const 적힌것 = fs.readFileSync(목록파일, 'utf8').split('\n')
  .map((s) => s.trim()).filter(Boolean);

// 상대 경로면 집 폴더 기준으로도 찾아본다
function 찾기(p) {
  if (fs.existsSync(p)) return p;
  const 집 = path.join(os.homedir(), p);
  return fs.existsSync(집) ? 집 : null;
}
const 파일들 = 적힌것.map(찾기).filter(Boolean);
const 못찾음 = 적힌것.length - 파일들.length;
if (못찾음) console.log(`※ 목록 ${적힌것.length}줄 가운데 ${못찾음}개를 못 찾았다`);
if (파일들.length === 0) {
  // 0편을 훑고 '실패 0건' 이라 하면 검사가 거짓말을 하는 것이다
  console.error('훑을 문서가 하나도 없다. 이건 통과가 아니라 실패다.');
  process.exit(2);
}

let 문서 = 0, 부품 = 0, 글자 = 0;
const 실패 = [];
const 다시쓰기실패 = [];
const 깨진문서 = [];   // 우리 잘못이 아니라 문서가 규격을 어긴 것
const 시작 = Date.now();

for (const file of 파일들) {
  const parts = readZip(file);
  if (!parts) { 실패.push([path.basename(file), 'zip 아님']); continue; }
  문서++;
  for (const { name, text } of parts) {
    부품++;
    글자 += text.length;
    try {
      // 가) 그대로
      const 다시 = serializeXml(parseXml(text));
      if (다시 !== text) 실패.push([`${path.basename(file)} / ${name}`, 첫차이(text, 다시)]);

      // 나) 전부 고쳤다 치고
      const doc2 = parseXml(text);
      for (const c of doc2.children) 전부더럽히기(c);
      const 손으로 = serializeXml(doc2);
      if (손으로 !== text) 다시쓰기실패.push([`${path.basename(file)} / ${name}`, 첫차이(text, 손으로)]);
    } catch (e) {
      // 파싱이 실패했다. 우리 잘못인가, 문서가 깨진 것인가.
      const 짝 = 짝안맞는태그(text);
      const 자리 = `${path.basename(file)} / ${name}`;
      if (짝.length) 깨진문서.push([자리, `태그 짝이 안 맞는다: ${짝.join(
)}`]);
      else 실패.push([자리, `파싱 실패: ${e.message}`]);
    }
  }
}

const 초 = (Date.now() - 시작) / 1000;
console.log(`문서 ${문서}편 / XML 부품 ${부품}개 / ${(글자 / 1e6).toFixed(1)}백만 글자`);
console.log(`${초.toFixed(1)}초 — ${(글자 / 1e6 / 초).toFixed(1)}백만 글자/초`);
console.log(`가) 그대로 다시 쓰기            실패 ${실패.length}건`);
console.log(`나) 전부 고쳤다 치고 다시 쓰기  실패 ${다시쓰기실패.length}건`);
for (const [딱지, 목록] of [['가', 실패], ['나', 다시쓰기실패]]) {
  for (const [이름, 왜] of 목록.slice(0, 6)) console.log(`
✗ [${딱지}] ${이름}
   ${왜}`);
  if (목록.length > 6) console.log(`
… [${딱지}] 그 밖 ${목록.length - 6}건`);
}

if (깨진문서.length) {
  // 우리 잘못이 아니다. 그래도 알려 준다 — 어떤 도구가 이런 걸 뱉는지 알아야 한다.
  console.log(`
문서 자체가 깨진 것 ${깨진문서.length}건 (우리 잘못이 아니다)`);
  for (const [이름, 왜] of 깨진문서.slice(0, 6)) console.log(`   ${이름}
     ${왜}`);
}
process.exit(실패.length + 다시쓰기실패.length ? 1 : 0);
