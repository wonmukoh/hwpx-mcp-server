/**
 * 컨테이너를 넓게 시험한다.
 *
 * 두 가지를 본다:
 *   가) 그대로 저장 — 손 안 댄 부품은 원본 압축 바이트를 그대로 쓰니 사실상 공짜다
 *   나) **모든 XML 부품을 다시 써서 저장** — zip 을 우리 손으로 새로 짜는 길을 밟는다
 *
 * 나) 가 없으면 우리가 압축해 쓴 zip 을 아무도 읽어 보지 않는다.
 * 같은 구멍이 XML 층에도 있었고, 그리로 `name=""` 버그가 빠져나가 한글이 파일을 거부했다.
 * 802개 부품 가운데 349개가 그 꼴이었는데 검사는 전부 통과라고 했다.
 *
 *   node 컨테이너훑기.mjs 목록파일
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);

const { HwpxContainer } = await import(
  pathToFileURL(path.join(뿌리, '검증', '.빌드hwpx', 'index.js')).href
);

function 첫차이(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return `${i}번째 바이트 (원본 ${a.length} / 저장 ${b.length})\n` +
    `   원본: ${a.subarray(i, i + 24).toString('hex')}\n` +
    `   저장: ${b.subarray(i, i + 24).toString('hex')}`;
}

// 상대 경로면 집 폴더 기준으로도 찾아본다
function 찾기(p) {
  if (fs.existsSync(p)) return p;
  const 집 = path.join(os.homedir(), p);
  return fs.existsSync(집) ? 집 : null;
}

const 적힌것 = fs.readFileSync(process.argv[2], 'utf8').split('\n')
  .map((s) => s.trim()).filter(Boolean);
const 파일들 = 적힌것.map(찾기).filter(Boolean);
const 못찾음 = 적힌것.length - 파일들.length;
if (못찾음) console.log(`※ 목록 ${적힌것.length}줄 가운데 ${못찾음}개를 못 찾았다`);
if (파일들.length === 0) {
  // 0편을 훑고 '실패 0건' 이라 하면 검사가 거짓말을 하는 것이다
  console.error('훑을 문서가 하나도 없다. 이건 통과가 아니라 실패다.');
  process.exit(2);
}

const XML부품 = /\.(xml|hpf|rels)$/i;

let 문서 = 0, 바이트 = 0, 부품수 = 0, 다시쓴부품 = 0;
const 실패 = [];        // 가) 그대로 저장
const 다시쓰기실패 = []; // 나) 전부 다시 써서 저장
const 검사문제 = [];
const 시작 = Date.now();

for (const file of 파일들) {
  const 원본 = fs.readFileSync(file);
  const 이름 = path.basename(file);
  try {
    // ── 가) 그대로 저장하면 바이트가 같아야 한다
    const c = HwpxContainer.open(원본);
    문서++;
    바이트 += 원본.length;
    부품수 += c.names().length;

    if (c.dirty) 실패.push([이름, '열기만 했는데 dirty 다']);

    const 문제 = c.검사();
    if (문제.length) 검사문제.push([이름, 문제]);

    const 저장 = c.save();
    if (!원본.equals(저장)) 실패.push([이름, 첫차이(원본, 저장)]);

    // ── 나) 모든 XML 부품을 같은 내용으로 다시 써서 저장
    //    내용은 같지만 우리가 압축해 우리가 zip 을 짠다. 다시 읽으면 같아야 한다.
    const c2 = HwpxContainer.open(원본);
    const 원래 = new Map();
    for (const n of c2.names()) {
      if (!XML부품.test(n)) continue;
      const t = c2.readText(n);
      원래.set(n, t);
      c2.writeText(n, t);      // 내용은 그대로, 하지만 dirty 로 표시된다
    }
    if (원래.size === 0) { 다시쓰기실패.push([이름, 'XML 부품이 하나도 없다']); continue; }
    다시쓴부품 += 원래.size;

    const 새것 = c2.save();
    if (새것.equals(원본)) {
      // 우리 zip 쓰기를 안 지났다는 뜻이다. 검사가 헛돈다.
      다시쓰기실패.push([이름, '다시 썼는데 바이트가 그대로다 — 다시 쓰는 길을 안 지났다']);
      continue;
    }

    const c3 = HwpxContainer.open(새것);
    const 탈 = [];
    if (c3.names().join('|') !== c.names().join('|')) 탈.push('부품 목록이 달라졌다');
    for (const [n, t] of 원래) {
      if (c3.readText(n) !== t) 탈.push(`${n} 내용이 달라졌다`);
    }
    for (const n of c.binDataNames()) {
      if (!c3.read(n).equals(c.read(n))) 탈.push(`${n} 그림 바이트가 달라졌다`);
    }
    if (탈.length) 다시쓰기실패.push([이름, 탈.slice(0, 3).join(' / ')]);
  } catch (e) {
    실패.push([이름, e.message.split('\n')[0]]);
  }
}

const 초 = (Date.now() - 시작) / 1000;
console.log(`문서 ${문서}편 / 부품 ${부품수}개 / ${(바이트 / 1e6).toFixed(1)}MB`);
console.log(`  그 가운데 다시 써서 시험한 XML 부품 ${다시쓴부품}개`);
console.log(`${초.toFixed(1)}초`);
console.log(`가) 그대로 저장                실패 ${실패.length}건`);
console.log(`나) 전부 다시 써서 저장        실패 ${다시쓰기실패.length}건`);
for (const [딱지, 목록] of [['가', 실패], ['나', 다시쓰기실패]]) {
  for (const [이름, 왜] of 목록.slice(0, 6)) console.log(`\n✗ [${딱지}] ${이름}\n   ${왜}`);
  if (목록.length > 6) console.log(`\n… [${딱지}] 그 밖 ${목록.length - 6}건`);
}

if (검사문제.length) {
  console.log(`\n원본 문서가 우리 검사에 걸리는 것 ${검사문제.length}편`);
  for (const [이름, 문제] of 검사문제.slice(0, 8)) {
    console.log(`   ${이름}: ${문제.slice(0, 2).join(' / ')}${문제.length > 2 ? ` 외 ${문제.length - 2}` : ''}`);
  }
}
process.exit(실패.length + 다시쓰기실패.length ? 1 : 0);
