#!/usr/bin/env node
/**
 * `hwpx-mcp` 진입점.
 *
 * ## 순수 Node 로 돌아야 한다
 *
 * 이 MCP 를 실제로 물고 쓰는 앱(Draftsmith)은 서버를
 * `ELECTRON_RUN_AS_NODE=1` + `process.execPath` 로 띄운다.
 * 그러니 여기서는 **번들러·로더·`tsx`·TypeScript 를 쓰면 안 된다.**
 * `node bin/hwpx-mcp.mjs` 하나로 떠야 한다.
 *
 * 그래서 구운 JS(`dist/`)를 불러 쓴다. 구우려면:
 *
 *   node 검증/빌드.mjs --배포
 *
 * ## 환경 변수를 건드리지 않는다
 *
 * 학교·교육청망은 SSL 인스펙션을 건다. 앱이 윈도우 인증서 저장소에서 루트 CA 를 뽑아
 * `NODE_EXTRA_CA_CERTS` 로 물려준다. **그걸 지우거나 덮어쓰지 않는다.**
 *
 * ## 표준출력은 프로토콜 것이다
 *
 * stdio 로 말하므로 `console.log` 를 쓰면 **프로토콜이 깨진다.**
 * 알릴 것은 전부 stderr 로 낸다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.resolve(여기, '..', '..', '..');

/**
 * **`--help` 와 `--version` 은 서버를 띄우기 전에 답한다.**
 *
 * 처음 쓰는 사람이 `npx hwpx-mcp` 다음으로 가장 먼저 치는 것이 `--help` 다.
 * 그런데 전에는 인자를 통째로 무시하고 stdio 서버를 띄워 **멈춰 선 것처럼** 보였다.
 * 「도구가 답하나」 는 맞았지만 「처음 만난 사람이 쓸 수 있나」 는 아니었다.
 */
const 인자 = process.argv.slice(2);
const 판읽어보기 = () => {
  try {
    for (let d = 여기, i = 0; i < 8; i++) {
      const p = path.join(d, 'package.json');
      if (fs.existsSync(p)) {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (j.name === 'hwpx-mcp' && typeof j.version === 'string') return j.version;
      }
      const 위 = path.dirname(d);
      if (위 === d) break;
      d = 위;
    }
  } catch { /* 못 읽으면 아래로 */ }
  return '0.0.0';
};

if (인자.includes('--version') || 인자.includes('-v')) {
  process.stdout.write(`${판읽어보기()}\n`);
  process.exit(0);
}

if (인자.includes('--help') || 인자.includes('-h')) {
  process.stdout.write([
    `hwpx-mcp ${판읽어보기()} — 한글 문서(HWPX)를 한글 없이 읽고 쓰는 MCP 서버`,
    '',
    '이 프로그램은 **혼자 쓰는 것이 아니다.** MCP 클라이언트가 띄워서',
    'stdio 로 말을 건다. 손으로 실행하면 입력을 기다리며 멈춰 있는 것처럼 보인다.',
    '',
    '붙이는 법 — 설정 파일에 이렇게 적는다:',
    '',
    '  {"mcpServers": {"hwpx": {"command": "npx", "args": ["-y", "hwpx-mcp"]}}}',
    '',
    '  Claude Code/Desktop   ~/.claude.json  (또는 claude_desktop_config.json)',
    '  Codex CLI             ~/.codex/config.toml',
    '  Gemini CLI            ~/.gemini/settings.json',
    '  안티그래비티            ~/.gemini/config/mcp_config.json',
    '',
    '붙으면 stderr 에 「stdio 로 붙었다」 가 뜬다.',
    '',
    '  --help, -h      이 글',
    '  --version, -v   판 번호',
    '',
    '더 읽을 것: https://github.com/wonmukoh/hwpx-mcp-server',
    '',
  ].join('\n'));
  process.exit(0);
}

if (인자.length > 0) {
  process.stderr.write(
    `hwpx-mcp: 모르는 인자 — ${인자.join(' ')}\n`
    + '→ 이 프로그램은 인자를 안 받는다. 도움말은 --help.\n',
  );
  process.exit(2);
}

const 구운것 = path.join(뿌리, 'dist', 'packages', 'server', 'src', 'index.js');
if (!fs.existsSync(구운것)) {
  process.stderr.write(
    `hwpx-mcp: 구운 것이 없다 (${구운것})\n`
    + '→ 먼저 구워라:  node 검증/빌드.mjs --배포\n',
  );
  process.exit(1);
}

try {
  const { 붙이기 } = await import(pathToFileURL(구운것).href);
  await 붙이기();
  process.stderr.write('hwpx-mcp: stdio 로 붙었다\n');
} catch (e) {
  process.stderr.write(`hwpx-mcp: 못 떴다 — ${e && e.stack ? e.stack : e}\n`);
  process.exit(1);
}
