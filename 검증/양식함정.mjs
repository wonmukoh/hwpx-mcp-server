/**
 * **학교 양식 함정 넷을 한글로 그려서 잰다** (2026-10-22 가산점 신청서).
 *
 * 넷 다 저장·규격 검사는 초록이었고 **한글로 PDF 를 떠 봐야만** 보였다. 그래서 여기서는
 * 도구로 고친 문서를 한글에게 PDF 로 굽게 하고, 글자가 어디에 몇 pt 로 찍혔는지 잰다.
 *
 *   빈문단      한글이 남긴 빈 문단(16pt 휴먼명조)에 긴 여러 줄 글 → 줄이 갈리나 · 16pt 인가
 *   칸서식      문단 셋인 칸에 set_style size 13 → 셋 다 13pt 인가
 *   켜진채나눔   글자처럼 취급하는 표에 긴 글 + page_break split 만 → 안 나뉜다 (그래서 끌 길이 있어야 한다)
 *   끄고나눔     treat_as_char false + split → 긴 칸이 두 쪽에 걸쳐 이어진다 (한글의 「나눔」)
 *   끄고셀단위   treat_as_char false + cell → 칸이 안 갈라진다 (「셀 단위로 나눔」)
 *
 * 끝의 둘이 쪽 넘김 짝을 잰다 — split 과 cell 이 뒤바뀌면 둘이 서로 자리를 바꿔 실패한다.
 *
 *   node 검증/양식함정.mjs
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { 파이썬찾기 } from './쪽가르기.mjs';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const B = (p) => pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', p, 'src', 'index.js')).href;
const { 도구부르기, 문서방 } = await import(B('server'));
const { childrenNamed, getAttr } = await import(B('owpml'));

const 파이썬 = 파이썬찾기();
if (!파이썬) { console.error('python(pymupdf)이 없어 잴 수 없다'); process.exit(1); }

// 경로에 한글을 넣지 않는다 — PowerShell 이 깨뜨린다
const 무대 = path.join(os.tmpdir(), 'hwpx-traps');
fs.rmSync(무대, { recursive: true, force: true });
fs.mkdirSync(무대, { recursive: true });
const 기준 = (이름) => path.join(뿌리, '자료', '기준파일', 이름);

async function 부름(방, 이름, 인자) {
  const r = await 도구부르기(이름, 인자, 방);
  if (r.isError) throw new Error(`${이름}: ${r.content[0]?.text}`);
  return r.structuredContent ?? {};
}
async function 열기(파일) {
  const 방 = new 문서방();
  const { doc_id } = await 부름(방, 'open_document', { path: 기준(파일) });
  return { 방, doc_id, d: 방.꺼내기(doc_id).d };
}
async function 표들(방, doc_id) {
  const { items } = await 부름(방, 'get_outline', { doc_id, in_tables: true });
  return items.filter((x) => x.kind === 'table').map((x) => x.id);
}
const 칸아이디 = (표, 줄, 칸) => `cell_${표.slice('tbl_'.length)}_${줄}_${칸}`;
async function 저장(방, doc_id, 이름) {
  const 길 = path.join(무대, `${이름}.hwpx`);
  await 부름(방, 'save_document', { doc_id, path: 길, overwrite: true });
  return 길;
}

/** 줄마다 글머리가 다른 긴 글 — 어느 줄이 몇 쪽에 찍혔는지 잴 수 있게 */
const 긴줄들 = (머리, 수) => Array.from({ length: 수 }, (_, i) => `${머리}${String(i + 1).padStart(2, '0')}`);

// ── 1. 도구로 고친다 ──────────────────────────────────────────────────────
const 갈래들 = [];

{
  // 빈문단 — 바깥 표 (1,0) 칸 안, 한글이 남긴 16pt 휴먼명조 빈 문단(charPr 24)
  const { 방, doc_id, d } = await 열기('ref-table-nested.hwpx');
  const [바깥] = await 표들(방, doc_id);
  const { paragraphs } = await 부름(방, 'get_content', { doc_id, id: 칸아이디(바깥, 1, 0) });
  const 빈것 = paragraphs.find((p) => {
    if (p.text !== '') return false;
    const r = d.찾기(p.id);
    const 런 = r.ok ? childrenNamed(r.value.문단.el, 'hp:run') : [];
    return 런.length === 1 && getAttr(런[0], 'charPrIDRef') === '24';
  });
  if (!빈것) throw new Error('ref-table-nested 에 16pt 빈 문단이 없다 — 이 갈래가 아무것도 못 잰다');
  const 글 = `${'빈문단글자가겹치나'.repeat(9)}\n줄나눔뒤둘째줄`;
  await 부름(방, 'edit', { doc_id, edits: [{ op: 'set_text', id: 빈것.id, text: 글 }] });
  갈래들.push({ 이름: 'empty-para', 뜻: '빈문단', 길: await 저장(방, doc_id, 'empty-para') });
}

{
  // 칸서식 — 바깥 표 (0,1) 칸, 문단 셋
  const { 방, doc_id } = await 열기('ref-table-nested.hwpx');
  const [바깥] = await 표들(방, doc_id);
  const 칸 = 칸아이디(바깥, 0, 1);
  await 부름(방, 'edit', { doc_id, edits: [
    { op: 'set_text', id: 칸, text: '갑갑갑갑\n을을을을\n병병병병' },
    { op: 'set_style', id: 칸, size: 13 },
  ] });
  갈래들.push({ 이름: 'cell-style', 뜻: '칸서식', 길: await 저장(방, doc_id, 'cell-style') });
}

for (const [이름, 뜻, 고침] of [
  ['tac-on-split', '켜진채나눔', { page_break: 'split' }],
  ['tac-off-split', '끄고나눔', { treat_as_char: false, page_break: 'split' }],
  ['tac-off-cell', '끄고셀단위', { treat_as_char: false, page_break: 'cell' }],
]) {
  // ref-table-pagebreak 의 첫 표 — 한글이 글자처럼 취급을 켜고 만든 1×1 표
  const { 방, doc_id } = await 열기('ref-table-pagebreak.hwpx');
  const [첫] = await 표들(방, doc_id);
  await 부름(방, 'edit', { doc_id, edits: [
    { op: 'set_text', id: 칸아이디(첫, 0, 0), text: 긴줄들('긴칸줄', 90).join('\n') },
    { op: 'set_table', id: 첫, ...고침 },
  ] });
  갈래들.push({ 이름, 뜻, 길: await 저장(방, doc_id, 이름) });
}

// ── 2. 한글로 PDF 를 굽는다 (한 번만 띄운다) ──────────────────────────────
{
  const NL = String.fromCharCode(10);
  const 줄 = ["$ErrorActionPreference='Continue'",
    '$hwp = New-Object -ComObject HWPFrame.HwpObject',
    // **창을 숨긴다.** 안 숨기면 한글 창이 앞으로 튀어나와 사용자의 클릭을 먹는다
    'try { $hwp.XHwpWindows.Item(0).Visible = $false } catch {}',
    'try { $hwp.SetMessageBoxMode(0x20000) | Out-Null } catch {}',
    'try { $hwp.RegisterModule("FilePathCheckDLL","FilePathCheckerModule") | Out-Null } catch {}',
    'try {'];
  for (const g of 갈래들) {
    const pdf = g.길.replace(/\.hwpx$/, '.pdf');
    줄.push('  try {');
    줄.push(`    if ($hwp.Open('${g.길}', "", "forceopen:true")) {`);
    줄.push(`      Write-Output ("PAGES ||| ${g.이름} ||| " + $hwp.PageCount)`);
    줄.push(`      if ($hwp.SaveAs('${pdf}', "PDF", "")) { Write-Output ("OK ||| ${g.이름}") } else { Write-Output ("SAVEFAIL ||| ${g.이름}") }`);
    줄.push(`    } else { Write-Output ("OPENFAIL ||| ${g.이름}") }`);
    줄.push(`  } catch { Write-Output ("THROW ||| ${g.이름} ||| " + $_.Exception.Message) }`);
    줄.push('  try { $hwp.Clear(1) | Out-Null } catch {}');
  }
  줄.push('} finally { try { $hwp.Quit() | Out-Null } catch {} }');
  const 스크립트 = path.join(무대, 'bake.ps1');
  fs.writeFileSync(스크립트, '﻿' + 줄.join(NL), 'utf8');
  let 나온것 = '';
  try {
    나온것 = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 스크립트],
      { encoding: 'buffer', timeout: 600_000, maxBuffer: 1 << 24 }).toString('utf8');
  } catch (e) {
    // 끝의 Quit 하나가 실패해도 판정은 이미 나와 있다 — 뱉은 것을 먼저 챙긴다
    나온것 = Buffer.isBuffer(e.stdout) ? e.stdout.toString('utf8') : String(e.stdout ?? '');
    console.log(`※ powershell 이 ${e.status} 로 끝났다 — 뱉어 놓은 판정은 그대로 읽는다`);
  }
  for (const 한줄 of 나온것.split(/\r?\n/)) {
    const [상태, 이름, 덧] = 한줄.split(' ||| ');
    const g = 갈래들.find((x) => x.이름 === 이름?.trim());
    if (!g) continue;
    if (상태 === 'PAGES') g.쪽수 = Number(덧);
    else g.한글 = 상태;
  }
}

// ── 3. PDF 에서 글자를 뽑는다 (쪽 · 글 · 크기 · 자리) ─────────────────────
function 글조각들(pdf) {
  const 코드 = [
    'import sys, json, pymupdf',
    'd = pymupdf.open(sys.argv[1])',
    'out = []',
    'for i, p in enumerate(d):',
    '    for b in p.get_text("dict")["blocks"]:',
    '        for l in b.get("lines", []):',
    '            for s in l["spans"]:',
    '                if s["text"].strip():',
    '                    out.append({"page": i + 1, "text": s["text"], "size": round(s["size"], 1), "font": s["font"], "bbox": [round(v, 1) for v in s["bbox"]]})',
    'with open(sys.argv[2], "w", encoding="utf-8") as f:',
    '    json.dump(out, f, ensure_ascii=False)',
  ].join(String.fromCharCode(10));
  const 임시 = path.join(무대, 'spans.py');
  fs.writeFileSync(임시, 코드, 'utf8');
  const 낼곳 = pdf.replace(/\.pdf$/, '.json');
  const r = spawnSync(파이썬, [임시, pdf, 낼곳], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`글자를 못 뽑았다: ${r.stderr}`);
  return JSON.parse(fs.readFileSync(낼곳, 'utf8'));
}

// ── 4. 잰다 ───────────────────────────────────────────────────────────────
//
// 2026-10-22 에 잰 값 (고친 뒤):
//   빈문단      15.9pt 휴먼명조, 세 줄로 갈리고 줄 나눔 뒤 줄이 넷째 줄 — 고치기 전에는 10pt 함초롬바탕으로
//               한 줄에 겹쳤다 (빈 줄 하나로 잰 줄 정보를 한글이 믿었다)
//   칸서식      갑·을·병 셋 다 12.9pt
//   켜진채나눔   2쪽으로 통째로 밀려 90줄 가운데 47줄만 보인다
//   끄고나눔     1쪽 01–39 · 2쪽 40–79 · 3쪽 80–90
//   끄고셀단위   2쪽으로 통째로 밀려 47줄만 보인다
const 크기맞나 = (s, pt) => Math.abs(s.size - pt) < 0.6;
const 판정 = [];
const 탈 = (g, 말) => 판정.push([g.뜻, 말]);

for (const g of 갈래들) {
  const pdf = g.길.replace(/\.hwpx$/, '.pdf');
  g.조각 = g.한글 === 'OK' && fs.existsSync(pdf) ? 글조각들(pdf) : [];
  if (g.한글 !== 'OK') { 탈(g, `한글이 못 열었거나 PDF 를 못 냈다 (${g.한글 ?? '말 없음'})`); continue; }
  if (g.조각.length === 0) { 탈(g, 'PDF 에서 글자를 하나도 못 뽑았다 — 재는 쪽이 틀렸다'); continue; }

  if (g.뜻 === '빈문단') {
    const 것 = g.조각.filter((s) => s.text.includes('빈문단글자가겹치나'));
    const 줄들 = new Set(것.map((s) => Math.round(s.bbox[1])));
    const 뒤줄 = g.조각.find((s) => s.text.includes('줄나눔뒤둘째줄'));
    g.본것 = `${것.length}조각 ${줄들.size}줄 · 크기 ${[...new Set(것.map((s) => s.size))].join('/')}pt`;
    if (것.length === 0) 탈(g, '넣은 글이 PDF 에 없다');
    else if (줄들.size < 2) 탈(g, `긴 글이 한 줄에 찍혔다 — 낡은 줄 정보를 한글이 믿고 겹쳐 그렸다 (${g.본것})`);
    if (것.some((s) => !크기맞나(s, 16))) 탈(g, `빈 런의 16pt 휴먼명조를 안 이었다 (${g.본것})`);
    if (!뒤줄) 탈(g, '줄 나눔 뒤 글이 PDF 에 없다');
    else if (줄들.has(Math.round(뒤줄.bbox[1]))) 탈(g, '줄 나눔 뒤 글이 앞 줄에 겹쳤다');
  }

  if (g.뜻 === '칸서식') {
    const 본 = ['갑갑갑갑', '을을을을', '병병병병'].map((글) => g.조각.find((s) => s.text.includes(글)));
    g.본것 = 본.map((s) => (s ? `${s.size}pt` : '없음')).join(' · ');
    if (본.some((s) => !s)) 탈(g, `칸에 넣은 줄이 PDF 에 다 없다 (${g.본것})`);
    else if (본.some((s) => !크기맞나(s, 13))) 탈(g, `칸의 문단 셋이 다 13pt 가 아니다 — 첫 문단에만 먹었다 (${g.본것})`);
  }

  if (['켜진채나눔', '끄고나눔', '끄고셀단위'].includes(g.뜻)) {
    const 줄쪽 = new Map();
    for (const s of g.조각) {
      const m = /긴칸줄(\d\d)/.exec(s.text);
      if (m && !줄쪽.has(Number(m[1]))) 줄쪽.set(Number(m[1]), s.page);
    }
    const 쪽들 = [...new Set(줄쪽.values())].sort((a, b) => a - b);
    g.본것 = `${줄쪽.size}/90줄 · ${쪽들.join('·')}쪽`;
    if (줄쪽.size === 0) { 탈(g, '긴 칸 글이 PDF 에 하나도 없다'); continue; }
    if (g.뜻 === '끄고나눔') {
      if (줄쪽.size !== 90) 탈(g, `긴 칸의 줄이 잘렸다 — 나눔이면 다 보여야 한다 (${g.본것})`);
      if (쪽들.length < 2) 탈(g, `긴 칸이 안 갈라졌다 — split 이 「나눔」이 아니다 (${g.본것})`);
      const 차례 = [...줄쪽.entries()].sort((a, b) => a[0] - b[0]).map(([, 쪽]) => 쪽);
      if (차례.some((쪽, i) => i > 0 && 쪽 < 차례[i - 1])) 탈(g, `줄 차례와 쪽 차례가 어긋난다 (${g.본것})`);
    } else if (쪽들.length !== 1) {
      // 켜진 채면 무엇을 줘도, 「셀 단위로 나눔」이면 칸 안에서는 안 갈라져야 한다
      탈(g, `칸이 쪽을 넘어 갈라졌다 — ${g.뜻 === '끄고셀단위' ? 'cell 이 「셀 단위로 나눔」이 아니다' : '글자처럼 취급이 안 먹었다'} (${g.본것})`);
    }
  }
}

// ── 5. 알린다 ─────────────────────────────────────────────────────────────
console.log(`잰 갈래 ${갈래들.length}개 · 무대 ${무대}`);
for (const g of 갈래들) console.log(`  ${g.뜻.padEnd(6)} ${g.본것 ?? '(못 쟀다)'}`);
if (갈래들.length !== 5) 판정.push(['갈래', `다섯을 재야 하는데 ${갈래들.length}개다`]);
if (판정.length > 0) {
  console.log(`\n✗ ${판정.length}건`);
  for (const [뜻, 말] of 판정) console.log(`  ${뜻}: ${말}`);
  process.exit(1);
}
console.log('\n○ 다섯 갈래 다 한글이 뜻대로 그렸다');
