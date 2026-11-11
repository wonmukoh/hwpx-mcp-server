/**
 * **npm 없이 도는 실행본을 굽는다 — 파일 하나에 의존성까지 다 넣는다.**
 *
 *   node 검증/실행본굽기.mjs
 *
 * 나오는 것 (`실행본/hwpx-mcp/`, 폴더째 옮긴다):
 *
 *   hwpx-mcp.mjs                서버 전부 — `@modelcontextprotocol/sdk` 까지 묶었다
 *   package.json                판 번호를 여기서 읽는다 (서버가 자기 판을 말할 때)
 *   LICENSE                     우리 것
 *   THIRD_PARTY_LICENSES.txt    묶어 넣은 남의 것
 *
 * 등록은 `node <폴더>/hwpx-mcp.mjs` 하나다. 받는 PC 에는 Node 20 이상만 있으면 된다 —
 * **레지스트리에서 받는 것이 하나도 없다.** 2026-11-11 에 npm 계정이 막혀 새 판을 못 올렸을 때
 * 설치본(MAGISTER)에 직접 담으려고 만들었다.
 *
 * **`dist` 진입점은 그대로다.** Draftsmith 가 `ELECTRON_RUN_AS_NODE` 로 띄우는 것은
 * `packages/server/bin/hwpx-mcp.mjs` → `dist` 이고, 여기서는 그 `dist` 를 읽기만 한다.
 *
 * 굽고 나면 **저장소도 node_modules 도 없는 빈 임시 폴더**에 옮겨 진짜로 띄워 본다 —
 * 초기화, 도구 목록, 만들고·채우고·저장하고·다시 열기까지. 하나라도 틀리면 0 이 아닌 값으로 끝난다.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { builtinModules, createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const 꾸러미 = JSON.parse(fs.readFileSync(path.join(뿌리, 'package.json'), 'utf8'));
const 낼곳 = path.join(뿌리, '실행본', 'hwpx-mcp');
const 굽는곳 = path.join(뿌리, '실행본', '.굽는중');
const 서버들머리 = path.join(뿌리, 'dist', 'packages', 'server', 'src', 'index.js');

// ── 1. dist 를 굽는다 — 실행본은 dist 를 묶은 것이다 ─────────────────────────
{
  const r = spawnSync(process.execPath, [path.join(여기, '빌드.mjs'), '--배포'], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('배포용 굽기가 실패했다:\n' + (r.stdout ?? '') + (r.stderr ?? ''));
    process.exit(1);
  }
}
const 구운것 = JSON.parse(fs.readFileSync(path.join(뿌리, 'dist', '구운것.json'), 'utf8'));
const 자국 = `${구운것.commit}${구운것.dirty ? ', 고치는 중' : ''}`;

// ── 2. 묶는다 ──────────────────────────────────────────────────────────────
// 진입점은 bin 과 같은 일을 한다 — 다만 dist 를 **정적으로** 불러야 묶인다
fs.rmSync(굽는곳, { recursive: true, force: true });
fs.mkdirSync(굽는곳, { recursive: true });
const 진입 = path.join(굽는곳, '진입.mjs');
fs.writeFileSync(진입, `
import { 붙이기, 서버판 } from ${JSON.stringify(서버들머리.replace(/\\/g, '/'))};

const 인자 = process.argv.slice(2);
if (인자.includes('--version') || 인자.includes('-v')) {
  process.stdout.write(\`\${서버판} (\${__HWPX_BUILD__}, 실행본)\\n\`);
  process.exit(0);
}
if (인자.includes('--help') || 인자.includes('-h')) {
  process.stdout.write([
    \`hwpx-mcp \${서버판} (\${__HWPX_BUILD__}, 실행본) — 한글 문서(HWPX)를 한글 없이 읽고 쓰는 MCP 서버\`,
    '',
    'MCP 클라이언트가 띄워서 stdio 로 말을 건다. 손으로 실행하면 입력을 기다리며 멈춰 있다.',
    '이 실행본은 npm 없이 돈다 — Node 20 이상만 있으면 된다. 같은 폴더의 package.json 을 같이 둔다.',
    '',
    '  {"mcpServers": {"hwpx": {"command": "node", "args": ["<이 폴더>/hwpx-mcp.mjs"]}}}',
    '',
    '더 읽을 것: https://github.com/wonmukoh/hwpx-mcp-server',
    '',
  ].join('\\n'));
  process.exit(0);
}
if (인자.length > 0) {
  process.stderr.write(\`hwpx-mcp: 모르는 인자 — \${인자.join(' ')}\\n→ 이 프로그램은 인자를 안 받는다. 도움말은 --help.\\n\`);
  process.exit(2);
}
try {
  await 붙이기();
  process.stderr.write('hwpx-mcp: stdio 로 붙었다\\n');
} catch (e) {
  process.stderr.write(\`hwpx-mcp: 못 떴다 — \${e && e.stack ? e.stack : e}\\n\`);
  process.exit(1);
}
`);

// esbuild 는 개발 의존성이다 — 받는 PC 에는 안 간다
const esbuild = createRequire(path.join(뿌리, 'package.json'))('esbuild');
fs.rmSync(낼곳, { recursive: true, force: true });
fs.mkdirSync(낼곳, { recursive: true });
const 묶은것 = path.join(낼곳, 'hwpx-mcp.mjs');
const 결과 = await esbuild.build({
  entryPoints: [진입],
  outfile: 묶은것,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  charset: 'utf8',
  legalComments: 'eof',
  metafile: true,
  logLevel: 'warning',
  define: { __HWPX_BUILD__: JSON.stringify(자국) },
  // 묶여 들어간 CJS(ajv 따위)가 require 를 부른다 — ESM 에는 없으니 만들어 준다
  banner: {
    js: [
      '#!/usr/bin/env node',
      `// hwpx-mcp ${꾸러미.version} (${자국}) — npm 없이 도는 실행본. 검증/실행본굽기.mjs 가 구웠다.`,
      "import { createRequire as __hwpxCreateRequire } from 'node:module';",
      'const require = __hwpxCreateRequire(import.meta.url);',
    ].join('\n'),
  },
});
fs.rmSync(굽는곳, { recursive: true, force: true });

// ── 3. 곁 파일 — 판 번호, 우리 라이선스, 묶어 넣은 남의 라이선스 ─────────────
fs.writeFileSync(path.join(낼곳, 'package.json'), JSON.stringify({
  name: 꾸러미.name,
  version: 꾸러미.version,
  description: `${꾸러미.description} — npm 없이 도는 실행본`,
  type: 'module',
  private: true,
  license: 꾸러미.license,
  engines: 꾸러미.engines,
  main: 'hwpx-mcp.mjs',
  homepage: 'https://github.com/wonmukoh/hwpx-mcp-server',
}, null, 2) + '\n');
fs.copyFileSync(path.join(뿌리, 'LICENSE'), path.join(낼곳, 'LICENSE'));

const 남의것 = new Map();
for (const 입력 of Object.keys(결과.metafile.inputs)) {
  const m = 입력.replace(/\\/g, '/').match(/^(.*node_modules\/((?:@[^/]+\/)?[^/]+))\//);
  if (!m) continue;
  const 자리 = path.resolve(뿌리, m[1]);
  if (남의것.has(자리)) continue;
  const p = JSON.parse(fs.readFileSync(path.join(자리, 'package.json'), 'utf8'));
  const 글파일 = fs.readdirSync(자리).find((x) => /^(licen[cs]e|copying)(\.|$)/i.test(x));
  남의것.set(자리, {
    이름: p.name, 판: p.version, 라이선스: p.license ?? '(적힌 것 없음)',
    글: 글파일 ? fs.readFileSync(path.join(자리, 글파일), 'utf8').trim() : '(라이선스 파일 없음)',
  });
}
const 목록 = [...남의것.values()].sort((a, b) => a.이름.localeCompare(b.이름));
fs.writeFileSync(path.join(낼곳, 'THIRD_PARTY_LICENSES.txt'), [
  `hwpx-mcp.mjs 에 묶어 넣은 남의 꾸러미 ${목록.length}개`,
  '',
  ...목록.map((x) => `${x.이름}@${x.판} — ${x.라이선스}`),
  '',
  ...목록.flatMap((x) => ['='.repeat(72), `${x.이름}@${x.판} — ${x.라이선스}`, '='.repeat(72), x.글, '']),
].join('\n'));

// ── 4. 남은 바깥 import 가 없나 — 있으면 받는 PC 에서 죽는다 ───────────────────
const 탈 = [];
// 글을 훑으면 주석 속 예시(`import … from 'ajv'`)에 걸린다 — esbuild 가 적어 둔 바깥 import 를 본다
const 기본 = new Set(builtinModules.flatMap((x) => [x, `node:${x}`]));
const 바깥 = new Set();
for (const 나온것 of Object.values(결과.metafile.outputs)) {
  for (const x of 나온것.imports) if (x.external && !기본.has(x.path)) 바깥.add(x.path);
}
if (바깥.size) 탈.push(`묶이지 않은 import 가 남았다: ${[...바깥].join(', ')}`);

// ── 5. 빈 폴더에서 진짜로 띄운다 ────────────────────────────────────────────
const 무대 = fs.mkdtempSync(path.join(os.tmpdir(), 'hwpx-standalone-'));
for (let d = 무대; ; d = path.dirname(d)) {
  if (fs.existsSync(path.join(d, 'node_modules'))) 탈.push(`시험 자리 위에 node_modules 가 있다: ${d}`);
  if (path.dirname(d) === d) break;
}
const 옮긴곳 = path.join(무대, 'tools', 'hwpx-mcp');
fs.cpSync(낼곳, 옮긴곳, { recursive: true });
const 옮긴파일 = path.join(옮긴곳, 'hwpx-mcp.mjs');

const 판말 = spawnSync(process.execPath, [옮긴파일, '--version'], { encoding: 'utf8', cwd: 무대 }).stdout.trim();
if (!판말.startsWith(`${꾸러미.version} (`)) 탈.push(`--version 이 «${판말}» 이다`);

const 본것 = {};
await new Promise((끝) => {
  const 아이 = spawn(process.execPath, [옮긴파일], { cwd: 무대, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NODE_PATH: '' } });
  let 남은 = '';
  let 오류글 = '';
  const 기다림 = new Map();
  let 번호 = 0;
  아이.stdout.setEncoding('utf8');
  아이.stderr.setEncoding('utf8');
  아이.stderr.on('data', (x) => { 오류글 += x; });
  아이.stdout.on('data', (x) => {
    남은 += x;
    let i;
    while ((i = 남은.indexOf('\n')) !== -1) {
      const 줄 = 남은.slice(0, i).trim();
      남은 = 남은.slice(i + 1);
      if (!줄) continue;
      let 답;
      try { 답 = JSON.parse(줄); } catch { 탈.push(`표준출력에 JSON 아닌 것이 섞였다: «${줄.slice(0, 80)}»`); continue; }
      기다림.get(답.id)?.(답);
      기다림.delete(답.id);
    }
  });
  const 부르기 = (method, params) => new Promise((풀기, 막기) => {
    const id = ++번호;
    const 시계 = setTimeout(() => 막기(new Error(`${method} 답이 30초 안에 안 왔다`)), 30_000);
    기다림.set(id, (답) => { clearTimeout(시계); 풀기(답); });
    아이.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const 도구 = async (name, args) => {
    const r = (await 부르기('tools/call', { name, arguments: args })).result;
    if (!r || r.isError) throw new Error(`${name} 이 실패했다: ${r?.content?.[0]?.text?.slice(0, 200)}`);
    return r.structuredContent ?? {};
  };
  (async () => {
    const 첫 = await 부르기('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: '실행본굽기', version: '0' } });
    본것.서버 = 첫.result?.serverInfo;
    if (첫.result?.serverInfo?.version !== 꾸러미.version) 탈.push(`서버가 판을 «${첫.result?.serverInfo?.version}» 이라 한다 — package.json 을 못 읽었다`);
    아이.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const 목록답 = (await 부르기('tools/list')).result?.tools ?? [];
    본것.도구 = 목록답.length;
    if (목록답.length < 12) 탈.push(`도구가 ${목록답.length}개뿐이다`);

    const { doc_id } = await 도구('create_document', {});
    await 도구('compose', {
      doc_id,
      blocks: [
        { kind: 'title', text: '실행본 시험', date: '2026. 11.', org: '시 험' },
        { kind: 'heading', text: '1. 묶은 것으로 만든 줄' },
        { kind: 'body', text: '이 문단은 **npm 없이** 들어왔다.' },
        { kind: 'table', headers: ['가', '나'], rows: [['1', '2']] },
      ],
    });
    const 파일 = path.join(무대, '실행본시험.hwpx');
    await 도구('save_document', { doc_id, path: 파일 });
    본것.바이트 = fs.statSync(파일).size;
    const 다시 = await 도구('open_document', { path: 파일 });
    const 뼈대 = await 도구('get_outline', { doc_id: 다시.doc_id });
    if (!(뼈대.items ?? []).some((x) => x.kind === 'table')) 탈.push('다시 연 문서에 표가 안 보인다');
    const 찾음 = await 도구('find', { doc_id: 다시.doc_id, text: 'npm 없이' });
    본것.찾음 = (찾음.matches ?? 찾음.items ?? []).length;
    const html = await 도구('render_html', { doc_id: 다시.doc_id });
    본것.html = Object.keys(html).join(',');
  })().catch((e) => 탈.push(`시험이 터졌다: ${e.message}`)).finally(() => {
    // 끝날 때까지 기다린다 — 서버가 무대를 cwd 로 붙들고 있으면 못 지운다
    아이.once('exit', () => {
      if (!/stdio 로 붙었다/.test(오류글)) 탈.push(`붙었다는 말이 없다 — stderr «${오류글.trim().slice(0, 200)}»`);
      끝();
    });
    아이.stdin.end();
    아이.kill();
  });
});
fs.rmSync(무대, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });

// ── 6. 알린다 ──────────────────────────────────────────────────────────────
const 크기 = (p) => `${(fs.statSync(p).size / 1024).toFixed(0)}KB`;
console.log(`실행본 ${낼곳}`);
console.log(`  hwpx-mcp.mjs ${크기(묶은것)} · 남의 꾸러미 ${목록.length}개 묶음 · ${판말}`);
console.log(`  빈 폴더에서 — 서버 ${JSON.stringify(본것.서버)} · 도구 ${본것.도구}개 · 저장 ${본것.바이트}바이트 · 찾음 ${본것.찾음} · render_html [${본것.html}]`);
console.log(`  등록: node <폴더>/hwpx-mcp.mjs`);
if (탈.length) {
  console.error(`\n✗ ${탈.length}개 탈`);
  for (const x of 탈) console.error(`  - ${x}`);
  process.exit(1);
}
console.log('○ npm 없이 돈다');
