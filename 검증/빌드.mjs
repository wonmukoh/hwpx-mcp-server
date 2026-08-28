/**
 * 검증 스크립트(.mjs)가 쓸 JS 를 굽는다.
 *
 * tsc 는 `@hwpx/owpml` 같은 이름을 **그대로 남긴다.** 그러면 node 가
 * node_modules 의 심볼릭 링크를 따라 **.ts 소스**로 가서 못 읽는다.
 * 그래서 구운 뒤에 그 이름들을 구운 파일의 상대 경로로 바꾼다.
 *
 *   node 검증/빌드.mjs              검증용 (검증/.빌드전체)
 *   node 검증/빌드.mjs --배포        배포용 (dist) — **순수 Node 로 돌아가야 한다**
 *
 * 배포용이 따로 있는 까닭: Draftsmith 는 서버를
 * `ELECTRON_RUN_AS_NODE=1` + `process.execPath` 로 띄운다.
 * 그러니 진입점이 **번들러·로더·tsx 없이** 그냥 node 로 돌아가야 한다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
process.chdir(뿌리);

const 배포인가 = process.argv.includes('--배포');
const 낼곳 = 배포인가 ? path.join(뿌리, 'dist') : path.join(여기, '.빌드전체');

/**
 * **옆에 굽고 마지막에 이름만 바꾼다.**
 *
 * 예전에는 `dist` 를 먼저 지우고 그 자리에 구웠다. 굽는 동안 —
 * 검증 한 바퀴에 여섯 번, 매번 몇십 초 — **`dist` 가 빈 자리**였고,
 * 그때 밖에서 읽는 쪽은 「dist 없음」을 봤다.
 *
 * 앱에 번들해 넣는 쪽이 2분 넘게 여섯 번 내리 걸렸다고 알려 왔다.
 * `npx` 로 쓰는 쪽도, **이 폴더를 가리키는 MCP 설정**도 같은 창에 걸린다.
 *
 * 이제 밖에서는 언제 읽어도 **옛 것 아니면 새 것**이지 빈 자리가 없다.
 */
const 굽는곳 = `${낼곳}.굽는중`;
fs.rmSync(굽는곳, { recursive: true, force: true });

const r = spawnSync(process.execPath, [
  path.join('node_modules', 'typescript', 'bin', 'tsc'),
  '-p', path.join('검증', 'tsconfig.빌드.json'),
  '--outDir', 굽는곳,
], { stdio: 'inherit' });
if (r.status !== 0) {
  fs.rmSync(굽는곳, { recursive: true, force: true });
  process.exit(r.status ?? 1);
}

/**
 * 다 구웠으니 자리를 바꾼다. **여기서만 잠깐 빈다** — 밀리초다.
 *
 * 윈도우는 있는 폴더 위로 이름을 못 바꾼다. 그래서 옛 것을 먼저 옆으로 치운다.
 */
{
  const 치울곳 = `${낼곳}.치움`;
  fs.rmSync(치울곳, { recursive: true, force: true });
  if (fs.existsSync(낼곳)) fs.renameSync(낼곳, 치울곳);
  fs.renameSync(굽는곳, 낼곳);
  fs.rmSync(치울곳, { recursive: true, force: true });
}

/** 꾸러미 이름 → 구운 index.js */
const 꾸러미 = {
  '@hwpx/owpml': path.join(낼곳, 'packages', 'owpml', 'src', 'index.js'),
  '@hwpx/container': path.join(낼곳, 'packages', 'hwpx', 'src', 'index.js'),
  '@hwpx/doc': path.join(낼곳, 'packages', 'doc', 'src', 'index.js'),
  '@hwpx/compose': path.join(낼곳, 'packages', 'compose', 'src', 'index.js'),
  '@hwpx/server': path.join(낼곳, 'packages', 'server', 'src', 'index.js'),
};

function js파일들(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return js파일들(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

let 바꾼파일 = 0, 바꾼줄 = 0;
for (const f of js파일들(낼곳)) {
  const 앞 = fs.readFileSync(f, 'utf8');
  let 뒤 = 앞;
  for (const [이름, 대상] of Object.entries(꾸러미)) {
    if (!뒤.includes(이름)) continue;
    let 상대 = path.relative(path.dirname(f), 대상).split(path.sep).join('/');
    if (!상대.startsWith('.')) 상대 = './' + 상대;
    const 앞길이 = 뒤.length;
    뒤 = 뒤.split(`'${이름}'`).join(`'${상대}'`).split(`"${이름}"`).join(`"${상대}"`);
    if (뒤.length !== 앞길이) 바꾼줄++;
  }
  if (뒤 !== 앞) { fs.writeFileSync(f, 뒤, 'utf8'); 바꾼파일++; }
}

// 정말 불러와지나 확인한다. 안 그러면 "구웠다" 고 하고 못 쓰는 것을 준다.
const { pathToFileURL } = await import('node:url');
for (const [이름, 대상] of Object.entries(꾸러미)) {
  const m = await import(pathToFileURL(대상).href);
  const 개수 = Object.keys(m).length;
  if (개수 === 0) throw new Error(`${이름} 을 구웠는데 내보내는 것이 없다`);
  console.log(`  ○ ${이름.padEnd(18)} 내보내기 ${개수}개`);
}
console.log(`꾸러미 이름을 상대 경로로 바꾼 파일 ${바꾼파일}개`);

if (배포인가) {
  // 남은 꾸러미 이름이 있으면 순수 node 에서 터진다. 여기서 잡는다.
  const 찾을것 = "from '" + '@hwpx/';
  const 남은것 = js파일들(낼곳).filter((f) => fs.readFileSync(f, 'utf8').includes(찾을것));
  if (남은것.length) {
    console.error(`✗ 꾸러미 이름이 ${남은것.length}개 파일에 남았다 — 순수 node 로 못 돈다:`);
    for (const f of 남은것.slice(0, 5)) console.error(`   ${path.relative(뿌리, f)}`);
    process.exit(1);
  }
  console.log(`배포용을 ${path.relative(뿌리, 낼곳)} 에 구웠다`);
}
