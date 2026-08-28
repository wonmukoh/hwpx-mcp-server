/**
 * MCP 서버 — 도구를 프로토콜에 물린다.
 *
 * ## 저수준 `Server` 를 쓰는 까닭
 *
 * SDK 의 `McpServer.registerTool` 은 Zod 를 받아 JSON Schema 로 바꿔 준다. 편하다.
 * 하지만 **무엇이 나갈지 우리가 모른다** — 선택 인자 하나가 `anyOf` 로 나가도 알 길이 없다.
 *
 * 클라이언트마다 JSON Schema 를 받아들이는 범위가 다르고,
 * 넓게 쓰면 어떤 클라이언트에서는 도구가 아예 안 보인다.
 * 그래서 스키마를 손으로 쓰고([`스키마.ts`](스키마.ts)) 린터로 지킨다.
 *
 * ## 도구 목록은 캐시해도 된다고 말한다
 *
 * 우리 도구 목록은 안 바뀐다. `ttlMs` 를 붙여 두면 클라이언트가 매번 안 물어본다.
 * 그리고 **늘 같은 순서로** 준다 — 순서가 흔들리면 캐시가 계속 깨진다.
 *
 * ## 예외를 밖으로 던지지 않는다
 *
 * 도구가 터지면 프로토콜 오류가 되어 모델이 고쳐 볼 기회를 못 얻는다.
 * 무슨 일이 나든 `isError: true` 인 **결과**로 바꿔 돌려준다.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { 도구들, type 도구 } from './도구.js';
import { 문서방 } from './문서방.js';
import { 못함 } from './결과내기.js';

export const 서버이름 = 'hwpx-mcp';

/**
 * **판 번호는 `package.json` 에서 읽는다.**
 *
 * 여기에 따로 적어 두면 갈라진다 — 실제로 갈라졌다.
 * `package.json` 은 0.4.0 인데 서버는 클라이언트에게 **0.1.0 이라고 말하고 있었다.**
 * 짜서 깔아 보는 갈래가 「서버 판 0.1.0」 을 찍어 줘서 알았다.
 *
 * 못 읽으면 `0.0.0` 이다 — 그럴듯한 수를 지어내면 갈라진 것을 못 알아본다.
 */
export const 서버판: string = (() => {
  try {
    const 여기 = path.dirname(fileURLToPath(import.meta.url));
    // dist/packages/server/src → 뿌리. 소스에서 돌 때도 같은 깊이다.
    for (let d = 여기, i = 0; i < 8; i++, d = path.dirname(d)) {
      const p = path.join(d, 'package.json');
      if (!fs.existsSync(p)) continue;
      const j = JSON.parse(fs.readFileSync(p, 'utf8')) as { name?: string; version?: string };
      if (j.name === 서버이름 && typeof j.version === 'string') return j.version;
    }
  } catch { /* 못 읽으면 아래로 */ }
  return '0.0.0';
})();

/** 도구 목록을 얼마나 캐시해도 되나 */
export const 목록캐시밀리초 = 60 * 60 * 1000;

/** 도구를 **늘 같은 순서로.** 순서가 흔들리면 클라이언트 캐시가 계속 깨진다 */
export function 차림표(목록: 도구[] = 도구들) {
  return [...목록]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
      ...(t.annotations ? { annotations: t.annotations } : {}),
    }));
}

/**
 * 도구 하나를 부른다. **무슨 일이 나든 결과로 돌려준다.**
 *
 * 시험에서도 이걸 부른다 — 프로토콜을 안 태우고 도구만 볼 수 있어야 한다.
 */
export async function 도구부르기(
  이름: string,
  인자: Record<string, unknown> | undefined,
  방: 문서방,
  목록: 도구[] = 도구들,
) {
  const t = 목록.find((x) => x.name === 이름);
  if (!t) {
    return 못함(
      `${이름} 이라는 도구가 없다`,
      `있는 도구: ${목록.map((x) => x.name).join(', ')}`,
    );
  }
  try {
    return await t.처리(인자 ?? {}, 방);
  } catch (e) {
    const 말 = e instanceof Error ? e.message : String(e);
    return 못함(
      `${이름} 이 터졌다: ${말.split('\n')[0]}`,
      '인자를 줄여 다시 해 보라. 그래도 터지면 이 MCP 의 버그다.',
    );
  }
}

/** 서버를 조립한다 (아직 붙이지는 않는다) */
export function 서버만들기(방: 문서방 = new 문서방(), 목록: 도구[] = 도구들): Server {
  const s = new Server(
    { name: 서버이름, version: 서버판 },
    { capabilities: { tools: { listChanged: false } } },
  );

  s.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: 차림표(목록),
    _meta: { 'io.modelcontextprotocol/tool-list-cache': { ttlMs: 목록캐시밀리초, cacheScope: 'server' } },
  }));

  s.setRequestHandler(CallToolRequestSchema, async (요청) => {
    const 이름 = 요청.params.name;
    const 인자 = 요청.params.arguments as Record<string, unknown> | undefined;
    // SDK 의 결과 형은 Tasks 확장까지 아우르느라 넓다.
    // 우리는 그 가운데 CallToolResult 하나만 쓴다.
    return (await 도구부르기(이름, 인자, 방, 목록)) as unknown as Record<string, unknown>;
  });

  return s;
}

/** stdio 로 붙인다. 진입점이 부른다 */
export async function 붙이기(방: 문서방 = new 문서방()): Promise<void> {
  const s = 서버만들기(방);
  await s.connect(new StdioServerTransport());
}
