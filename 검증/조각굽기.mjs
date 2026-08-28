/**
 * 조판이 쓸 **XML 조각**을 기준 파일에서 굽는다.
 *
 * ## 왜 손으로 안 짜나
 *
 * `<hp:p>` 하나를 손으로 짜면 빠진 자식이 생긴다.
 * 한글은 빠진 것을 알려 주지 않고 **그 뒤를 조용히 무시한다.**
 * 지금 쓰는 MCP 가 그 병을 앓았다 (빈 문서 템플릿을 손으로 써서 뒷부분이 통째로 무시됐다).
 *
 * 그래서 한글이 실제로 저장한 문서에서 **오려 낸다.**
 * 글자만 비우고, 낡은 줄 배치(`hp:linesegarray`)만 뺀다 — 그건 한글이 다시 계산한다.
 *
 *   node 검증/조각굽기.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const B = (p) => pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', p, 'src', 'index.js')).href;

const { HwpxContainer } = await import(B('hwpx'));
const {
  parseXml, serializeNode, serializeXml, findAll, childrenNamed, firstChildNamed,
  setAttr, setText, removeNode, getAttr,
} = await import(B('owpml'));

function 구역(이름) {
  const c = HwpxContainer.open(fs.readFileSync(path.join(뿌리, '자료', '기준파일', 이름)));
  const n = c.sectionNames()[0];
  const src = c.readText(n);
  return { src, doc: parseXml(src) };
}

/**
 * 조각 하나를 딴 나무로 옮겨 손질할 수 있게 떼어 낸다.
 *
 * 돌려주는 `src` 를 **반드시 같이 써야 한다.**
 * `serializeNode(el, "")` 를 쓰면 안 고친 자식이 `"".slice(...)` 가 되어
 * **조용히 빈 것으로 나온다.** 실제로 셀 조각에서 cellAddr·cellSpan 이 통째로 빠졌다.
 */
function 떼기(node, src) {
  const 조각 = serializeNode(node, src);
  const doc = parseXml(조각);
  return { el: doc.root, src: 조각, doc };
}

const 조각들 = {};

// ── 문단 ──────────────────────────────────────────────────────────────────
{
  const { src, doc } = 구역('ref-text-basic.hwpx');
  // 글만 든 문단을 고른다 (secPr·ctrl 이 안 든 것)
  const 후보 = childrenNamed(doc.root, 'hp:p').find((p) => {
    const 런들 = childrenNamed(p, 'hp:run');
    return 런들.length > 0 && 런들.every((r) => {
      const 아이들 = r.children.filter((n) => n.kind === 'element');
      return 아이들.every((c) => c.name === 'hp:t');
    });
  });
  if (!후보) throw new Error('글만 든 문단을 못 찾았다');

  const { el, src: 조각src } = 떼기(후보, src);
  // 런 하나만 남기고 글자를 비운다
  for (const r of childrenNamed(el, 'hp:run').slice(1)) removeNode(r);
  const 런 = childrenNamed(el, 'hp:run')[0];
  for (const t of childrenNamed(런, 'hp:t').slice(1)) removeNode(t);
  setText(childrenNamed(런, 'hp:t')[0], '');
  setAttr(런, 'charPrIDRef', '0');
  setAttr(el, 'id', '0');
  setAttr(el, 'paraPrIDRef', '0');
  setAttr(el, 'styleIDRef', '0');
  // 줄 배치는 한글이 다시 계산한다. 우리 것을 넣으면 더 틀린다.
  const 배치 = firstChildNamed(el, 'hp:linesegarray');
  if (배치) removeNode(배치);
  조각들.문단 = serializeNode(el, 조각src);
}

// ── 표 ────────────────────────────────────────────────────────────────────
{
  const { src, doc } = 구역('ref-table-basic.hwpx');
  const t = findAll(doc.root, 'hp:tbl')[0];
  if (!t) throw new Error('표를 못 찾았다');

  // 표 뼈대 — 줄을 다 뺀 것
  {
    const { el, src: 조각src } = 떼기(t, src);
    for (const tr of childrenNamed(el, 'hp:tr')) removeNode(tr);
    setAttr(el, 'id', '0');
    setAttr(el, 'rowCnt', '0');
    setAttr(el, 'colCnt', '0');
    조각들.표뼈대 = serializeNode(el, 조각src);
  }

  // 셀 하나 — 글자를 비운 것
  {
    const tc = childrenNamed(childrenNamed(t, 'hp:tr')[0], 'hp:tc')[0];
    const { el, src: 조각src } = 떼기(tc, src);
    const p = findAll(el, 'hp:p')[0];
    for (const r of childrenNamed(p, 'hp:run').slice(1)) removeNode(r);
    const 런 = childrenNamed(p, 'hp:run')[0];
    for (const x of childrenNamed(런, 'hp:t').slice(1)) removeNode(x);
    if (childrenNamed(런, 'hp:t').length) setText(childrenNamed(런, 'hp:t')[0], '');
    setAttr(런, 'charPrIDRef', '0');
    const 배치 = firstChildNamed(p, 'hp:linesegarray');
    if (배치) removeNode(배치);
    조각들.셀 = serializeNode(el, 조각src);
  }

  // 표를 담는 런
  {
    const 런 = t.parent;
    const 여는것 = src.slice(런.openSpan.start, 런.openSpan.end);
    조각들.표런 = `${여는것}</hp:run>`;
  }
}

// ── 쪽 번호 ───────────────────────────────────────────────────────────────
{
  const { src, doc } = 구역('ref-pagenum.hwpx');
  const pn = findAll(doc.root, 'hp:pageNum')[0];
  if (!pn) throw new Error('ref-pagenum.hwpx 에 hp:pageNum 이 없다');
  const ctrl = pn.parent;
  if (!ctrl || ctrl.name !== 'hp:ctrl') throw new Error('hp:pageNum 이 hp:ctrl 안에 없다');
  조각들.쪽번호 = serializeNode(ctrl, src);
}

// ── 그림 ──────────────────────────────────────────────────────────────────
{
  const { src, doc } = 구역('ref-image.hwpx');
  const pic = findAll(doc.root, 'hp:pic')[0];
  if (!pic) throw new Error('ref-image.hwpx 에 hp:pic 이 없다');
  조각들.그림 = serializeNode(pic, src);
}

// ── 사각형(도형) ──────────────────────────────────────────────────────────
//
// 실측: 도형을 쓰는 34편 가운데 **33편이 hp:rect** 를 쓴다 (254개).
// 정부 문서의 제목 상자·강조 상자가 거의 다 이것이다.
{
  const { src, doc } = 구역('ref-shape.hwpx');
  const rect = findAll(doc.root, 'hp:rect')[0];
  if (!rect) throw new Error('ref-shape.hwpx 에 hp:rect 가 없다');
  조각들.사각형 = serializeNode(rect, src);
}

// ── 글자리 (도형 안 글) ───────────────────────────────────────────────────
//
// `ref-shape.hwpx` 의 사각형에는 `hp:drawText` 가 없다 — 빈 상자다.
// 정부 문서의 제목 상자는 **글이 상자 안에** 들어간다.
//
// 상자 틀은 `사각형` 조각을 쓰고, 여기서는 **글 자리만** 떼어 온다.
// 손으로 짜지 않는다 — `hp:drawText` 는 자식이 빠지면 한글이 그 뒤를 통째로 무시한다.
{
  const 길 = path.join(뿌리, '자료', '표본', '공개', '교육부-2026대학혁신지원사업-기본계획.hwpx');
  const c = HwpxContainer.open(fs.readFileSync(길));
  const doc = parseXml(c.readText(c.sectionNames()[0]));
  const rect = findAll(doc.root, 'hp:rect').find((r) => findAll(r, 'hp:drawText').length > 0);
  if (!rect) throw new Error('글이 든 사각형을 못 찾았다');
  const dt = findAll(rect, 'hp:drawText')[0];
  let 글 = serializeNode(dt, doc.source);
  // 남의 문서 글은 안 들고 온다 — 뼈대만 쓴다
  글 = 글.replace(/(<hp:t>)[^<]*(<\/hp:t>)/g, '$1$2');
  // 줄 기하는 저 문서의 것이다. 우리 상자에는 안 맞으니 지운다.
  글 = 글.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g, '');
  조각들.글자리 = 글;
}

// ── 머리말·꼬리말 ─────────────────────────────────────────────────────────
//
// 실측: 문서 161편 가운데 12편(7%)이 머리말·꼬리말에 글을 넣는다.
// 학교 가정통신문·공문은 거의 다 쓴다.
//
// 둘 다 `hp:ctrl` 안에 산다 (`hp:ctrl < hp:run < hp:p < hs:sec`).
// **ctrl 째로 뜬다** — 껍데기를 손으로 짜면 한글이 그 뒤를 무시한다.
for (const [이름, 태그, 파일] of [
  ['머리말', 'hp:header', 'ref-header-footer.hwpx'],
  ['꼬리말', 'hp:footer', 'ref-footer.hwpx'],
]) {
  const { src, doc } = 구역(파일);
  const e = findAll(doc.root, 태그)[0];
  if (!e) throw new Error(`${파일} 에 ${태그} 가 없다`);
  const ctrl = e.parent;
  if (!ctrl || ctrl.name !== 'hp:ctrl') throw new Error(`${태그} 가 hp:ctrl 안에 없다`);
  let 글 = serializeNode(ctrl, src);
  글 = 글.replace(/(<hp:t>)[^<]*(<\/hp:t>)/g, '$1$2');            // 남의 글은 안 들고 온다
  글 = 글.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g, '');  // 남의 줄 기하도
  조각들[이름] = 글;
}

// ── 표 캡션 ───────────────────────────────────────────────────────────────
//
// 실측: 문서 161편 가운데 8편(5%)이 표에 캡션을 단다.
// `hp:caption` 은 `hp:tbl` **안**에 산다 (`side="TOP"` 이 위에 붙이는 것).
{
  const 길 = path.join(뿌리, '자료', '표본', '공개', '교육부-2026대학혁신지원사업-기본계획.hwpx');
  const c = HwpxContainer.open(fs.readFileSync(길));
  const doc = parseXml(c.readText(c.sectionNames()[0]));
  const cap = findAll(doc.root, 'hp:caption')[0];
  if (!cap) throw new Error('hp:caption 을 못 찾았다');
  let 글 = serializeNode(cap, doc.source);
  글 = 글.replace(/(<hp:t>)[^<]*(<\/hp:t>)/g, '$1$2');
  글 = 글.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g, '');
  조각들.표캡션 = 글;
}

// ── 확인 — 구운 것이 다시 읽히나 ──────────────────────────────────────────
for (const [이름, 글] of Object.entries(조각들)) {
  const doc = parseXml(글);
  if (serializeXml(doc) !== 글) throw new Error(`${이름} 조각이 왕복이 안 된다`);
  if (글.length < 30) throw new Error(`${이름} 조각이 너무 짧다 (${글.length}자) — 잘못 떴다`);
}
// 문단 조각에 글자 칸이 있어야 한다
if (!조각들.문단.includes('<hp:t')) throw new Error('문단 조각에 hp:t 가 없다');
// 셀 조각에 다섯 자식이 다 있어야 한다
for (const 이름 of ['hp:subList', 'hp:cellAddr', 'hp:cellSpan', 'hp:cellSz', 'hp:cellMargin']) {
  if (!조각들.셀.includes(이름)) throw new Error(`셀 조각에 ${이름} 이 없다`);
}
// 쪽 번호 조각에 자리·꼴이 있어야 한다
for (const 이름 of ['pos=', 'formatType=']) {
  if (!조각들.쪽번호.includes(이름)) throw new Error(`쪽번호 조각에 ${이름} 이 없다`);
}
// 그림 조각에 크기가 적히는 곳이 다 있어야 한다
for (const 이름 of ['hp:orgSz', 'hp:curSz', 'hp:imgRect', 'hp:imgClip', 'hp:imgDim',
  'hp:sz', 'hc:img', 'hp:pos']) {
  if (!조각들.그림.includes(이름)) throw new Error(`그림 조각에 ${이름} 이 없다`);
}

// 사각형 조각에 자리·크기·선·채움이 다 있어야 한다
for (const 이름 of ['hp:offset', 'hp:orgSz', 'hp:sz', 'hp:pos', 'hp:lineShape', 'hc:fillBrush']) {
  if (!조각들.사각형.includes(이름)) throw new Error(`사각형 조각에 ${이름} 이 없다`);
}

// 글자리 조각에 글 넣을 데가 있어야 한다
for (const 이름 of ['hp:drawText', 'hp:subList', 'hp:p', 'hp:run', 'hp:t']) {
  if (!조각들.글자리.includes(이름)) throw new Error(`글자리 조각에 ${이름} 이 없다`);
}
// 남의 글도, 남의 줄 기하도 딸려 오면 안 된다
if (/<hp:t>[^<]/.test(조각들.글자리)) throw new Error('글자리 조각에 남의 글이 남아 있다');
if (조각들.글자리.includes('linesegarray')) throw new Error('글자리 조각에 남의 줄 기하가 남아 있다');

// 머리말·꼬리말 조각에 글 넣을 데가 있어야 한다
for (const 이름 of ['머리말', '꼬리말']) {
  for (const 있어야 of ['hp:ctrl', 'hp:subList', 'hp:p', 'hp:run', 'hp:t']) {
    if (!조각들[이름].includes(있어야)) throw new Error(`${이름} 조각에 ${있어야} 가 없다`);
  }
  if (/<hp:t>[^<]/.test(조각들[이름])) throw new Error(`${이름} 조각에 남의 글이 남아 있다`);
}

// 표 캡션 조각에 글 넣을 데와 자리가 있어야 한다
for (const 있어야 of ['side=', 'hp:subList', 'hp:p', 'hp:run', 'hp:t']) {
  if (!조각들.표캡션.includes(있어야)) throw new Error(`표캡션 조각에 ${있어야} 가 없다`);
}
if (/<hp:t>[^<]/.test(조각들.표캡션)) throw new Error('표캡션 조각에 남의 글이 남아 있다');

// ── 내놓기 ────────────────────────────────────────────────────────────────
const 설명 = {
  문단: '글 한 줄. 런 하나 · 글자 칸 하나 · 줄 배치 없음',
  표뼈대: '표. sz·pos·outMargin·inMargin 만 있고 줄은 없다',
  셀: '셀 하나. subList·cellAddr·cellSpan·cellSz·cellMargin 다 있다',
  표런: '표를 담는 런',
  쪽번호: '쪽 번호 조각. 문단 안 런에 넣으면 한글이 쪽마다 그린다',
  그림: '그림 하나. 크기가 일곱 군데에 적혀 있으니 넣을 때 다 맞춰야 한다',
  사각형: '사각형 도형. 실측 도형 34편 중 33편이 이것이다 (254개)',
  글자리: '도형 안 글 자리(hp:drawText). 사각형 조각에 붙여 쓴다 (글은 비워 뒀다)',
  머리말: '머리말 ctrl. 구역 첫 문단의 런에 넣는다 (글은 비워 뒀다)',
  꼬리말: '꼬리말 ctrl. 머리말과 같은 꼴이다 (글은 비워 뒀다)',
  표캡션: '표 캡션. hp:tbl 안에 넣는다. side 로 위·아래를 고른다 (글은 비워 뒀다)',
};

const 줄들 = ['/**',
  ' * 조판이 쓰는 **XML 조각.**',
  ' *',
  ' * 이 파일은 손으로 고치지 않는다. `node 검증/조각굽기.mjs` 가 굽는다.',
  ' * 조각은 전부 **한글이 저장한 문서에서 오려 낸 것**이다 —',
  ' * 손으로 짜면 빠진 자식이 생기고, 한글은 그걸 알려 주지 않고 그 뒤를 무시한다.',
  ' *',
  ' * 줄 배치(`hp:linesegarray`)는 뺐다. 한글이 열 때 다시 계산한다.',
  ' */',
  '',
];
for (const [이름, 글] of Object.entries(조각들)) {
  줄들.push(`/** ${설명[이름] ?? ''} */`);
  줄들.push(`export const ${이름} = ${JSON.stringify(글)};`);
  줄들.push('');
}

const 낼곳 = path.join(뿌리, 'packages', 'compose', 'src', '조각.ts');
fs.mkdirSync(path.dirname(낼곳), { recursive: true });
fs.writeFileSync(낼곳, 줄들.join('\n'), 'utf8');

console.log(`구웠다: ${path.relative(뿌리, 낼곳)}`);
for (const [이름, 글] of Object.entries(조각들)) {
  console.log(`  ${이름.padEnd(8)} ${String(글.length).padStart(5)}자`);
}
