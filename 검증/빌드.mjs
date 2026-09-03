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
// **굽기가 겹쳐 돌 수 있다.** 검증 한 바퀴에 여섯 번 굽고, vitest 는 시험 파일을
// 나란히 돌린다. 자리 이름이 같으면 둘이 서로의 것을 지운다 — 실제로 그랬다.
// 프로세스마다 다른 이름을 쓴다. 마지막에 이름 바꾸는 쪽이 이기고,
// **어느 쪽이 이기든 dist 는 통째로 성한 것**이다.
const 굽는곳 = `${낼곳}.굽는중.${process.pid}`;
fs.rmSync(굽는곳, { recursive: true, force: true });

// **죽은 것이 두고 간 자리를 치운다.** 굽다 깨진 프로세스는 제 자리를 못 치운다.
// 안 치우면 폴더가 쌓이고, 「찌꺼기 없나」 를 보는 쪽이 남의 것에 걸린다.
for (const 이름 of fs.readdirSync(path.dirname(낼곳))) {
  const 앞 = `${path.basename(낼곳)}.`;
  if (!이름.startsWith(`${앞}굽는중.`) && !이름.startsWith(`${앞}치움.`)) continue;
  const 쥔이 = Number(이름.split('.').pop());
  if (!Number.isFinite(쥔이) || 쥔이 === process.pid) continue;
  try { process.kill(쥔이, 0); continue; } catch { /* 죽었다 */ }
  fs.rmSync(path.join(path.dirname(낼곳), 이름), { recursive: true, force: true });
}

const r = spawnSync(process.execPath, [
  path.join('node_modules', 'typescript', 'bin', 'tsc'),
  '-p', path.join('검증', 'tsconfig.빌드.json'),
  '--outDir', 굽는곳,
], { stdio: 'inherit' });
if (r.status !== 0) {
  fs.rmSync(굽는곳, { recursive: true, force: true });
  process.exit(r.status ?? 1);
}


/** 꾸러미 이름 → 구운 index.js */
const 꾸러미 = {
  '@hwpx/owpml': path.join(굽는곳, 'packages', 'owpml', 'src', 'index.js'),
  '@hwpx/container': path.join(굽는곳, 'packages', 'hwpx', 'src', 'index.js'),
  '@hwpx/doc': path.join(굽는곳, 'packages', 'doc', 'src', 'index.js'),
  '@hwpx/compose': path.join(굽는곳, 'packages', 'compose', 'src', 'index.js'),
  '@hwpx/render': path.join(굽는곳, 'packages', 'render', 'src', 'index.js'),
  '@hwpx/server': path.join(굽는곳, 'packages', 'server', 'src', 'index.js'),
};

function js파일들(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return js파일들(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

let 바꾼파일 = 0, 바꾼줄 = 0;
for (const f of js파일들(굽는곳)) {
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

/**
 * **어느 소스에서 구웠는지 찍는다.**
 *
 * 판 번호로는 번들을 못 가린다 — 개발 중에는 판을 안 올리고 `packages/` 만 고치는
 * 게 흔해서, 어제 것과 오늘 것이 둘 다 `0.5.0` 이라 답하면서 동작이 다르다.
 *
 * 실제로 그것 때문에 「이 번들에 그 고침이 들었나」 를 알아내려고
 * **도구 지문을 뜨고 stdio 로 두드려야** 했다. 이 한 줄이면 끝날 일이었다.
 *
 * **안 올린 변경이 있으면 `dirty` 를 켠다** — 커밋만 찍으면
 * 고치는 중인 것을 그 커밋 그대로라고 말하게 된다.
 */
{
  const 꾸러미것 = JSON.parse(fs.readFileSync(path.join(뿌리, 'package.json'), 'utf8'));
  const 깃 = (인자) => {
    const r = spawnSync('git', 인자, { cwd: 뿌리, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return r.status === 0 ? (r.stdout ?? '').trim() : undefined;
  };
  const 커밋 = 깃(['rev-parse', '--short', 'HEAD']);
  const 안올린것 = 깃(['status', '--porcelain']);
  fs.writeFileSync(path.join(굽는곳, '구운것.json'), `${JSON.stringify({
    name: 꾸러미것.name,
    version: 꾸러미것.version,
    ...(커밋 !== undefined ? { commit: 커밋 } : {}),
    ...(안올린것 !== undefined ? { dirty: 안올린것.length > 0 } : {}),
  }, null, 2)}\n`, 'utf8');
}

// **자리를 바꾸기 전에** 본다 — 바꾸고 나면 굽는곳이 없다.
// 그리고 흠이 있으면 옛 dist 를 그대로 두는 편이 낫다.
if (배포인가) {
  // 남은 꾸러미 이름이 있으면 순수 node 에서 터진다. 여기서 잡는다.
  const 찾을것 = "from '" + '@hwpx/';
  const 남은것 = js파일들(굽는곳).filter((f) => fs.readFileSync(f, 'utf8').includes(찾을것));
  if (남은것.length) {
    console.error(`✗ 꾸러미 이름이 ${남은것.length}개 파일에 남았다 — 순수 node 로 못 돈다:`);
    for (const f of 남은것.slice(0, 5)) console.error(`   ${path.relative(뿌리, f)}`);
    fs.rmSync(굽는곳, { recursive: true, force: true });
    process.exit(1);
  }
}

/**
 * 다 구웠으니 자리를 바꾼다. **여기서만 잠깐 빈다** — 밀리초다.
 *
 * 윈도우는 있는 폴더 위로 이름을 못 바꾼다. 그래서 옛 것을 먼저 옆으로 치운다.
 *
 * **자리 바꾸기는 한 번에 하나만.** 굽기가 겹쳐 돌 수 있는데(검증 한 바퀴가
 * 여섯 번 굽고, vitest 는 시험 파일을 나란히 돌린다), 둘이 동시에 `dist` 를
 * 옮기려 하면 윈도우가 `EPERM` 을 낸다. 실제로 그랬다.
 *
 * 굽는 것 자체는 겹쳐도 된다 — 자리가 pid 로 갈려 있다. 바꾸는 순간만 줄 세운다.
 */
{
  const 잠금 = `${낼곳}.잠금`;
  const 살아있나 = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

  // 잠금을 잡는다. 남이 쥐고 있으면 놓을 때까지 기다린다.
  for (let i = 0; ; i++) {
    try {
      fs.writeFileSync(잠금, String(process.pid), { flag: 'wx' });
      break;
    } catch {
      // 죽은 프로세스가 두고 간 잠금이면 걷어낸다
      const 쥔이 = Number(fs.readFileSync(잠금, 'utf8').trim());
      if (!Number.isFinite(쥔이) || !살아있나(쥔이)) { fs.rmSync(잠금, { force: true }); continue; }
      if (i > 600) { console.error('✗ 자리 바꾸기 잠금을 60초 기다렸다'); process.exit(1); }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);   // 100ms 쉰다
    }
  }

  try {
    const 치울곳 = `${낼곳}.치움.${process.pid}`;
    fs.rmSync(치울곳, { recursive: true, force: true });
    if (fs.existsSync(낼곳)) fs.renameSync(낼곳, 치울곳);
    fs.renameSync(굽는곳, 낼곳);
    fs.rmSync(치울곳, { recursive: true, force: true });
  } finally {
    fs.rmSync(잠금, { force: true });
  }
}

if (배포인가) console.log(`배포용을 ${path.relative(뿌리, 낼곳)} 에 구웠다`);
