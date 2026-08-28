/**
 * 원본 문서의 **문단이 몇 쪽에 있는지** 가른다.
 *
 * 쪽 단위로 재현하려면 먼저 "이 문단은 3쪽" 을 알아야 한다.
 * HWPX 자체에는 쪽 정보가 없다 — 한글이 그릴 때 정해진다.
 * 그래서 **PDF 로 구운 뒤 글자를 맞춰** 되짚는다.
 *
 * 맞추는 법: 쪽마다 글자를 이어 붙이고, 문단 글을 그 안에서 찾는다.
 * 앞 쪽부터 훑되 **이미 쓴 자리 뒤에서만** 찾는다 — 같은 글이 여러 번 나와도 순서가 안 꼬인다.
 *
 *   node 검증/쪽가르기.mjs <원본.hwpx> <원본.pdf>
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const B = (p) => pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', p, 'src', 'index.js')).href;

/** 파이썬으로 쪽마다 글자를 뽑는다 */
export function 쪽글자들(pdf, 파이썬) {
  // 표준출력으로 받으면 윈도우 콘솔이 cp949 라 한글 기호(‧ 같은 것)에서 터진다.
  // 파일로 받는다. 파일 이름도 아스키로 둔다 — 파이썬이 한글 경로를 깨뜨린 적이 있다.
  const 낼곳 = path.join(os.tmpdir(), 'hwpx-pagetext.json');
  const 코드 = [
    'import sys, json, pymupdf',
    'd = pymupdf.open(sys.argv[1])',
    'out = []',
    'for p in d:',
    '    out.append("".join(w[4] for w in p.get_text("words")))',
    'with open(sys.argv[2], "w", encoding="utf-8") as f:',
    '    json.dump(out, f, ensure_ascii=False)',
  ].join(String.fromCharCode(10));
  const 임시 = path.join(os.tmpdir(), 'hwpx-pagetext.py');
  fs.writeFileSync(임시, 코드, 'utf8');
  const r = spawnSync(파이썬, [임시, pdf, 낼곳], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`쪽 글자를 못 뽑았다: ${r.stderr}`);
  return JSON.parse(fs.readFileSync(낼곳, 'utf8'));
}

export function 파이썬찾기() {
  for (const p of [
    path.join(os.homedir(), 'AppData', 'Local', 'Python', 'bin', 'python.exe'),
    'python3', 'python',
  ]) {
    if (spawnSync(p, ['-c', 'import pymupdf'], { encoding: 'utf8' }).status === 0) return p;
  }
  return null;
}

/**
 * 문단마다 쪽 번호를 매긴다.
 *
 * 못 찾은 문단은 `쪽: null` 로 둔다 — **짐작해서 아무 쪽에나 넣지 않는다.**
 */
export function 문단쪽매기기(문단들, 쪽글자) {
  const 지운공백 = 쪽글자.map((s) => s.replace(/\s+/g, ''));
  const 커서 = new Array(지운공백.length).fill(0);
  let 지금쪽 = 0;
  const 나온것 = [];

  for (const [i, p] of 문단들.entries()) {
    const 글 = p.글.replace(/\s+/g, '');
    if (글.length === 0) { 나온것.push({ 번호: i, 쪽: 지금쪽, 빈줄: true }); continue; }

    // 지금 쪽부터 뒤로 훑는다 (앞으로 돌아가지 않는다)
    let 찾음 = -1;
    for (let 쪽 = 지금쪽; 쪽 < 지운공백.length; 쪽++) {
      const 자리 = 지운공백[쪽].indexOf(글, 커서[쪽]);
      if (자리 !== -1) { 커서[쪽] = 자리 + 글.length; 찾음 = 쪽; break; }
    }
    if (찾음 === -1) {
      // 짧은 글은 어디에나 있을 수 있다. 앞 문단과 같은 쪽으로 둔다.
      나온것.push({ 번호: i, 쪽: 글.length <= 4 ? 지금쪽 : null });
      continue;
    }
    지금쪽 = 찾음;
    나온것.push({ 번호: i, 쪽: 찾음 });
  }
  return 나온것;
}

/**
 * **문단이 몇 쪽에 있는지, PDF 없이 되짚는다.**
 *
 * `hp:lineseg@vertpos` 는 **쪽 안에서의 세로 자리**다.
 * 쪽이 넘어가면 0 가까이로 되돌아간다 — 되돌아간 횟수 + 1 = 쪽 수.
 *
 * PDF 글자 맞추기보다 훨씬 낫다. 글자 맞추기는 51쪽 가운데 20쪽을 못 갈랐다.
 * 이건 한글이 센 쪽 수와 거의 맞는다 (실측: 3/3, 22/23, 9/10, 27/29).
 *
 * ## 못 하는 것도 말한다
 *
 * **표가 쪽을 넘어 이어질 때** 그 쪽 나눔은 문단 층에서 안 보인다.
 * 표 하나는 문단 하나 안에 통째로 들어 있고, 그 문단의 `linesegarray` 는
 * 한 번만 적히기 때문이다. 그래서 몇 쪽이 모자랄 수 있다.
 *
 * `linesegarray` 가 아예 없는 문서(우리가 만든 것)에서는 못 쓴다 — `null` 을 준다.
 */
export function 세로자리로쪽매기기(문단들, getAttr, firstChildNamed, childrenNamed) {
  const 첫세로 = (p) => {
    const arr = firstChildNamed(p.el, 'hp:linesegarray');
    if (!arr) return null;
    const segs = childrenNamed(arr, 'hp:lineseg');
    if (segs.length === 0) return null;
    return [Number(getAttr(segs[0], 'vertpos')), Number(getAttr(segs[segs.length - 1], 'vertpos'))];
  };

  // 줄 기하를 든 문단이 너무 적으면 이 방법을 못 쓴다
  const 든것 = 문단들.filter((p) => 첫세로(p) !== null).length;
  if (든것 < 문단들.length * 0.5) return null;

  const 나온것 = [];
  let 쪽 = 0, 앞 = null;
  for (const [i, p] of 문단들.entries()) {
    const v = 첫세로(p);
    if (v === null) { 나온것.push({ 번호: i, 쪽 }); continue; }
    if (앞 !== null && v[0] < 앞 - 1000) 쪽++;
    앞 = v[1];
    나온것.push({ 번호: i, 쪽 });
  }
  return 나온것;
}

/**
 * **묶기는 세로 자리로, 번호는 PDF 로.**
 *
 * 둘 다 혼자서는 부족하다:
 *   - PDF 글자 맞추기는 **문단을 잘못 흩는다** — 남의 문단이 섞여 51쪽 중 20쪽을 못 쟀다
 *   - 세로 자리는 잘 묶지만 **쪽 수가 모자란다** — 표가 쪽을 넘으면 그 나눔이 안 보인다
 *     (22/23, 9/10, 27/29). 그래서 쪽 번호가 PDF 와 어긋난다
 *
 * 그래서 세로 자리로 **묶고**, 각 묶음이 PDF 의 몇 쪽인지는
 * 그 묶음 안 문단들의 PDF 짐작을 **다수결**로 정한다.
 * 묶음이 통째로 한 쪽에 앉으므로 남의 문단이 안 섞인다.
 */
export function 섞어서쪽매기기(문단들, 쪽글자, getAttr, firstChildNamed, childrenNamed) {
  const 세로 = 세로자리로쪽매기기(문단들, getAttr, firstChildNamed, childrenNamed);
  const pdf매김 = 문단쪽매기기(문단들, 쪽글자);
  if (!세로) return { 매김: pdf매김, 어떻게: 'PDF 글자 맞추기' };

  // 묶음마다 PDF 짐작을 모은다
  const 묶음별 = new Map();
  for (const [i, m] of 세로.entries()) {
    const 쪽 = pdf매김[i]?.쪽;
    if (쪽 === null || 쪽 === undefined) continue;
    if (!묶음별.has(m.쪽)) 묶음별.set(m.쪽, []);
    묶음별.get(m.쪽).push(쪽);
  }

  // 다수결. 같으면 작은 쪽 (앞쪽으로 붙인다)
  const 묶음쪽 = new Map();
  for (const [묶음, 것들] of 묶음별) {
    const 셈 = new Map();
    for (const p of 것들) 셈.set(p, (셈.get(p) ?? 0) + 1);
    묶음쪽.set(묶음, [...셈].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]);
  }

  // 묶음 번호가 커지면 쪽도 커져야 한다 — 다수결이 뒤집힌 곳을 바로잡는다
  let 앞쪽 = -1;
  for (const 묶음 of [...묶음쪽.keys()].sort((a, b) => a - b)) {
    const v = 묶음쪽.get(묶음);
    if (v < 앞쪽) 묶음쪽.set(묶음, 앞쪽);
    앞쪽 = 묶음쪽.get(묶음);
  }

  return {
    매김: 세로.map((m, i) => ({ 번호: i, 쪽: 묶음쪽.get(m.쪽) ?? null })),
    어떻게: '세로 자리로 묶고 PDF 로 번호 매김',
  };
}

// 직접 돌렸을 때
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [, , hwpx, pdf] = process.argv;
  if (!hwpx || !pdf) { console.log('쓰기: node 검증/쪽가르기.mjs <원본.hwpx> <원본.pdf>'); process.exit(2); }

  const { 문서 } = await import(B('doc'));
  const 파이썬 = 파이썬찾기();
  if (!파이썬) { console.error('python(pymupdf)이 없다'); process.exit(1); }

  const d = 문서.열기(fs.readFileSync(hwpx));
  const 문단들 = d.구역들.flatMap((s) => s.문단들);
  const 쪽글자 = 쪽글자들(pdf, 파이썬);
  const 매김 = 문단쪽매기기(문단들, 쪽글자);

  const 쪽별 = new Map();
  let 못찾음 = 0;
  for (const m of 매김) {
    if (m.쪽 === null) { 못찾음++; continue; }
    쪽별.set(m.쪽, (쪽별.get(m.쪽) ?? 0) + 1);
  }
  console.log(`문단 ${문단들.length}개 / 쪽 ${쪽글자.length}개`);
  for (const [쪽, n] of [...쪽별].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${쪽 + 1}쪽  문단 ${n}개`);
  }
  if (못찾음) console.log(`  ※ 어느 쪽인지 못 가른 문단 ${못찾음}개`);
}
