/**
 * **CJS 로 묶어서 실제로 돌려 본다.**
 *
 * 판 읽기가 `import.meta.url` 하나에 걸려 있었다. esbuild 는 `import.meta` 를
 * 빈 객체로 바꿔 놓는다 — 그러면 자리를 못 찾고 판이 `0.0.0` 이 된다.
 * 앱에 번들해 넣은 쪽에서 **바로 옆에 package.json 이 있는데도** 그랬다.
 *
 * 이건 **낱개 시험으로는 못 잡는다.** vitest 는 ESM 으로 도니 `import.meta.url` 이
 * 살아 있어서, `__dirname` 갈래를 없애도 시험이 다 통과한다.
 * **정말 묶어서 돌려 봐야 안다.**
 */
import { describe, expect, it, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const 뿌리 = path.resolve(__dirname, '../../..');
// `.bin/esbuild.cmd` 를 부르면 **공백 든 경로에서 깨진다** (shell 이 필요하고,
// shell 을 켜면 인자가 안 감싸진다). JS 진입점을 node 로 바로 부른다.
const esbuild = path.join(뿌리, 'node_modules', 'esbuild', 'bin', 'esbuild');
const 진입점 = path.join(뿌리, 'dist', 'packages', 'server', 'src', 'index.js');

/**
 * 묶어서 돌린 결과.
 *
 * **`beforeAll` 이 던지면 vitest 가 시험을 「건너뜀」으로 넘긴다** — 조용히 통과한다.
 * 그래서 던지지 않고 탈을 담아 두었다가 시험 안에서 터뜨린다.
 */
let 잰것: { 판: string; 이름: string } | undefined;
let 못한까닭: string | undefined;
let 적힌판 = '';

beforeAll(() => {
 try {
  적힌판 = (JSON.parse(fs.readFileSync(path.join(뿌리, 'package.json'), 'utf8')) as
    { version: string }).version;

  // 배포본을 먼저 굽는다 — 묵은 dist 를 묶으면 옛것을 재게 된다
  execFileSync(process.execPath, [path.join(뿌리, '검증', '빌드.mjs'), '--배포'],
    { cwd: 뿌리, stdio: 'pipe' });

  const 방 = fs.mkdtempSync(path.join(os.tmpdir(), 'cjs번들-'));
  const 낼것 = path.join(방, 'bundle.cjs');
  execFileSync(process.execPath, [
    esbuild, 진입점, '--bundle', '--platform=node', '--format=cjs',
    '--external:@modelcontextprotocol/sdk', `--outfile=${낼것}`,
  ], { cwd: 뿌리, stdio: 'pipe' });

  // **번들 옆에 제 package.json 을 둔다** — 앱에 넣는 쪽이 하는 그대로다
  fs.copyFileSync(path.join(뿌리, 'package.json'), path.join(방, 'package.json'));
  fs.writeFileSync(path.join(방, '재기.cjs'),
    "const m = require('./bundle.cjs');"
    + "console.log(JSON.stringify({ 판: m.서버판, 이름: m.서버이름 }));", 'utf8');

  const 답 = execFileSync(process.execPath, [path.join(방, '재기.cjs')], {
    cwd: 방, encoding: 'utf8',
    // SDK 는 저장소 것을 빌려 쓴다 — 번들에서 뺐으니 찾아갈 자리를 알려 준다
    env: { ...process.env, NODE_PATH: path.join(뿌리, 'node_modules') },
  });
  잰것 = JSON.parse(답) as { 판: string; 이름: string };
  fs.rmSync(방, { recursive: true, force: true });
 } catch (e) { 못한까닭 = String(e).slice(0, 300); }
}, 120_000);

describe('CJS 로 묶어도 제 판을 안다', () => {
  it('번들이 돌기는 하나', () => {
    expect(못한까닭, `묶다 깨졌다: ${못한까닭}`).toBeUndefined();
    expect(잰것, '못 묶었으면 이 시험은 아무것도 안 본 것이다').toBeDefined();
    expect(잰것!.이름).toBe('hwpx-mcp');
  });

  it('**번들이 말하는 판이 package.json 과 같다**', () => {
    expect(잰것!.판,
      'CJS 로 묶으면 import.meta.url 이 없어진다 — __dirname 으로도 자리를 찾아야 한다')
      .toBe(적힌판);
  });

  it('0.0.0 이 아니다 (자리를 못 찾았다는 뜻이다)', () => {
    expect(잰것!.판).not.toBe('0.0.0');
  });
});
