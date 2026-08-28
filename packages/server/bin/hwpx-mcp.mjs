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
