/**
 * **서버가 순수 Node 로 떠서 MCP 로 말하는가.**
 *
 * 이건 안쪽 함수를 부르는 시험이 아니다. 진짜로:
 *   1. `node bin/hwpx-mcp.mjs` 를 **자식 프로세스로 띄우고**
 *   2. stdio 로 JSON-RPC 를 주고받고
 *   3. `tools/list` 와 `tools/call` 을 실제로 태운다
 *
 * ## 왜 이렇게까지 하나
 *
 * 이 MCP 를 물고 쓰는 앱(Draftsmith)이 서버를 `ELECTRON_RUN_AS_NODE=1` +
 * `process.execPath` 로 띄운다. **번들러도 로더도 없다.**
 * 안쪽 시험만 통과하고 진입점이 안 뜨면 앱에서는 아무것도 안 된다.
 *
 * 그리고 stdio 로 말하므로 **표준출력에 아무거나 쓰면 프로토콜이 깨진다.**
 * 그것도 여기서만 잡힌다.
 *
 *   node 검증/서버시험.mjs
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const 진입점 = path.join(뿌리, 'packages', 'server', 'bin', 'hwpx-mcp.mjs');

const 탈 = [];
const 본것 = {};

// ── 0. 배포용을 굽는다 ────────────────────────────────────────────────────
{
  const r = spawnSync(process.execPath, [path.join(여기, '빌드.mjs'), '--배포'], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('배포용 굽기가 실패했다:\n' + (r.stdout ?? '') + (r.stderr ?? ''));
    process.exit(1);
  }
}

// ── stdio 로 말하는 작은 손님 ─────────────────────────────────────────────
class 손님 {
  constructor(아이) {
    this.아이 = 아이;
    this.다음번호 = 1;
    this.기다리는것 = new Map();
    this.남은글 = '';
    this.stderr = '';
    아이.stdout.setEncoding('utf8');
    아이.stdout.on('data', (조각) => this.받기(조각));
    아이.stderr.setEncoding('utf8');
    아이.stderr.on('data', (조각) => { this.stderr += 조각; });
  }

  받기(조각) {
    this.남은글 += 조각;
    let i;
    while ((i = this.남은글.indexOf('\n')) !== -1) {
      const 줄 = this.남은글.slice(0, i).trim();
      this.남은글 = this.남은글.slice(i + 1);
      if (!줄) continue;
      let 답;
      try {
        답 = JSON.parse(줄);
      } catch {
        // 표준출력에 JSON 이 아닌 것이 나왔다 — 프로토콜이 깨진다
        탈.push(`표준출력에 JSON 이 아닌 줄이 나왔다: «${줄.slice(0, 80)}»`);
        continue;
      }
      const 기다림 = this.기다리는것.get(답.id);
      if (기다림) { this.기다리는것.delete(답.id); 기다림(답); }
    }
  }

  부르기(방법, 인자) {
    const id = this.다음번호++;
    const 글 = JSON.stringify({ jsonrpc: '2.0', id, method: 방법, params: 인자 ?? {} });
    return new Promise((풀기, 깨기) => {
      const 시계 = setTimeout(() => {
        this.기다리는것.delete(id);
        깨기(new Error(`${방법} 가 20초 안에 안 왔다`));
      }, 20_000);
      this.기다리는것.set(id, (답) => { clearTimeout(시계); 풀기(답); });
      this.아이.stdin.write(글 + '\n');
    });
  }

  알림(방법, 인자) {
    this.아이.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 방법, params: 인자 ?? {} }) + '\n');
  }
}

// ── 1. 띄운다 ─────────────────────────────────────────────────────────────
// 앱이 하는 그대로: 번들러도 로더도 없이 그냥 node
const 아이 = spawn(process.execPath, [진입점], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NODE_EXTRA_CA_CERTS: process.env['NODE_EXTRA_CA_CERTS'] ?? '' },
});
const c = new 손님(아이);

const 끝내기 = (코드) => {
  try { 아이.kill(); } catch { /* 이미 죽었으면 그만 */ }
  console.log('서버 시험 — 순수 node 로 띄워 stdio 로 말하기');
  for (const [k, v] of Object.entries(본것)) {
    if (Array.isArray(v)) { console.log(`  ${k}:`); for (const l of v) console.log(`    ${l}`); }
    else console.log(`  ${k.padEnd(12)} ${v}`);
  }
  console.log(탈.length ? `\n탈 ${탈.length}건` : '\n탈 없음');
  for (const t of 탈) console.log(`  ✗ ${t}`);
  process.exit(코드 ?? (탈.length ? 1 : 0));
};

try {
  // ── 2. 손잡이 맞추기 ────────────────────────────────────────────────────
  const 첫인사 = await c.부르기('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: '서버시험', version: '0' },
  });
  if (첫인사.error) 탈.push(`initialize 가 오류를 냈다: ${JSON.stringify(첫인사.error)}`);
  본것.서버 = `${첫인사.result?.serverInfo?.name} ${첫인사.result?.serverInfo?.version}`;
  c.알림('notifications/initialized');

  // ── 3. 도구 목록 ────────────────────────────────────────────────────────
  const 목록 = await c.부르기('tools/list');
  if (목록.error) 탈.push(`tools/list 가 오류를 냈다: ${JSON.stringify(목록.error)}`);
  const 도구들 = 목록.result?.tools ?? [];
  본것.도구수 = 도구들.length;
  본것.도구 = 도구들.map((t) => t.name);

  if (도구들.length === 0) 탈.push('도구가 하나도 안 나왔다');
  if (도구들.length > 30) 탈.push(`도구가 ${도구들.length}개다 — 30개 안쪽이어야 한다`);

  for (const t of 도구들) {
    if (!t.description || t.description.length < 40) {
      탈.push(`${t.name} 의 설명이 너무 짧다 (${t.description?.length ?? 0}자) — 모델이 언제 쓸지 모른다`);
    }
    if (!t.inputSchema) 탈.push(`${t.name} 에 inputSchema 가 없다`);
  }

  // 읽기 도구에 readOnlyHint 가 붙었나
  for (const 이름 of ['get_outline', 'get_content', 'find', 'get_styles', 'list_documents']) {
    const t = 도구들.find((x) => x.name === 이름);
    if (!t) { 탈.push(`${이름} 도구가 없다`); continue; }
    if (t.annotations?.readOnlyHint !== true) {
      탈.push(`${이름} 에 readOnlyHint 가 없다 — 호스트가 확인 없이 통과시킬 수 있어야 탐색이 가볍다`);
    }
  }
  const 저장 = 도구들.find((x) => x.name === 'save_document');
  if (저장 && 저장.annotations?.destructiveHint !== true) {
    탈.push('save_document 에 destructiveHint 가 없다 — 덮어쓸 수 있는 도구다');
  }

  // 목록이 늘 같은 순서인가
  const 두번째 = await c.부르기('tools/list');
  const 두번째이름 = (두번째.result?.tools ?? []).map((t) => t.name);
  if (두번째이름.join(',') !== 본것.도구.join(',')) {
    탈.push('tools/list 를 두 번 불렀더니 순서가 달라졌다 — 클라이언트 캐시가 계속 깨진다');
  }

  // ── 4. 한 바퀴 돌려 본다 ────────────────────────────────────────────────
  const 만들기 = await c.부르기('tools/call', { name: 'create_document', arguments: {} });
  const 만든것 = 만들기.result;
  if (만든것?.isError) 탈.push(`create_document 가 실패했다: ${만든것.content?.[0]?.text}`);

  // 결과가 세 겹인가
  if (!만든것?.content?.[0]?.text) 탈.push('content[0] (사람이 읽는 요약) 이 없다');
  if (!만든것?.content?.[1]?.text) 탈.push('content[1] (JSON 글자) 이 없다 — 구버전 클라이언트가 값을 못 본다');
  if (!만든것?.structuredContent) 탈.push('structuredContent 가 없다');
  if (만든것?.content?.[1]?.text && 만든것?.structuredContent) {
    let 같나 = false;
    try { 같나 = JSON.stringify(JSON.parse(만든것.content[1].text)) === JSON.stringify(만든것.structuredContent); } catch { /* 아래서 잡는다 */ }
    if (!같나) 탈.push('content[1] 의 JSON 과 structuredContent 가 다르다');
  }

  const doc_id = 만든것?.structuredContent?.doc_id;
  if (!doc_id) { 탈.push('doc_id 를 못 받았다'); 끝내기(); }
  본것.doc_id = doc_id;

  const 조판 = await c.부르기('tools/call', {
    name: 'compose',
    arguments: {
      doc_id,
      blocks: [
        { kind: 'title', text: '서버 시험 문서', date: '2026. 8.', org: '교 육 부' },
        { kind: 'heading', text: '(1) [[MCP]] 로 만든 줄' },
        { kind: 'body', text: '이 문단은 **서버를 거쳐** 들어왔다.' },
        { kind: 'table', headers: ['가', '나'], rows: [['1', '2']] },
      ],
      page_number: 'bottom-center',
    },
  });
  if (조판.result?.isError) 탈.push(`compose 가 실패했다: ${조판.result.content?.[0]?.text}`);
  본것.만든요소 = 조판.result?.structuredContent?.elements;

  const 뼈대 = await c.부르기('tools/call', { name: 'get_outline', arguments: { doc_id } });
  const 것들 = 뼈대.result?.structuredContent?.items ?? [];
  본것.뼈대 = 것들.slice(0, 4).map((x) => `${x.kind} ${x.id} «${x.preview}»`);
  if (!것들.some((x) => x.kind === 'table')) 탈.push('get_outline 에 표가 안 보인다');

  const 찾기 = await c.부르기('tools/call', {
    name: 'find', arguments: { doc_id, text: '서버를 거쳐' },
  });
  if (찾기.result?.isError) 탈.push('find 가 넣은 글을 못 찾았다');

  // 저장
  const 무대 = path.join(os.tmpdir(), 'hwpx-server-test');
  fs.rmSync(무대, { recursive: true, force: true });
  fs.mkdirSync(무대, { recursive: true });
  const 낼곳 = path.join(무대, 'from-server.hwpx');

  const 저장하기 = await c.부르기('tools/call', {
    name: 'save_document', arguments: { doc_id, path: 낼곳 },
  });
  if (저장하기.result?.isError) 탈.push(`save_document 가 실패했다: ${저장하기.result.content?.[0]?.text}`);
  if (!fs.existsSync(낼곳)) 탈.push('파일이 안 나왔다');
  else 본것.바이트 = fs.statSync(낼곳).size;

  // 덮어쓰기를 막나
  const 또저장 = await c.부르기('tools/call', {
    name: 'save_document', arguments: { doc_id, path: 낼곳 },
  });
  if (!또저장.result?.isError) 탈.push('이미 있는 파일을 overwrite 없이 덮어썼다');

  // ── 5. 못 하는 것을 못 한다고 하나 ──────────────────────────────────────
  const 나쁜것 = [
    ['없는 doc_id', { name: 'get_outline', arguments: { doc_id: 'doc_zzzzzz' } }, '다시'],
    ['상대 경로', { name: 'open_document', arguments: { path: '문서.hwpx' } }, '절대 경로'],
    ['모르는 인자', { name: 'create_document', arguments: { 엉뚱한것: 1 } }, '쓸 수 있는 것'],
    ['안 닫힌 표시', { name: 'compose', arguments: { doc_id, blocks: [{ kind: 'body', text: '앞 **안 닫음' }] } }, '안 닫혔다'],
    ['모르는 도구', null, null],
  ];
  for (const [이름, 인자, 있어야할말] of 나쁜것) {
    const 답 = 인자
      ? await c.부르기('tools/call', 인자)
      : await c.부르기('tools/call', { name: '없는도구', arguments: {} });
    const r = 답.result;
    if (!r?.isError) { 탈.push(`${이름}: 막았어야 하는데 통과했다`); continue; }
    const 말 = r.content?.[0]?.text ?? '';
    if (있어야할말 && !말.includes(있어야할말)) {
      탈.push(`${이름}: 오류 말에 '${있어야할말}' 이 없다 — «${말.slice(0, 90)}»`);
    }
    // 오류에도 '어떻게' 가 붙어야 한다
    if (!말.includes('→')) 탈.push(`${이름}: 어떻게 하라는 말이 없다 — «${말.slice(0, 90)}»`);
  }

  // ── 6. 표준출력을 더럽히지 않았나 ───────────────────────────────────────
  본것.stderr = c.stderr.trim().split('\n').slice(0, 2).join(' / ') || '(없음)';
} catch (e) {
  탈.push(`시험이 터졌다: ${e.message}`);
  if (c.stderr) 탈.push(`서버 stderr: ${c.stderr.trim().split('\n').slice(0, 3).join(' / ')}`);
}

끝내기();
