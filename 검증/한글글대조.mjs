/**
 * **한글이 읽는 글과 우리가 읽는 글이 같나** — 한글을 정답지로 쓴다.
 *
 * 표본을 한글로 열어 글만 내보내고(`SaveAs …, "UNICODE"`), 우리가 읽은 글과 견준다.
 * 사람이 쪽에서 보는 글이 그것이다. 2026-10-07 에 처음 대 보니 둘이 나왔다:
 *
 *   - **덧말 단 낱말이 통째로 빠졌다** — 글자 칸만 읽었다 (`런글읽기`)
 *   - **자동 번호·글머리표(1. ∘ -)가 없었다** — 글이 아니라 문단 모양이 그린다 (`번호.ts`)
 *
 * 그리고 **고친 뒤에도** 같은가를 본다. 글이 든 문단마다 끝에 ★ 을 붙여 저장하고,
 * 한글이 읽은 글에 ★ 이 그 수만큼, 나머지 글은 그대로 있어야 한다.
 * 덧말 뒤를 고치다 덧말 앞 칸을 고치는 따위의 **자리 어긋남**이 여기서 걸린다.
 *
 * ## 차례가 아니라 글자 묶음으로 견준다
 *
 * 한 문단 안에 표와 글이 섞이면 한글은 글을 먼저, 표를 뒤에 낸다. 우리는 나온 자리대로
 * 낸다. 어느 쪽도 틀리지 않았으니 **빈칸을 뺀 글자들을 세어** 견준다 — 빠지거나 두 번
 * 나온 글이 걸린다.
 *
 * ## 한글 쪽에서 빼는 것
 *
 *   - 각주·미주: 한글은 본문 그 자리에 「1)1) 각주 글」로 끼운다. 우리는 notes 로 따로 준다
 *   - 덧말의 작은 글: 한글은 「(덧말:…)」로 붙인다. 쪽에는 본문 위에 작게 보인다
 * 우리 쪽에서는 머리말·꼬리말 안 문단을 뺀다 — 한글이 글 내보내기에 안 넣는다.
 *
 * 한글 글 내보내기가 **쪽에는 있는데 안 내는** 것이 둘 더 있다 (2026-11-05, 표본 둘에서 잼 —
 * 같은 파일을 한글 PDF 로 구우면 다 있다). 우리 쪽에서 뺀다:
 *
 *   - **둘째 구역부터, 구역 첫 문단(쪽 설정 든 문단)에 놓인 표** — 표째로 안 낸다.
 *     돌봄 길라잡이 구역 1 의 근로계약서 뒤쪽 32문단, AI 교과서 매뉴얼 구역 1·2 의 평가표 머리.
 *   - **글자 겹치기**(`hp:compose`, 예: 「／○」) — 겹친 글자를 안 낸다.
 *
 * 사용자 영역 글자(PUA)로 정한 글머리표는 한글이 「●」로 낸다. 우리 읽기도 그렇게 주므로(`번호.ts`) 여기서는
 * 바꾸지 않고 그대로 견준다 — 이 대조가 그 동작을 한글에 대고 재는 시험이다.
 *
 *   node 검증/한글글대조.mjs
 */
import { 한글돌리기, 한글띄우기 } from './한글지키기.mjs';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const B = (p) => pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', p, 'src', 'index.js')).href;
const { 문서, 곁글인가 } = await import(B('doc'));
const { closestNamed, findAll, childrenNamed, getAttr } = await import(B('owpml'));

const 무대 = path.join(os.tmpdir(), 'hwpx-글대조');
const 원본칸 = path.join(무대, '원본');
const 고친칸 = path.join(무대, '고친');
const 한글칸 = path.join(무대, '한글');
for (const d of [원본칸, 고친칸, 한글칸]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }

const 자리들 = [
  path.join(뿌리, '자료', '기준파일'),
  path.join(뿌리, '자료', '표본', '공개'),
  path.join(뿌리, '자료', '표본', '로컬'),   // 없으면 건너뛴다 (gitignore)
];
const 파일들 = 자리들.filter((d) => fs.existsSync(d))
  .flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith('.hwpx')).map((f) => path.join(d, f)));

/** 둘째 구역부터, 구역 첫 문단에 놓인 표들 — 한글 글 내보내기가 안 낸다 (머리 주석) */
function 한글이안내는표들(d) {
  const 표들 = new Set();
  for (const s of d.구역들.slice(1)) {
    const 첫 = childrenNamed(s.root, 'hp:p')[0];
    if (!첫) continue;
    for (const r of childrenNamed(첫, 'hp:run')) for (const t of childrenNamed(r, 'hp:tbl')) 표들.add(t);
  }
  return 표들;
}

/** 한글 글 내보내기에 안 나오는 자리인가 — 곁글·머리말·꼬리말·위의 표 안 */
function 안나오는자리(el, 안내는표) {
  if (곁글인가(el) || closestNamed(el, 'hp:header') || closestNamed(el, 'hp:footer')) return true;
  for (let 위 = el.parent; 위 !== undefined; 위 = 위.parent) if (안내는표.has(위)) return true;
  return false;
}

/** 우리가 읽는 글 — 번호·글머리표를 앞에 붙이고, 한글이 안 내는 것은 뺀다 */
function 우리글(d) {
  const 표지 = d.번호표지들();
  const 안내는표 = 한글이안내는표들(d);
  let 글 = d.구역들.flatMap((s) => s.모든문단들
    .filter((p) => !안나오는자리(p.el, 안내는표))
    .map((p) => (표지.has(p.el) ? `${표지.get(p.el)} ` : '') + p.글)).join('\n');
  // 글자 겹치기의 겹친 글자를 하나씩 덜어 낸다 — 한글은 안 낸다. 견주기는 글자 묶음이라 자리는 상관없다
  for (const s of d.구역들) {
    for (const c of findAll(s.root, 'hp:compose')) {
      if (안나오는자리(c, 안내는표)) continue;
      for (const 자 of getAttr(c, 'composeText') ?? '') {
        const i = 글.indexOf(자);
        if (i >= 0) 글 = 글.slice(0, i) + 글.slice(i + 자.length);
      }
    }
  }
  return 글;
}

// ── 1. 원본 사본과 고친 사본을 만든다 ────────────────────────────────────────
const 기대 = new Map();   // 파일 이름 → { 원본글, 고친글, 별 }
let 이름번호 = 0;
for (const f of 파일들) {
  // 한글 COM 은 한글 경로를 잘 받지만, 같은 이름이 두 자리에 있을 수 있어 번호를 붙인다
  const 이름 = `${String(이름번호++).padStart(2, '0')}-${path.basename(f)}`;
  fs.copyFileSync(f, path.join(원본칸, 이름));
  const d = 문서.열기(fs.readFileSync(f));
  const 원본글 = 우리글(d);
  let 별 = 0;
  const 안내는표 = 한글이안내는표들(d);
  for (const s of d.구역들) {
    for (const p of s.모든문단들) {
      if (안나오는자리(p.el, 안내는표) || p.글.trim() === '') continue;
      const r = p.글바꾸기(`${p.글}★`);
      if (r.ok && r.value.바뀐수 > 0) 별++;
    }
  }
  fs.writeFileSync(path.join(고친칸, 이름), d.저장());
  기대.set(이름, { 원본글, 고친글: 우리글(d), 별 });
}

// ── 2. 한글로 둘 다 글만 내보낸다 ────────────────────────────────────────────
const ps = `
$ErrorActionPreference = 'Continue'
# 파일 이름이 한글이다 — 콘솔 코드 페이지로 내보내면 깨져 판정을 못 짝짓는다
[Console]::OutputEncoding = [Text.Encoding]::UTF8
${한글띄우기}
# 창을 숨긴다 — 안 숨기면 Open·SaveAs 마다 앞으로 튀어나와 사용자의 클릭을 먹는다
try { $hwp.XHwpWindows.Item(0).Visible = $false } catch {}
try { $hwp.SetMessageBoxMode(0x20000) | Out-Null } catch {}
try { $hwp.RegisterModule("FilePathCheckDLL","FilePathCheckerModule") | Out-Null } catch {}
try {
  foreach ($side in @('원본','고친')) {
    foreach ($f in Get-ChildItem -Path (Join-Path '${무대}' $side) -Filter *.hwpx) {
      $out = Join-Path '${한글칸}' ($side + '_' + $f.BaseName + '.txt')
      try {
        if ($hwp.Open($f.FullName, "", "forceopen:true")) {
          if ($hwp.SaveAs($out, "UNICODE", "")) { Write-Output ("OK ||| " + $side + " ||| " + $f.Name) }
          else { Write-Output ("SAVEFAIL ||| " + $side + " ||| " + $f.Name) }
        } else { Write-Output ("OPENFAIL ||| " + $side + " ||| " + $f.Name) }
      } catch { Write-Output ("THROW ||| " + $side + " ||| " + $f.Name + " ||| " + $_.Exception.Message) }
      try { $hwp.Clear(1) | Out-Null } catch {}
    }
  }
} finally { try { $hwp.Quit() | Out-Null } catch {} }
`;
let 말 = '';
try {
  말 = 한글돌리기('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', maxBuffer: 1 << 26 });
} catch (e) {
  말 = String(e.stdout ?? '');   // 끝이 0 이 아니어도 뱉은 판정은 챙긴다
}
const 판정 = new Map();
for (const 줄 of 말.split(/\r?\n/)) {
  const [무엇, 쪽, 이름] = 줄.split(' ||| ');
  if (쪽 && 이름) 판정.set(`${쪽}/${이름.trim()}`, 무엇);
}

// ── 3. 견준다 ────────────────────────────────────────────────────────────────
const 접기 = (s) => [...s.replace(/\s+/g, '')].sort().join('');
const 한글글다듬기 = (s) => s
  .replace(/^﻿/, '')
  .replace(/\(덧말:[^)]*\)/g, '')          // 덧말의 작은 글
  .replace(/(\d+\))\1[^\r\n]*?(?=\r?\n|$)/g, '');  // 「1)1) 각주 글」 — 각주 자리와 글

function 차이(우리, 한글) {
  const 셈 = new Map();
  for (const c of 우리.replace(/\s+/g, '')) 셈.set(c, (셈.get(c) ?? 0) + 1);
  for (const c of 한글.replace(/\s+/g, '')) 셈.set(c, (셈.get(c) ?? 0) - 1);
  const 더 = [...셈].filter(([, n]) => n > 0).map(([c, n]) => c.repeat(Math.min(n, 5))).join('').slice(0, 30);
  const 덜 = [...셈].filter(([, n]) => n < 0).map(([c, n]) => c.repeat(Math.min(-n, 5))).join('').slice(0, 30);
  return `우리만 «${더}» · 한글만 «${덜}»`;
}

const 틀린것 = [];
let 견준수 = 0;
for (const [이름, 값] of 기대) {
  for (const 쪽 of ['원본', '고친']) {
    const 됨 = 판정.get(`${쪽}/${이름}`);
    if (됨 !== 'OK') { 틀린것.push(`${쪽} ${이름}: 한글이 ${됨 ?? '아무 말도 안 했다'}`); continue; }
    const 한글 = 한글글다듬기(fs.readFileSync(path.join(한글칸, `${쪽}_${이름.replace(/\.hwpx$/, '')}.txt`)).toString('utf16le'));
    const 우리 = 쪽 === '원본' ? 값.원본글 : 값.고친글;
    견준수++;
    if (접기(우리) !== 접기(한글)) 틀린것.push(`${쪽} ${이름}: ${차이(우리, 한글)}`);
    if (쪽 === '고친') {
      const 별수 = (한글.match(/★/g) ?? []).length;
      if (별수 !== 값.별) 틀린것.push(`고친 ${이름}: ★ 을 ${값.별}개 붙였는데 한글은 ${별수}개를 읽었다`);
    }
  }
}

console.log(`${기대.size}편 × (원본·고친) = ${견준수}번 견줬다`);
if (틀린것.length) {
  console.log(`\n한글과 다르게 읽는 것 ${틀린것.length}:`);
  for (const x of 틀린것) console.log(`  ✗ ${x}`);
  process.exit(1);
}
console.log('한글이 읽는 글과 우리가 읽는 글이 모두 같다 (고친 뒤에도)');
