/**
 * **너무 큰 요청 하나에 서버가 죽지 않는다** (2026-10-07 견딤성 검토).
 *
 * SDK 는 요청 한 줄이 10MB 를 넘으면 transport 를 닫아, 서버가 말없이 끝나고 열어 둔
 * 문서가 다 사라졌다. 이제 그 줄만 버리고 다음 줄부터 읽는다. 실제 64MB 는 시험이 무거워
 * 한도를 작게 줘서 잰다 (실제 크기로는 30MB·100MB 를 손으로 재 봤다).
 */

import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 큰요청견디기 } from '../src/서버.js';

describe('큰 요청 견디기', () => {
  it('**한도를 넘는 줄만 버리고 다음 요청은 받는다** — transport 가 안 닫힌다', async () => {
    const 들어옴 = new PassThrough();
    const 나감 = new PassThrough();
    const t = new StdioServerTransport(들어옴, 나감, { maxBufferSize: 1_000_000 });
    expect(큰요청견디기(t, 1000)).toBe(true);
    const 받은것: unknown[] = [];
    let 닫힘 = false;
    t.onmessage = (m) => { 받은것.push(m); };
    t.onclose = () => { 닫힘 = true; };
    t.onerror = () => {};
    await t.start();

    const 줄 = (o: unknown) => `${JSON.stringify(o)}\n`;
    들어옴.write(줄({ jsonrpc: '2.0', id: 1, method: 'ping' }));
    // 한도(1000바이트)를 넘는 줄을 여러 조각으로 — 실제 파이프처럼
    const 큰것 = 줄({ jsonrpc: '2.0', id: 2, method: 'ping', params: { 글: 'x'.repeat(5000) } });
    for (let i = 0; i < 큰것.length; i += 700) 들어옴.write(큰것.slice(i, i + 700));
    들어옴.write(줄({ jsonrpc: '2.0', id: 3, method: 'ping' }));
    await new Promise((r) => setTimeout(r, 50));

    expect(닫힘).toBe(false);
    expect((받은것 as { id: number }[]).map((m) => m.id)).toEqual([1, 3]);
    await t.close();
  });
});
