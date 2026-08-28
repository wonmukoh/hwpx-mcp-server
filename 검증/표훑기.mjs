/**
 * 표 검사가 **실제 문서를 거짓으로 잡지 않나.**
 *
 * 검사가 진짜 문서를 잡으면 규칙이 틀린 것이다.
 * 남의 문서를 열었을 때 "이 표는 잘못됐다" 고 하면 못 쓴다.
 *
 * 무엇에 걸리는지 갈래별로 세어서 보여 준다.
 * 몇 건은 정말 문서가 이상한 것일 수 있다 — 그것도 알아야 한다.
 *
 *   node 검증/표훑기.mjs 목록파일
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);

const { HwpxContainer } = await import(
  pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', 'hwpx', 'src', 'index.js')).href
);
const { parseXml, findAll } = await import(
  pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', 'owpml', 'src', 'index.js')).href
);
const { 표 } = await import(
  pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', 'doc', 'src', 'index.js')).href
);

function 찾기(p) {
  if (fs.existsSync(p)) return p;
  const 집 = path.join(os.homedir(), p);
  return fs.existsSync(집) ? 집 : null;
}

const 적힌것 = fs.readFileSync(process.argv[2], 'utf8').split('\n')
  .map((s) => s.trim()).filter(Boolean);
const 파일들 = 적힌것.map(찾기).filter(Boolean);
if (파일들.length === 0) {
  console.error('훑을 문서가 하나도 없다. 이건 통과가 아니라 실패다.');
  process.exit(2);
}

let 문서 = 0, 표수 = 0, 깨끗한표 = 0, 탈없는표 = 0;
const 갈래 = new Map();
const 보기 = new Map();

/** 탈을 갈래로 묶는다 (자리 번호를 빼고) */
function 갈래이름(탈) {
  return 탈
    .replace(/\(\d+,\d+\)/g, '(줄,칸)')
    .replace(/\d+/g, 'N');
}

for (const f of 파일들) {
  let c;
  try { c = HwpxContainer.open(fs.readFileSync(f)); } catch { continue; }
  문서++;
  for (const 구역 of c.sectionNames()) {
    let doc;
    try { doc = parseXml(c.readText(구역)); } catch { continue; }
    for (const el of findAll(doc.root, 'hp:tbl')) {
      표수++;
      let 탈;
      try { 탈 = new 표(el).검사(); } catch (e) { 탈 = [{ 급: '탈', 말: `검사가 터졌다: ${e.message}` }]; }
      if (탈.length === 0) { 깨끗한표++; }
      if (탈.filter((t) => t.급 === '탈').length === 0) 탈없는표++;
      if (탈.length === 0) continue;
      for (const t of 탈) {
        const g = `[${t.급}] ` + 갈래이름(t.말);
        갈래.set(g, (갈래.get(g) ?? 0) + 1);
        if (!보기.has(g)) 보기.set(g, `${path.basename(f)} — ${t.말}`);
      }
    }
  }
}

console.log(`문서 ${문서}편 / 표 ${표수}개`);
console.log(`아무것도 안 걸린 표 ${깨끗한표}개 (${((깨끗한표 / 표수) * 100).toFixed(1)}%)`);
console.log(`'탈' 이 없는 표     ${탈없는표}개 (${((탈없는표 / 표수) * 100).toFixed(1)}%)`);
if (갈래.size === 0) { console.log('\n걸린 것 없음'); process.exit(0); }

console.log('\n걸린 갈래:');
for (const [g, n] of [...갈래].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(6)}  ${g}`);
  console.log(`          예: ${보기.get(g)}`);
}
