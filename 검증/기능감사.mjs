/**
 * **기능 감사 — 도구가 "됐다" 하면서 아무것도 안 하는 곳이 있나.**
 *
 * 가장 나쁜 실패는 터지는 것이 아니라 **조용한 무동작**이다.
 * 터지면 모델이 다른 길을 찾는다. "됐다" 고 하면 모델은 다음으로 넘어가고,
 * 사람은 다 끝난 줄 알고 파일을 연다.
 *
 * 지금 쓰는 MCP 에서 실제로 겪었다:
 *   `set_paragraph_style` 에 `margin_left: 20` 을 주면
 *   "Paragraph style applied" 라고 답하는데 **0 이 쓰인다.**
 *
 * 그래서 도구마다 두 가지를 묻는다:
 *   1. 고치는 도구가 "됐다" 했으면 **정말 바이트가 달라졌나**
 *   2. 읽는 도구가 **문서를 더럽히지 않았나** (읽었을 뿐인데 dirty 가 켜지면 안 된다)
 *
 * 하나라도 걸리면 0 이 아닌 값으로 끝난다 — 빌드가 깨진다.
 *
 *   node 검증/기능감사.mjs
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const B = (p) => pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', p, 'src', 'index.js')).href;

const { 도구부르기, 문서방, 도구들 } = await import(B('server'));

const 무대 = path.join(os.tmpdir(), 'hwpx-audit');
fs.rmSync(무대, { recursive: true, force: true });
fs.mkdirSync(무대, { recursive: true });

const 탈 = [];
const 본것 = [];
/** 어느 도구를 실제로 불러 봤나 — 안 불러 본 도구가 있으면 감사가 거짓말이다 */
const 불러본것 = new Set();

async function 부르기(이름, 인자, 방) {
  불러본것.add(이름);
  return 도구부르기(이름, 인자, 방);
}

function 적기(도구, 됐나, 말) {
  본것.push(`  ${됐나 ? '○' : '✗'} ${도구.padEnd(17)} ${말}`);
  if (!됐나) 탈.push(`${도구}: ${말}`);
}

// ── 판을 차린다 ───────────────────────────────────────────────────────────
const 방 = new 문서방();
const 원본 = path.join(뿌리, '자료', '기준파일', 'ref-table-basic.hwpx');
const 일할것 = path.join(무대, 'work.hwpx');
fs.copyFileSync(원본, 일할것);

// ── 1. create_document — 손잡이가 나오고, 목록에 뜬다 ─────────────────────
{
  const r = await 부르기('create_document', {}, 방);
  const id = r.structuredContent?.doc_id;
  const 목록 = await 부르기('list_documents', {}, 방);
  const 안에있나 = (목록.structuredContent?.documents ?? []).some((x) => x.doc_id === id);
  적기('create_document', Boolean(id) && 안에있나,
    id ? `손잡이 ${id}${안에있나 ? '' : ' — **목록에 안 뜬다**'}` : '손잡이를 안 준다');
}

// ── 2. open_document — 진짜로 읽어 온다 ───────────────────────────────────
let 연것;
{
  const r = await 부르기('open_document', { path: 일할것 }, 방);
  연것 = r.structuredContent?.doc_id;
  const s = r.structuredContent ?? {};
  // 표가 든 파일을 열었는데 표 0개라고 하면, 열었다는 말만 하고 안 읽은 것이다
  적기('open_document', Boolean(연것) && s.tables > 0 && s.paragraphs > 0,
    연것 ? `문단 ${s.paragraphs} · 표 ${s.tables}` : `못 열었다: ${r.content?.[0]?.text ?? ''}`);
}

// ── 3. 읽는 도구는 **문서를 더럽히지 않는다** ─────────────────────────────
{
  const 앞바이트 = fs.readFileSync(일할것);
  // get_content 는 가리킬 것이 있어야 한다 — 뼈대에서 첫 문단 id 를 얻는다
  const 뼈대0 = await 부르기('get_outline', { doc_id: 연것 }, 방);
  const 첫id = (뼈대0.structuredContent?.items ?? [])[0]?.id;
  if (!첫id) 적기('get_outline', false, '**뼈대가 비었다 — 가리킬 것이 없다**');

  for (const [도구, 인자] of [
    ['get_outline', { doc_id: 연것 }],
    ['get_content', { doc_id: 연것, id: 첫id }],
    ['find', { doc_id: 연것, text: '가' }],
    ['get_styles', { doc_id: 연것 }],
  ]) {
    const r = await 부르기(도구, 인자, 방);
    if (r.isError) { 적기(도구, false, `읽기가 실패했다: ${r.content?.[0]?.text ?? ''}`); continue; }
    const 낸것 = r.structuredContent ?? {};
    const 알맹이 = Object.values(낸것).some((v) => Array.isArray(v) ? v.length > 0 : v !== undefined);
    적기(도구, 알맹이, 알맹이 ? '읽었다' : '**빈 것을 돌려준다**');
  }

  // 읽기만 했는데 저장하면 바이트가 달라지나 — 달라지면 읽기가 문서를 건드린 것이다
  const 되쓴곳 = path.join(무대, 'after-read.hwpx');
  const s = await 부르기('save_document', { doc_id: 연것, path: 되쓴곳 }, 방);
  const 같나 = !s.isError && fs.readFileSync(되쓴곳).equals(앞바이트);
  적기('(읽기 뒤 저장)', 같나,
    같나 ? '읽기만 해서는 바이트가 안 바뀐다'
      : '**읽기만 했는데 바이트가 달라졌다** — 읽기가 문서를 건드린다');
}

// ── 4. compose — "됐다" 했으면 진짜 달라져야 한다 ─────────────────────────
{
  const 앞 = fs.readFileSync(path.join(무대, 'after-read.hwpx'));
  const r = await 부르기('compose', {
    doc_id: 연것,
    blocks: [{ kind: 'body', text: '감사가 넣은 줄' }],
  }, 방);
  const 뒤곳 = path.join(무대, 'after-compose.hwpx');
  const s = await 부르기('save_document', { doc_id: 연것, path: 뒤곳 }, 방);
  const 달라졌나 = !r.isError && !s.isError && !fs.readFileSync(뒤곳).equals(앞);
  적기('compose', 달라졌나,
    r.isError ? `실패했다: ${r.content?.[0]?.text ?? ''}`
      : 달라졌나 ? '넣었다고 하고 진짜 달라졌다'
        : '**됐다고 하는데 바이트가 그대로다 (무동작)**');

  // 넣은 글이 정말 문서에 있나 — 바이트만 달라지고 글이 없을 수도 있다
  const 뼈대 = await 부르기('get_outline', { doc_id: 연것 }, 방);
  const 있나 = (뼈대.structuredContent?.items ?? []).some((x) => (x.preview ?? '').includes('감사가 넣은 줄'));
  적기('(compose 결과)', 있나, 있나 ? '넣은 글이 뼈대에 보인다' : '**넣은 글이 문서에 없다**');
}

// ── 4의2. edit — 고친다고 했으면 진짜 달라져야 한다 ──────────────────────
{
  const 앞 = fs.readFileSync(path.join(무대, 'after-compose.hwpx'));
  const 뼈대 = await 부르기('get_outline', { doc_id: 연것 }, 방);
  const 문단 = (뼈대.structuredContent?.items ?? []).find((x) => x.kind === 'paragraph');
  if (!문단) {
    적기('edit', false, '**고칠 문단을 못 찾았다** — get_outline 이 문단을 안 낸다');
  } else {
    const r = await 부르기('edit', {
      doc_id: 연것,
      edits: [{ op: 'set_text', id: 문단.id, text: '감사가 고친 줄' }],
    }, 방);
    const 뒤곳 = path.join(무대, 'after-edit.hwpx');
    const s = await 부르기('save_document', { doc_id: 연것, path: 뒤곳, overwrite: true }, 방);
    const 달라졌나 = !r.isError && !s.isError && !fs.readFileSync(뒤곳).equals(앞);
    적기('edit', 달라졌나,
      r.isError ? `실패했다: ${(r.content?.[0]?.text ?? '').slice(0, 60)}`
        : 달라졌나 ? '고쳤다고 하고 진짜 달라졌다'
          : '**됐다고 하는데 바이트가 그대로다 (무동작)**');

    const 확인 = await 부르기('find', { doc_id: 연것, text: '감사가 고친 줄' }, 방);
    적기('(edit 결과)', (확인.structuredContent?.count ?? 0) > 0,
      (확인.structuredContent?.count ?? 0) > 0 ? '고친 글이 문서에 있다' : '**고친 글이 문서에 없다**');
  }
}

// ── 5. 못 하는 것은 **못 한다고 말해야 한다** ─────────────────────────────
{
  const 갈래 = [
    ['없는 문서 손잡이', 'get_outline', { doc_id: 'doc_없는것' }],
    ['빈 블록 목록', 'compose', { doc_id: 연것, blocks: [] }],
    ['모르는 블록 갈래', 'compose', { doc_id: 연것, blocks: [{ kind: '없는갈래', text: 'ㅁ' }] }],
    ['상대 경로', 'open_document', { path: 'ref-table-basic.hwpx' }],
    ['없는 파일', 'open_document', { path: path.join(무대, '없는파일.hwpx') }],
    ['빈 고침 목록', 'edit', { doc_id: 연것, edits: [] }],
    ['없는 것을 찾아 바꾸기', 'edit', { doc_id: 연것, edits: [{ op: 'replace', find: '있지도 않은 글', replace: 'x' }] }],
  ];
  for (const [왜, 도구, 인자] of 갈래) {
    const r = await 부르기(도구, 인자, 방);
    const 말 = r.content?.[0]?.text ?? '';
    // 거절할 때는 **어떻게 하면 되는지**까지 말해야 한다
    적기(`(거절) ${왜}`, r.isError === true && 말.includes('→'),
      r.isError ? (말.includes('→') ? '거절하고 길을 알려 준다' : '**거절만 하고 길을 안 알려 준다**')
        : '**못 하는데 됐다고 한다**');
  }
}

// ── 6. save_document — 덮어쓰기를 함부로 안 한다 ──────────────────────────
{
  const 있는곳 = path.join(무대, 'after-compose.hwpx');
  const r = await 부르기('save_document', { doc_id: 연것, path: 있는곳 }, 방);
  적기('save_document', r.isError === true,
    r.isError ? 'overwrite 없이는 덮어쓰지 않는다' : '**있는 파일을 말없이 덮어썼다**');

  const r2 = await 부르기('save_document', { doc_id: 연것, path: 있는곳, overwrite: true }, 방);
  적기('(overwrite)', !r2.isError && fs.existsSync(있는곳),
    r2.isError ? `overwrite 를 줘도 안 쓴다: ${r2.content?.[0]?.text ?? ''}` : '허락하면 덮어쓴다');
}

// ── 7. close_document — 닫으면 정말 없어진다 ─────────────────────────────
{
  const r = await 부르기('close_document', { doc_id: 연것 }, 방);
  const 목록 = await 부르기('list_documents', {}, 방);
  const 아직있나 = (목록.structuredContent?.documents ?? []).some((x) => x.doc_id === 연것);
  const 써보기 = await 부르기('get_outline', { doc_id: 연것 }, 방);
  적기('close_document', !r.isError && !아직있나 && 써보기.isError === true,
    아직있나 ? '**닫았다는데 목록에 남아 있다**'
      : 써보기.isError ? '닫히고 손잡이도 죽었다' : '**닫았는데 손잡이가 아직 먹는다**');
}

// ── 8. 감사가 도구를 하나도 안 빼먹었나 ───────────────────────────────────
{
  const 있는도구 = 도구들.map((t) => t.name).sort();
  const 안본것 = 있는도구.filter((n) => !불러본것.has(n));
  적기('(감사 자신)', 안본것.length === 0,
    안본것.length ? `**감사가 안 불러 본 도구 ${안본것.length}개: ${안본것.join(', ')}**`
      : `도구 ${있는도구.length}개를 다 불러 봤다`);
}

// ── 알림 ──────────────────────────────────────────────────────────────────
console.log('기능 감사 — "됐다" 하면서 아무것도 안 하는 곳이 있나');
console.log(본것.join('\n'));
console.log(탈.length ? `\n무동작·거짓말 ${탈.length}건` : '\n무동작 없음');
for (const t of 탈) console.log(`  ✗ ${t}`);
process.exit(탈.length ? 1 : 0);
