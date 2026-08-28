/**
 * **짜서 남의 폴더에 깔았을 때도 도나.**
 *
 * `npm pack` → 빈 폴더에 `npm install` → 순수 Node 로 띄워 JSON-RPC 를 주고받는다.
 * 이게 `npx hwpx-mcp` 가 하는 일이고, 사용자가 실제로 겪는 길이다.
 *
 * ## 왜 따로 보나
 *
 * 저장소 안에서는 도는데 짜면 안 도는 일이 흔하다:
 *   - `files` 에 안 적어 `dist` 가 안 담긴다
 *   - 꾸러미끼리의 `@hwpx/*` 이름이 안 풀린다 (배포 빌드가 상대 경로로 바꾼다)
 *   - `bin` 경로가 틀렸다
 *
 * 저장소 안 시험은 그걸 하나도 못 잡는다. **깔아 봐야 안다.**
 *
 *   node 검증/꾸러미시험.mjs
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);

// 경로에 한글을 안 넣는다 — npm 과 PowerShell 이 깨뜨린다
const 무대 = path.join(os.tmpdir(), 'hwpx-pack');
fs.rmSync(무대, { recursive: true, force: true });
fs.mkdirSync(무대, { recursive: true });

const 탈 = [];
const 본것 = [];

// ── 1. 배포용을 굽고 짠다 ─────────────────────────────────────────────────
execFileSync(process.execPath, [path.join(여기, '빌드.mjs'), '--배포'], { cwd: 뿌리, stdio: 'pipe' });

/**
 * npm 을 부른다.
 *
 * 윈도우에서 `npm.cmd` 를 `execFileSync` 로 바로 부르면 **EINVAL** 이 난다
 * (요즘 Node 는 `.cmd` 를 셸 없이 안 띄운다). `shell: true` 로 띄우되,
 * 그러면 빈칸 든 경로가 갈라지므로 **따옴표로 싼다.**
 * 이 저장소 경로에는 빈칸과 한글이 다 들어 있다.
 */
function npm돌리기(인자들, cwd) {
  const 줄 = ['npm', ...인자들.map((a) => (/[ "]/.test(a) ? `"${a}"` : a))].join(' ');
  return execFileSync(줄, { cwd, stdio: 'pipe', shell: true, encoding: 'utf8' });
}

npm돌리기(['pack', '--pack-destination', 무대], 뿌리);

const 짠것 = fs.readdirSync(무대).filter((f) => f.endsWith('.tgz'));
if (짠것.length !== 1) {
  console.error(`짠 것이 ${짠것.length}개다 (하나여야 한다)`);
  process.exit(1);
}
본것.push(`짠 것 ${짠것[0]} (${(fs.statSync(path.join(무대, 짠것[0])).size / 1024).toFixed(0)}KB)`);

// ── 2. 빈 폴더에 깐다 ─────────────────────────────────────────────────────
const 남의폴더 = path.join(무대, 'somewhere');
fs.mkdirSync(남의폴더);
fs.writeFileSync(path.join(남의폴더, 'package.json'),
  JSON.stringify({ name: 'x', version: '1.0.0', private: true }), 'utf8');
try {
  npm돌리기(['install', path.join(무대, 짠것[0])], 남의폴더);
} catch (e) {
  console.error('깔다가 터졌다:', String(e.stderr ?? e.message).slice(0, 400));
  process.exit(1);
}

const 깐것 = path.join(남의폴더, 'node_modules', 'hwpx-mcp');
if (!fs.existsSync(깐것)) { console.error('깔렸는데 폴더가 없다'); process.exit(1); }

// 담겼어야 할 것
for (const 있어야 of [
  'packages/server/bin/hwpx-mcp.mjs',
  'dist/packages/server/src/index.js',
  'dist/packages/owpml/src/index.js',
  'dist/packages/compose/src/조각.js',
]) {
  if (!fs.existsSync(path.join(깐것, 있어야))) 탈.push(`짠 것에 ${있어야} 가 없다`);
}

// **저장소 것을 안 딸려 보냈나** — 시험 자료는 담기면 안 된다
for (const 없어야 of ['검증', '자료/표본', '자료/기준파일', 'packages/owpml/src', 'node_modules']) {
  if (fs.existsSync(path.join(깐것, 없어야))) 탈.push(`짠 것에 ${없어야} 가 딸려 갔다 (담기면 안 된다)`);
}

// **실제 문서 파일은 한 개도 담기면 안 된다.**
// 표본은 학교 문서라 개인정보가 있다. 폴더 이름만 막으면
// 딴 자리에 놓았을 때 새어 나간다 — 확장자로 막는다.
{
  const 새는것 = [];
  (function 훑기(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { 훑기(p); continue; }
      if (/\.(hwpx?|pdf|png|jpe?g)$/i.test(e.name)) 새는것.push(path.relative(깐것, p));
    }
  })(깐것);
  for (const p of 새는것) 탈.push(`짠 것에 문서·그림 파일이 담겼다: ${p}`);
}

// 꾸러미 이름이 안 풀리면 여기서 걸린다
const 남은것 = [];
(function 훑기(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { 훑기(p); continue; }
    if (!e.name.endsWith('.js')) continue;
    if (/from ['"]@hwpx\//.test(fs.readFileSync(p, 'utf8'))) 남은것.push(path.relative(깐것, p));
  }
})(path.join(깐것, 'dist'));
if (남은것.length) {
  탈.push(`@hwpx/* 이름이 안 풀린 파일 ${남은것.length}개 (${남은것[0]}) — 깐 곳에서는 못 찾는다`);
}

// ── 3. 순수 Node 로 띄워 말을 걸어 본다 ───────────────────────────────────
const 답 = await 말걸기(path.join(깐것, 'packages', 'server', 'bin', 'hwpx-mcp.mjs'));
본것.push(`서버 이름 ${답.서버이름 ?? '(없음)'} / 판 ${답.판 ?? '(없음)'}`);
본것.push(`도구 ${답.도구들.length}개: ${답.도구들.join(' ')}`);

if (!답.떴나) 탈.push('서버가 안 떴다 (stderr 에 "stdio 로 붙었다" 가 없다)');
if (답.서버이름 !== 'hwpx-mcp') 탈.push(`서버 이름이 ${답.서버이름} 이다`);
// **판 번호가 갈라지지 않았나.** package.json 은 0.4.0 인데 서버는 클라이언트에게
// 0.1.0 이라고 말한 적이 있다 — 판이 두 군데 따로 적혀 있었다.
{
  const 적힌판 = JSON.parse(fs.readFileSync(path.join(깐것, 'package.json'), 'utf8')).version;
  if (답.판 !== 적힌판) {
    탈.push(`서버가 말하는 판(${답.판})과 package.json(${적힌판})이 다르다`);
  }
}
// **숫자를 못박지 않는다.** 도구를 하나 더했더니 이 시험이 깨졌다 —
// 재는 것은 "몇 개냐" 가 아니라 **"소스가 정의한 것이 다 깔렸냐"** 다.
const { 도구들 } = await import(pathToFileURL(
  path.join(뿌리, '검증', '.빌드전체', 'packages', 'server', 'src', 'index.js')).href);
const 있어야할것 = 도구들.map((t) => t.name).sort();
const 빠진것 = 있어야할것.filter((n) => !답.도구들.includes(n));
const 더있는것 = 답.도구들.filter((n) => !있어야할것.includes(n));
if (빠진것.length) 탈.push(`짠 것에 도구 ${빠진것.length}개가 없다: ${빠진것.join(', ')}`);
if (더있는것.length) 탈.push(`짠 것에 없어야 할 도구가 있다: ${더있는것.join(', ')}`);

// 그래도 **적은 것이 이 도구의 성질**이다. 늘어나면 알아채야 한다.
// 옛 MCP 는 156개였고, 그만큼 tools/list 가 먼저 컨텍스트를 먹었다.
if (답.도구들.length > 12) {
  탈.push(`도구가 ${답.도구들.length}개다 — 12개를 넘으면 왜 늘었는지 적고 이 수를 올려라`);
}
if (답.stderr잡소리) 탈.push(`stderr 에 잡소리가 있다: ${답.stderr잡소리.slice(0, 120)}`);

/** 서버를 띄워 initialize · tools/list 를 주고받는다 */
function 말걸기(진입점) {
  return new Promise((풀기) => {
    const p = spawn(process.execPath, [진입점], { stdio: ['pipe', 'pipe', 'pipe'] });
    let 나온것 = '', 에러 = '';
    p.stdout.on('data', (d) => { 나온것 += d; });
    p.stderr.on('data', (d) => { 에러 += d; });

    const 보내기 = (o) => p.stdin.write(`${JSON.stringify(o)}\n`);
    보내기({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2026-07-28', capabilities: {},
        clientInfo: { name: '꾸러미시험', version: '1' },
      },
    });
    setTimeout(() => 보내기({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }), 800);

    setTimeout(() => {
      p.kill();
      const 답들 = 나온것.split('\n').filter(Boolean).map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
      const 첫 = 답들.find((x) => x.id === 1)?.result ?? {};
      const 목록 = 답들.find((x) => x.id === 2)?.result?.tools ?? [];
      풀기({
        떴나: 에러.includes('stdio 로 붙었다'),
        서버이름: 첫.serverInfo?.name,
        판: 첫.serverInfo?.version,
        도구들: 목록.map((t) => t.name),
        // stderr 에는 붙었다는 한 줄 말고 아무것도 없어야 한다.
        // stdio MCP 는 stdout 이 JSON-RPC 통로다 — 잡소리가 섞이면 클라이언트가 깨진다.
        stderr잡소리: 에러.split('\n').filter((l) => l.trim() && !l.includes('stdio 로 붙었다')).join(' '),
      });
    }, 2500);
  });
}

// ── 알림 ──────────────────────────────────────────────────────────────────
console.log('꾸러미 시험 — 짜서 남의 폴더에 깔았을 때도 도나');
for (const l of 본것) console.log(`  · ${l}`);
console.log(탈.length ? `\n탈 ${탈.length}건` : '\n탈 없음');
for (const t of 탈) console.log(`  ✗ ${t}`);
process.exit(탈.length ? 1 : 0);
