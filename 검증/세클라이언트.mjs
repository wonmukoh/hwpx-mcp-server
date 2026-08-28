/**
 * **어떤 클라이언트가 물어도 다 같은 대답을 하나.**
 *
 * 클라이언트 이름을 세어 봐야 끝이 없다 — Claude·Codex·Gemini·안티그래비티,
 * 그리고 내일 나올 것까지. **그래서 이름이 아니라 규격판으로 잰다.**
 * 어떤 클라이언트든 SDK 가 아는 판 가운데 하나를 말한다.
 *
 * 클라이언트마다 MCP 를 조금씩 다르게 두드린다:
 *   - 프로토콜 판(`protocolVersion`)을 저마다 다른 값으로 보낸다
 *   - `initialized` 알림을 보내는 쪽도, 안 보내는 쪽도 있다
 *   - `tools/list` 를 `params` 없이 보내기도 한다
 *   - 인자를 문자열로 감싸 보내는 쪽이 있다
 *
 * 하나에서만 돌아가는 서버는 쓸 수 없다. 그래서 **SDK 가 받는 판을 다 두드려 본다.**
 * 판 목록은 SDK 에서 읽는다 — 여기 못 박아 두면 SDK 가 판을 늘렸을 때 안 따라간다.
 *
 * **모르는 판**도 하나 넣는다. 규격은 서버가 모르는 판을 받으면
 * 거절하지 말고 **제가 아는 판으로 답하라**고 한다.
 * 안 그러면 새 클라이언트가 나올 때마다 안 붙는다.
 *
 * ## 왜 실제 CLI 를 안 쓰나
 *
 * 실제로 붙이려면 사용자의 `~/.claude.json` · `~/.codex/config.toml` ·
 * `~/.gemini/settings.json` 을 고쳐야 한다. **남의 설정을 시험이 건드리면 안 된다.**
 * 그래서 각 클라이언트가 보내는 것과 같은 모양의 JSON-RPC 를 직접 보낸다.
 *
 *   node 검증/세클라이언트.mjs
 */
import * as path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const 진입점 = path.join(뿌리, 'packages', 'server', 'bin', 'hwpx-mcp.mjs');

// **배포본을 먼저 굽는다.** 진입점은 `dist/` 를 불러 쓴다 —
// 안 구우면 묵은 `dist` 를 보게 되고, 고쳐 놓고도 옛것을 시험하게 된다.
// 실제로 그랬다: 도구를 하나 빼는 고장을 냈는데 이 시험이 안 걸렸다.
execFileSync(process.execPath, [path.join(여기, '빌드.mjs'), '--배포'], { cwd: 뿌리, stdio: 'pipe' });

/**
 * 클라이언트마다 다르게 두드린다.
 *
 * `프로토콜` 은 각자가 실제로 보내는 값이다. 서버는 **모르는 판이 와도**
 * 제 판으로 답해야 한다 — 거절하면 그 클라이언트에서 안 붙는다.
 */
const { SUPPORTED_PROTOCOL_VERSIONS, LATEST_PROTOCOL_VERSION } =
  await import('@modelcontextprotocol/sdk/types.js');

/** 이 판을 쓰는 것으로 **확인된** 클라이언트. 아는 것만 적는다 */
const 쓰는곳 = {
  '2025-06-18': 'Claude',
  '2025-03-26': 'Codex',
  '2024-11-05': 'Gemini · 안티그래비티',
};

/**
 * 규격판마다 하나씩. **두드리는 버릇은 돌아가며 섞는다** —
 * 「옛 판 + 알림 없음」 처럼 둘이 겹칠 때만 나는 탈이 있다.
 */
const 클라이언트들 = SUPPORTED_PROTOCOL_VERSIONS.map((판, i) => ({
  이름: 쓰는곳[판] ?? '(쓰는 곳 모름)',
  프로토콜: 판,
  initialized보냄: i % 2 === 0,
  tools인자: i % 3 === 0 ? undefined : {},   // params 를 아예 안 보내기도 한다
}));

// **모르는 판을 보내는 쪽.** 서버는 거절하지 말고 제 판으로 답해야 한다.
클라이언트들.push({
  이름: '(모르는 판)',
  프로토콜: '2099-01-01',
  initialized보냄: true,
  tools인자: {},
});

// **숫자를 못박지 않는다.** 소스가 정의한 목록과 견준다.
const { 도구들 } = await import(pathToFileURL(
  path.join(뿌리, '검증', '.빌드전체', 'packages', 'server', 'src', 'index.js')).href);
const 있어야할것 = 도구들.map((t) => t.name).sort();

const 탈 = [];
const 나온것 = [];

for (const c of 클라이언트들) {
  const r = await 두드리기(c);
  나온것.push(r);

  if (!r.떴나) { 탈.push(`${c.이름}: 서버가 안 떴다`); continue; }
  if (!r.초기화답) { 탈.push(`${c.프로토콜}: initialize 에 답을 안 한다`); continue; }
  // **규격**: 아는 판이면 그 판으로, 모르는 판이면 제가 아는 최신 판으로 답한다.
  const 아는판 = SUPPORTED_PROTOCOL_VERSIONS.includes(c.프로토콜);
  if (아는판 && r.서버판 !== c.프로토콜) {
    탈.push(`${c.프로토콜} 을 보냈는데 서버가 ${r.서버판} 로 답한다 (아는 판은 그대로 돌려줘야 한다)`);
  }
  if (!아는판 && r.서버판 !== LATEST_PROTOCOL_VERSION) {
    탈.push(`모르는 판을 보냈는데 서버가 ${r.서버판} 로 답한다 (제가 아는 최신 판으로 답해야 한다)`);
  }
  const 빠진것 = 있어야할것.filter((n) => !r.도구들.includes(n));
  if (빠진것.length) 탈.push(`${c.이름}: 도구 ${빠진것.length}개가 안 보인다 (${빠진것.join(', ')})`);
  if (r.만든것 !== true) 탈.push(`${c.이름}: 문서를 못 만들었다 — ${r.왜 ?? ''}`);
  if (r.stderr잡소리) 탈.push(`${c.이름}: stderr 에 잡소리 — ${r.stderr잡소리.slice(0, 100)}`);
}

// 어느 판으로 물어도 **같은** 도구 목록을 봐야 한다
const 목록들 = 나온것.map((r) => r.도구들.join(' '));
if (new Set(목록들).size > 1) {
  탈.push(`판마다 도구 목록이 다르다: ${목록들.map((x, i) => `${클라이언트들[i].프로토콜}=${x.split(' ').length}`).join(' / ')}`);
}

/** 클라이언트 하나를 흉내 내어 서버와 말해 본다 */
function 두드리기(c) {
  return new Promise((풀기) => {
    const p = spawn(process.execPath, [진입점], { stdio: ['pipe', 'pipe', 'pipe'] });
    let 나옴 = '', 에러 = '';
    p.stdout.on('data', (d) => { 나옴 += d; });
    p.stderr.on('data', (d) => { 에러 += d; });
    const 보내기 = (o) => p.stdin.write(`${JSON.stringify(o)}\n`);

    보내기({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: c.프로토콜, capabilities: {},
        clientInfo: { name: c.이름, version: '1.0.0' },
      },
    });

    setTimeout(() => {
      if (c.initialized보냄) 보내기({ jsonrpc: '2.0', method: 'notifications/initialized' });
      보내기(c.tools인자 === undefined
        ? { jsonrpc: '2.0', id: 2, method: 'tools/list' }
        : { jsonrpc: '2.0', id: 2, method: 'tools/list', params: c.tools인자 });
    }, 600);

    // 도구를 실제로 불러 본다 — 목록만 보는 것으로는 모자라다
    setTimeout(() => 보내기({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'create_document', arguments: {} },
    }), 1200);

    setTimeout(() => {
      p.kill();
      const 답들 = 나옴.split('\n').filter(Boolean).map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
      const 첫 = 답들.find((x) => x.id === 1);
      const 목록 = 답들.find((x) => x.id === 2)?.result?.tools ?? [];
      const 부른것 = 답들.find((x) => x.id === 3)?.result;
      풀기({
        이름: c.이름,
        떴나: 에러.includes('stdio 로 붙었다'),
        초기화답: Boolean(첫?.result?.serverInfo),
        서버판: 첫?.result?.protocolVersion,
        도구들: 목록.map((t) => t.name).sort(),
        만든것: 부른것?.isError !== true
          && typeof 부른것?.structuredContent?.doc_id === 'string',
        왜: 부른것?.content?.[0]?.text?.slice(0, 80),
        stderr잡소리: 에러.split('\n')
          .filter((l) => l.trim() && !l.includes('stdio 로 붙었다')).join(' '),
      });
    }, 2200);
  });
}

// ── 알림 ──────────────────────────────────────────────────────────────────
console.log(`규격판 확인표 — SDK 가 받는 ${SUPPORTED_PROTOCOL_VERSIONS.length}판 + 모르는 판 하나`);
console.log('');
console.log(`  ${'보낸 판'.padEnd(14)}${'서버 판'.padEnd(14)}${'도구'.padEnd(6)}${'만들기'.padEnd(8)}쓰는 곳`);
for (const [i, r] of 나온것.entries()) {
  console.log(`  ${클라이언트들[i].프로토콜.padEnd(14)}${(r.서버판 ?? '—').padEnd(14)}`
    + `${String(r.도구들.length).padEnd(6)}${(r.만든것 ? '○' : '✗').padEnd(8)}${r.이름}`);
}
console.log(탈.length ? `\n탈 ${탈.length}건`
  : `\n탈 없음 — ${나온것.length}판 다 같은 도구 ${나온것[0].도구들.length}개를 보고 문서를 만든다`);
for (const t of 탈) console.log(`  ✗ ${t}`);
process.exit(탈.length ? 1 : 0);
