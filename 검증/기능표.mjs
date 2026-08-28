/**
 * **우리가 지금 무엇을 할 수 있나 — 도구로 직접 해 보고 적는다.**
 *
 * 계획서의 기능 목록은 *옛 MCP* 기준으로 적혀 있었다.
 * 우리 것이 어디까지인지는 아무 데도 없었다 — 그러면 6단계 합격을 못 잰다.
 *
 * 소스를 뒤져 "있는 것 같다" 로 적으면 안 된다. 실제로 그렇게 틀렸다:
 * `image` 블록은 조판에 다 만들어져 있었는데 스키마에 자리가 없어
 * **모델은 그림을 아예 못 넣었다.** 있는 것과 쓸 수 있는 것은 다르다.
 *
 * 그래서 여기서는 **MCP 도구를 실제로 불러** 보고, 나온 파일을 열어 확인한다.
 * 모델이 할 수 있는 것만 '됨' 이다.
 *
 *   node 검증/기능표.mjs            표를 낸다
 *   node 검증/기능표.mjs --계획고치기  기획/06-계획.md 의 '우리' 칸을 갱신한다
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const B = (p) => pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', p, 'src', 'index.js')).href;

const { 도구부르기, 문서방 } = await import(B('server'));
const { 문서, 표: 표클래스 } = await import(B('doc'));
const { HwpxContainer } = await import(B('hwpx'));
const { parseXml, findAll, getAttr, firstChildNamed, childrenNamed, textOf } = await import(B('owpml'));

const 무대 = path.join(os.tmpdir(), 'hwpx-feature');
fs.rmSync(무대, { recursive: true, force: true });
fs.mkdirSync(무대, { recursive: true });

// 그림 시험에 쓸 파일
const 그림파일 = path.join(무대, 'pic.png');
fs.writeFileSync(그림파일,
  HwpxContainer.open(fs.readFileSync(path.join(뿌리, '자료', '기준파일', 'ref-image.hwpx')))
    .read('BinData/image1.png'));

/**
 * 기능 하나.
 *
 * `블록`/`설정` 으로 compose 를 부르고, 저장한 파일을 `본다` 로 확인한다.
 * **compose 가 통과했다고 '됨' 이 아니다** — 파일에 진짜 들어갔나까지 본다.
 */
const 기능들 = [
  // ── 문서·구역 ──────────────────────────────────────────────────────────
  { 갈래: '문서·구역', 이름: '쪽 여백', 설정: { margin_left: 30, margin_top: 25 },
    블록: [{ kind: 'body', text: '가' }],
    본다: (d) => d.구역들[0].쪽여백.left === 3000 },
  { 갈래: '문서·구역', 이름: '머리말·꼬리말 자리', 설정: { margin_header: 10 },
    블록: [{ kind: 'body', text: '가' }],
    본다: (d) => d.구역들[0].쪽여백.header === 1000 },
  { 갈래: '문서·구역', 이름: '쪽 번호', 설정: { page_number: 'bottom-center' },
    블록: [{ kind: 'body', text: '가' }],
    본다: (d) => findAll(d.구역들[0].root, 'hp:pageNum').length > 0 },
  { 갈래: '문서·구역', 이름: '쪽 나눔',
    블록: [{ kind: 'body', text: '가' }, { kind: 'page_break' }, { kind: 'body', text: '나' }],
    본다: (d) => d.구역들[0].모든문단들.some((p) => getAttr(p.el, 'pageBreak') === '1')
      || findAll(d.구역들[0].root, 'hp:ctrl').length > 0 },
  { 갈래: '문서·구역', 이름: '머리말 글',
    설정: { header_text: '함께 성장하며 꿈을 키워가는 행복한 학교' },
    블록: [{ kind: 'body', text: '가' }],
    본다: (d) => {
      const e = findAll(d.구역들[0].root, 'hp:header')[0];
      return e !== undefined && findAll(e, 'hp:t').some((t) => textOf(t).includes('행복한 학교'));
    } },
  { 갈래: '문서·구역', 이름: '꼬리말 글', 설정: { footer_text: '한빛초등학교' },
    블록: [{ kind: 'body', text: '가' }],
    본다: (d) => {
      const e = findAll(d.구역들[0].root, 'hp:footer')[0];
      return e !== undefined && findAll(e, 'hp:t').some((t) => textOf(t).includes('한빛'));
    } },
  { 갈래: '문서·구역', 이름: '다단', 안됨: '넣을 길이 없다' },
  { 갈래: '문서·구역', 이름: '구역 나누기',
    블록: [{ kind: 'body', text: '첫 구역' }, { kind: 'section_break' }, { kind: 'body', text: '둘째 구역' }],
    본다: (d) => d.구역이름들.length === 2
      // 머리글의 secCnt 가 안 맞으면 한글이 둘째 구역을 통째로 버린다
      && d.머리.구역수 === 2
      && (d.구역들[1].문단들.map((p) => p.글 ?? '').join('')).includes('둘째 구역') },
  { 갈래: '문서·구역', 이름: '쪽 테두리·배경', 안됨: '넣을 길이 없다' },
  { 갈래: '문서·구역', 이름: '바탕쪽', 안됨: '넣을 길이 없다' },

  // ── 문단 ───────────────────────────────────────────────────────────────
  { 갈래: '문단', 이름: '정렬', 블록: [{ kind: 'body', text: '가', align: 'center' }],
    본다: (d, 머리) => 문단속성(d, 머리, (pr) => 속성(findAll(pr, 'hh:align')[0], 'horizontal') === 'CENTER') },
  { 갈래: '문단', 이름: '왼쪽 여백', 블록: [{ kind: 'body', text: '가', indent_left: 20 }],
    본다: (d, 머리) => 문단속성(d, 머리, (pr) => 여백값(pr, 'hc:left') === 2000) },
  { 갈래: '문단', 이름: '내어쓰기', 블록: [{ kind: 'body', text: '가', hanging: -20 }],
    본다: (d, 머리) => 문단속성(d, 머리, (pr) => 여백값(pr, 'hc:intent') === -2000) },
  { 갈래: '문단', 이름: '위·아래 여백', 블록: [{ kind: 'body', text: '가', space_before: 12, space_after: 6 }],
    본다: (d, 머리) => 문단속성(d, 머리, (pr) => 여백값(pr, 'hc:prev') === 1200 && 여백값(pr, 'hc:next') === 600) },
  { 갈래: '문단', 이름: '줄 간격', 블록: [{ kind: 'body', text: '가', line_spacing: 200 }],
    본다: (d, 머리) => 문단속성(d, 머리, (pr) => 속성(findAll(pr, 'hh:lineSpacing')[0], 'value') === '200') },
  { 갈래: '문단', 이름: '개조식 위계',
    블록: [{ kind: 'outline', items: [{ level: 1, text: '가' }, { level: 3, text: '나' }] }],
    본다: (d) => d.구역들[0].모든문단들.filter((p) => (p.글 ?? '').trim()).length >= 2 },
  { 갈래: '문단', 이름: '탭', 블록: [{ kind: 'body', text: 'Ⅰ. 추진 배경	3', indent: false }],
    본다: (d) => findAll(d.구역들[0].root, 'hp:tab').length === 1 },
  { 갈래: '문단', 이름: '개요 번호(자동 번호)', 안됨: '넣을 길이 없다' },
  { 갈래: '문단', 이름: '문단 테두리·배경', 안됨: '넣을 길이 없다 (box 블록으로 흉내낸다)' },

  // ── 글자 ───────────────────────────────────────────────────────────────
  { 갈래: '글자', 이름: '글꼴', 블록: [{ kind: 'body', text: '가', font: '휴먼명조' }],
    본다: (d, 머리) => 글꼴들(d, 머리).includes('휴먼명조') },
  { 갈래: '글자', 이름: '크기', 블록: [{ kind: 'body', text: '가', size: 18 }],
    본다: (d, 머리) => 글자속성(d, 머리, (cp) => getAttr(cp, 'height') === '1800') },
  { 갈래: '글자', 이름: '굵게 (문단 안 부분만)', 블록: [{ kind: 'body', text: '보통 **굵게** 보통' }],
    본다: (d, 머리) => {
      const 런들 = d.구역들[0].모든문단들.flatMap((p) => p.런들);
      const 굵은것 = 런들.filter((r) => {
        const cp = findAll(머리, 'hh:charPr').find((x) => getAttr(x, 'id') === getAttr(r, 'charPrIDRef'));
        return cp && firstChildNamed(cp, 'hh:bold');
      });
      return 런들.length >= 3 && 굵은것.length === 1;
    } },
  { 갈래: '글자', 이름: '강조색', 설정: { highlight_color: '#C00000' },
    블록: [{ kind: 'body', text: '보통 [[강조]] 보통' }],
    본다: (d, 머리) => findAll(머리, 'hh:charPr').some((cp) => getAttr(cp, 'textColor') === '#C00000') },
  { 갈래: '글자', 이름: '자간', 블록: [{ kind: 'body', text: '가', letter_spacing: -5 }],
    본다: (d, 머리) => 글자속성(d, 머리, (cp) => {
      const sp = firstChildNamed(cp, 'hh:spacing');
      return sp !== undefined && Number(getAttr(sp, 'hangul')) === -5;
    }) },
  { 갈래: '글자', 이름: '기울임', 블록: [{ kind: 'body', text: '가', italic: true }],
    본다: (d, 머리) => 글자속성(d, 머리, (cp) => firstChildNamed(cp, 'hh:italic') !== undefined) },
  { 갈래: '글자', 이름: '밑줄', 블록: [{ kind: 'body', text: '가', underline: true }],
    본다: (d, 머리) => 글자속성(d, 머리, (cp) => 속성(firstChildNamed(cp, 'hh:underline'), 'type') === 'BOTTOM') },
  { 갈래: '글자', 이름: '음영', 블록: [{ kind: 'body', text: '가', shade: '#FFFF00' }],
    본다: (d, 머리) => 글자속성(d, 머리, (cp) => getAttr(cp, 'shadeColor') === '#FFFF00') },
  { 갈래: '글자', 이름: '장평', 블록: [{ kind: 'body', text: '가', width_ratio: 90 }],
    본다: (d, 머리) => 글자속성(d, 머리, (cp) => 속성(firstChildNamed(cp, 'hh:ratio'), 'hangul') === '90') },
  { 갈래: '글자', 이름: '취소선', 안됨: '넣을 길이 없다' },
  { 갈래: '글자', 이름: '위·아래 첨자', 안됨: '넣을 길이 없다' },
  { 갈래: '글자', 이름: '강조점', 안됨: '넣을 길이 없다' },

  // ── 표 ─────────────────────────────────────────────────────────────────
  { 갈래: '표', 이름: '만들기', 블록: [{ kind: 'table', headers: ['가', '나'], rows: [['1', '2']] }],
    본다: (d) => 첫표(d).줄수 === 2 && 첫표(d).칸수 === 2 },
  { 갈래: '표', 이름: '열 폭', 블록: [{ kind: 'table', rows: [['가', '나']], widths: [100, 200] }],
    본다: (d) => 첫표(d).열폭[0] === 10000 && 첫표(d).열폭[1] === 20000 },
  { 갈래: '표', 이름: '열마다 정렬',
    블록: [{ kind: 'table', headers: ['가', '나'], rows: [['1', '2']], col_align: ['left', 'right'] }],
    본다: (d, 머리) => {
      const t = 첫표(d);
      const 정렬 = (c) => {
        const p = findAll(t.셀(1, c).subList, 'hp:p')[0];
        const pr = findAll(머리, 'hh:paraPr').find((x) => getAttr(x, 'id') === getAttr(p, 'paraPrIDRef'));
        return 속성(findAll(pr, 'hh:align')[0], 'horizontal');
      };
      return 정렬(0) === 'LEFT' && 정렬(1) === 'RIGHT';
    } },
  { 갈래: '표', 이름: '표 안 글자 크기',
    블록: [{ kind: 'table', rows: [['가']], cell_size: 14 }],
    본다: (d, 머리) => {
      const r = findAll(첫표(d).셀(0, 0).subList, 'hp:run')[0];
      const cp = findAll(머리, 'hh:charPr').find((x) => getAttr(x, 'id') === getAttr(r, 'charPrIDRef'));
      return getAttr(cp, 'height') === '1400';
    } },
  { 갈래: '표', 이름: '셀 안쪽 여백', 블록: [{ kind: 'table', rows: [['가']], cell_padding: 3 }],
    본다: (d) => getAttr(firstChildNamed(d.구역들[0].표들[0], 'hp:inMargin'), 'left') === '300' },
  { 갈래: '표', 이름: '테두리 굵기', 블록: [{ kind: 'table', rows: [['가']], border_width: '0.4 mm' }],
    본다: (d, 머리) => findAll(머리, 'hh:borderFill')
      .some((bf) => 속성(findAll(bf, 'hh:leftBorder')[0], 'width') === '0.4 mm') },
  { 갈래: '표', 이름: '머리 줄 배경',
    블록: [{ kind: 'table', headers: ['가'], rows: [['1']], header_background: '#D9E2F3' }],
    본다: (d, 머리) => findAll(머리, 'hh:borderFill')
      .some((bf) => 속성(findAll(bf, 'hc:winBrush')[0], 'faceColor') === '#D9E2F3') },
  { 갈래: '표', 이름: '머리 줄 되풀이',
    블록: [{ kind: 'table', headers: ['가'], rows: [['1']], repeat_header: true }],
    본다: (d) => 첫표(d).머리행반복 },
  { 갈래: '표', 이름: '셀 병합',
    블록: [{ kind: 'table', rows: [['가', '나', '다'], ['1', '2', '3']],
      merges: [{ row: 0, col: 0, colspan: 2 }] }],
    본다: (d) => {
      const t = 첫표(d);
      return t.시작셀(0, 0).자리.colSpan === 2 && t.시작셀(0, 1) === undefined && t.탈만.length === 0;
    } },
  { 갈래: '표', 이름: '표 캡션',
    블록: [{ kind: 'table', rows: [['가']], caption: '< 정량성과 사업비 구분 >' }],
    본다: (d) => {
      const cap = findAll(d.구역들[0].표들[0], 'hp:caption')[0];
      return cap !== undefined && getAttr(cap, 'side') === 'TOP'
        && findAll(cap, 'hp:t').some((t) => textOf(t).includes('정량성과'));
    } },
  { 갈래: '표', 이름: '표 정렬', 블록: [{ kind: 'table', rows: [['가']], align: 'center' }],
    본다: (d) => 속성(firstChildNamed(d.구역들[0].표들[0], 'hp:pos'), 'horzAlign') === 'CENTER' },
  { 갈래: '표', 이름: '표 바깥 여백', 블록: [{ kind: 'table', rows: [['가']], outer_margin: 5 }],
    본다: (d) => 속성(firstChildNamed(d.구역들[0].표들[0], 'hp:outMargin'), 'left') === '500' },

  // ── 개체 ───────────────────────────────────────────────────────────────
  { 갈래: '개체', 이름: '그림', 블록: [{ kind: 'image', path: 그림파일, width: 120 }],
    본다: (d) => findAll(d.구역들[0].root, 'hp:pic').length === 1 && d.컨테이너.binDataNames().length === 1 },
  { 갈래: '개체', 이름: '그림 설명',
    블록: [{ kind: 'image', path: 그림파일, width: 120, caption: '〈그림 1〉' }],
    본다: (d) => d.구역들[0].모든문단들.some((p) => (p.글 ?? '').includes('〈그림 1〉')) },
  { 갈래: '개체', 이름: '띠 (배경색 제목줄)', 블록: [{ kind: 'band', text: 'Ⅰ. 배경', background: '#1F4E9C' }],
    본다: (d, 머리) => findAll(머리, 'hh:borderFill')
      .some((bf) => 속성(findAll(bf, 'hc:winBrush')[0], 'faceColor') === '#1F4E9C') },
  { 갈래: '개체', 이름: '상자', 블록: [{ kind: 'box', title: '< 과제 >', items: [{ text: '가' }, { text: '나' }] }],
    본다: (d) => d.구역들[0].모든문단들.some((p) => (p.글 ?? '').includes('< 과제 >')) },
  { 갈래: '개체', 이름: '사각형 도형',
    블록: [{ kind: 'shape', text: '2  3주기 사업 개요', width: 300, height: 40,
      border_color: '#1F4E9C', line_width: 1, background: '#FFFFFF', bold: true }],
    본다: (d) => {
      const rect = findAll(d.구역들[0].root, 'hp:rect')[0];
      if (!rect) return false;
      // 글이 **상자 안**에 있어야 한다. 밖에 있으면 제목 상자가 아니라 빈 상자다.
      return findAll(rect, 'hp:drawText').length === 1
        && findAll(rect, 'hp:t').some((t) => textOf(t).includes('3주기'));
    } },
  { 갈래: '개체', 이름: '타원·다각형', 안됨: '넣을 길이 없다 (161편에 5편뿐)' },
  { 갈래: '개체', 이름: '글상자(도형 안 글)', 안됨: '넣을 길이 없다 (도형 뒤 문단으로 대신한다)' },
  { 갈래: '개체', 이름: '수식', 안됨: '넣을 길이 없다' },

  // ── 참조 ───────────────────────────────────────────────────────────────
  { 갈래: '참조', 이름: '각주·미주', 안됨: '넣을 길이 없다' },
  { 갈래: '참조', 이름: '하이퍼링크', 안됨: '넣을 길이 없다' },
  { 갈래: '참조', 이름: '책갈피', 안됨: '넣을 길이 없다' },
  { 갈래: '참조', 이름: '메모', 안됨: '넣을 길이 없다' },

  // ── 읽기 ───────────────────────────────────────────────────────────────
  { 갈래: '읽기', 이름: '표 안까지 뼈대 보기', 도구: 'get_outline', 인자: { in_tables: true },
    본다: (r) => (r.structuredContent?.items ?? []).length > 0 },
  { 갈래: '읽기', 이름: '뼈대 보기', 도구: 'get_outline',
    본다: (r) => (r.structuredContent?.items ?? []).length > 0 },
  { 갈래: '읽기', 이름: '글 찾기', 도구: 'find', 인자: { text: '가' },
    본다: (r) => (r.structuredContent?.hits ?? r.structuredContent?.items ?? []).length >= 0 },
  { 갈래: '읽기', 이름: '스타일 보기', 도구: 'get_styles',
    본다: (r) => r.structuredContent !== undefined },
];

// ── 도우미 ────────────────────────────────────────────────────────────────
function 첫표(d) { return new 표클래스(d.구역들[0].표들[0]); }

/** 노드가 없을 수도 있다. `getAttr({}, …)` 는 터진다 — 여기서 막는다 */
function 속성(노드, 이름) { return 노드 ? getAttr(노드, 이름) : undefined; }

function 여백값(pr, 태그) {
  // 여백은 hp:switch 안에 있다. **깊이 찾는다** — firstChildNamed 는 늘 못 찾는다.
  const 값들 = findAll(pr, 태그).map((e) => Number(getAttr(e, 'value')));
  return 값들[값들.length - 1];   // hp:default 가 HWPUNIT 그대로다
}

/**
 * 글이 든 런들. **첫 런만 보면 안 된다** —
 * 빈 문서 틀이 이미 들고 있던 런을 집어서 "안 들어갔다" 는 헛것을 봤다.
 */
function 글든런들(d) {
  return d.구역들[0].모든문단들.flatMap((p) => p.런들).filter((r) => childrenNamed(r, 'hp:t').length > 0);
}

function 문단속성(d, 머리, 보기) {
  return d.구역들[0].모든문단들.some((p) => {
    const pr = findAll(머리, 'hh:paraPr').find((x) => getAttr(x, 'id') === getAttr(p.el, 'paraPrIDRef'));
    return pr !== undefined && 보기(pr);
  });
}

function 글자속성(d, 머리, 보기) {
  return 글든런들(d).some((r) => {
    const cp = findAll(머리, 'hh:charPr').find((x) => getAttr(x, 'id') === getAttr(r, 'charPrIDRef'));
    return cp !== undefined && 보기(cp);
  });
}

/** 이 문서가 쓰는 글꼴 이름들 */
function 글꼴들(d, 머리) {
  const 이름표 = new Map(findAll(머리, 'hh:font').map((f) => [getAttr(f, 'id'), getAttr(f, 'face')]));
  return 글든런들(d).map((r) => {
    const cp = findAll(머리, 'hh:charPr').find((x) => getAttr(x, 'id') === getAttr(r, 'charPrIDRef'));
    const fr = cp && firstChildNamed(cp, 'hh:fontRef');
    return fr ? 이름표.get(getAttr(fr, 'hangul')) : undefined;
  }).filter(Boolean);
}

// ── 돌린다 ────────────────────────────────────────────────────────────────
const 나온것 = [];
for (const [i, f] of 기능들.entries()) {
  if (f.안됨) { 나온것.push({ ...f, 됨: false, 왜: f.안됨 }); continue; }

  const 방 = new 문서방();
  try {
    const doc_id = (await 도구부르기('create_document', {}, 방)).structuredContent.doc_id;

    if (f.도구) {
      await 도구부르기('compose', { doc_id, blocks: [{ kind: 'body', text: '가나다' }] }, 방);
      const r = await 도구부르기(f.도구, { doc_id, ...(f.인자 ?? {}) }, 방);
      나온것.push({ ...f, 됨: !r.isError && f.본다(r), 왜: r.isError ? r.content?.[0]?.text?.slice(0, 60) : '' });
      continue;
    }

    const r = await 도구부르기('compose', { doc_id, blocks: f.블록, ...(f.설정 ?? {}) }, 방);
    if (r.isError) {
      나온것.push({ ...f, 됨: false, 왜: `도구가 거절: ${(r.content?.[0]?.text ?? '').split('\n')[0].slice(0, 60)}` });
      continue;
    }
    const 낼곳 = path.join(무대, `f${i}.hwpx`);
    const s = await 도구부르기('save_document', { doc_id, path: 낼곳, overwrite: true }, 방);
    if (s.isError) {
      나온것.push({ ...f, 됨: false, 왜: `저장이 막힘: ${(s.content?.[0]?.text ?? '').split('\n')[0].slice(0, 60)}` });
      continue;
    }
    const d = 문서.열기(fs.readFileSync(낼곳));
    const 머리 = parseXml(d.머리.toXml()).root;
    const 됨 = f.본다(d, 머리) === true;
    나온것.push({ ...f, 됨, 왜: 됨 ? '' : '**도구는 통과했는데 파일에 안 들어갔다**' });
  } catch (e) {
    나온것.push({ ...f, 됨: false, 왜: `터짐: ${e.message.split('\n')[0].slice(0, 70)}` });
  }
}

// ── 알림 ──────────────────────────────────────────────────────────────────
let 갈래 = '';
for (const r of 나온것) {
  if (r.갈래 !== 갈래) { 갈래 = r.갈래; console.log(`\n── ${갈래} ${'─'.repeat(Math.max(0, 46 - 갈래.length * 2))}`); }
  console.log(`  ${r.됨 ? '○' : '✗'} ${r.이름.padEnd(24)} ${r.왜 ?? ''}`);
}

const 됨수 = 나온것.filter((r) => r.됨).length;
const 거짓말 = 나온것.filter((r) => !r.됨 && (r.왜 ?? '').includes('안 들어갔다'));
console.log(`\n기능 ${나온것.length}개 — 되는 것 ${됨수} / 아직 없는 것 ${나온것.length - 됨수}`);
if (거짓말.length) {
  console.log(`\n**말과 파일이 다른 것 ${거짓말.length}건** — 이건 없는 기능보다 나쁘다:`);
  for (const r of 거짓말) console.log(`  ✗ ${r.갈래} / ${r.이름}`);
}
// '없는 기능' 은 탈이 아니다. **거짓말만** 빌드를 깬다.
process.exit(거짓말.length ? 1 : 0);
