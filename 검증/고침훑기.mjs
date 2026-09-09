/**
 * **`edit` 의 op 이 도구 표면을 통해 한 번이라도 걸리나.**
 *
 * 아래로 쓰는 앱(Draftsmith)이 같은 짜임을 자기 쪽에 놓고 **첫 실행에 아홉을**
 * 뱉었다 — 지침이 op 열다섯 중 아홉을 안 가르치고 있었다. 그 이야기를 듣고
 * 이쪽을 재 보니 **여섯이 도구를 통해 한 번도 안 걸리고** 있었다.
 *
 *     insert_col · delete_col · merge_cells · split_cell · split_table · join_tables
 *
 * 여섯 다 `packages/doc/test/표.test.ts` 에는 있다. 그런데 **문서 층을 부르는
 * 시험은 문서 층만 지킨다** — 도구 표면의 이름·인자·ID 앞머리가 어긋나도 안 걸린다.
 * 실제로 겪었다: `tbl_tbl_09fm` 을 못 찾는 버그가 문서층 시험을 다 통과하고
 * 도구로 불러 보고서야 나왔다.
 *
 * **op 이 조용히 느는 것도 잡는다.** 새 op 을 넣고 시험을 안 쓰면 여기서 빨개진다.
 *
 *   node 검증/고침훑기.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
process.chdir(뿌리);

/** 도구 표면이 내거는 op 목록. **손으로 안 적는다** — 적어 두면 그것도 낡는다 */
function op목록() {
  const s = fs.readFileSync(path.join('packages', 'server', 'src', '도구.ts'), 'utf8');
  const m = /op: 고름\('무엇을 할까',\s*\[([\s\S]*?)\]\)/.exec(s);
  if (!m) throw new Error('도구.ts 에서 op 목록을 못 찾았다 — 스키마 모양이 바뀌었나');
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

/** 도구를 실제로 부르는 글들 — 시험과 검증 갈래 */
function 부르는글들() {
  const 나온것 = [];
  const 훑 = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { 훑(p); continue; }
      if (!/\.(test\.ts|mjs)$/.test(e.name)) continue;
      // 이 파일 자신은 뺀다 — 여기 적힌 이름에 제가 걸리면 늘 초록이 된다
      if (path.resolve(p) === path.resolve(여기, '고침훑기.mjs')) continue;
      나온것.push([p, fs.readFileSync(p, 'utf8')]);
    }
  };
  훑('packages');
  훑('검증');
  return 나온것;
}

const ops = op목록();
const 글들 = 부르는글들();

const 안걸리는것 = [];
const 줄들 = [];
for (const op of ops) {
  const 쓴곳 = [...new Set(글들
    .filter(([, s]) => s.includes(`op: '${op}'`))
    .map(([p]) => path.basename(p)))];
  if (쓴곳.length === 0) 안걸리는것.push(op);
  줄들.push(`  ${쓴곳.length ? '○' : '✗'} ${op.padEnd(18)}${쓴곳.join(', ') || '**도구로 한 번도 안 걸린다**'}`);
}

console.log(`edit 의 op ${ops.length}가지 — 도구 표면을 통해 걸리나`);
for (const l of 줄들) console.log(l);
console.log();

if (안걸리는것.length) {
  console.log(`✗ 도구로 한 번도 안 걸리는 op ${안걸리는것.length}가지`);
  console.log(`    ${안걸리는것.join(' · ')}`);
  console.log();
  console.log('  문서 층 시험이 있어도 그것은 문서 층만 지킨다 —');
  console.log('  도구 이름·인자·ID 앞머리가 어긋나면 거기서는 안 걸린다.');
  console.log('  packages/server/test/도구표면.test.ts 에 도구로 부르는 시험을 놔라.');
  process.exit(1);
}
console.log(`○ ${ops.length}가지가 다 도구 표면을 통해 걸린다`);
