/**
 * 도구 표면 — 4단계 최소 세트 **10개.**
 *
 * ## 도구 설명은 모델이 읽는 글이다
 *
 * 사람 문서가 아니다. 모델이 이걸 읽고 **부를지 말지**를 정한다.
 * 그래서 무엇을 하는지보다 **언제 쓰는지**를 먼저 적는다.
 *
 * ## 주석(annotations)이 왜 붙나
 *
 * `readOnlyHint: true` 인 도구는 호스트가 확인 없이 통과시킬 수 있다.
 * 읽기 도구 넷에 이걸 달아 두면 **탐색이 가벼워진다** —
 * 문서를 훑어보는 데 사람이 매번 허락하지 않아도 된다.
 *
 * `destructiveHint: true` 는 반대다. 덮어쓸 수 있는 것에만 단다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { 문서, 표, 문단, 됨, 안됨, type 결과, type 글자모양패치, 그림들이기 } from '@hwpx/doc';
import { 조판, 블록종류, type 블록, 정렬맞추기, 크기맞추기, 뜨기, 조각 } from '@hwpx/compose';
import { childrenNamed, findAll, getAttr, firstChildNamed, parseXml, pt, ptToHwp, appendChild, type ElementNode } from '@hwpx/owpml';

import {
  글자, 숫자, 정수, 참거짓, 목록, 고름, 묶음, doc_id, 절대경로,
  type 스키마,
} from './스키마.js';
import { 인자검사, 탈말, 절대경로검사 } from './인자검사.js';
import { 잘됨, 못함, type 도구결과 } from './결과내기.js';
import { 문서방 } from './문서방.js';

export interface 도구주석 {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface 도구 {
  name: string;
  description: string;
  inputSchema: 스키마;
  outputSchema?: 스키마;
  annotations?: 도구주석;
  /**
   * 스키마 중첩이 3단계를 넘어야만 하는 도구는 여기에 **왜인지 적는다.**
   * 적지 않으면 린터가 깬다 — 슬그머니 깊어지는 것을 막는다.
   */
  중첩예외?: { 최대: number; 왜: string };
  처리: (인자: Record<string, unknown>, 방: 문서방) => Promise<도구결과> | 도구결과;
}

/** 인자를 검사하고, 통과하면 처리기를 부른다 */
function 검사하고<T extends Record<string, unknown>>(
  s: 스키마,
  처리: (인자: T, 방: 문서방) => Promise<도구결과> | 도구결과,
): (인자: Record<string, unknown>, 방: 문서방) => Promise<도구결과> | 도구결과 {
  return (인자, 방) => {
    const 탈 = 인자검사(인자 ?? {}, s);
    if (탈.length) {
      return 못함(
        `인자가 ${탈.length}군데 맞지 않는다`,
        `아래를 고쳐서 다시 불러라:\n${탈말(탈)}`,
      );
    }
    return 처리(인자 as T, 방);
  };
}

/** 문서를 꺼내거나, 못 꺼내면 그 까닭을 준다 */
function 문서꺼내기(방: 문서방, id: string) {
  const it = 방.꺼내기(id);
  if (it) return { ok: true as const, it };
  const { 이유, 어떻게 } = 방.못찾음말(id);
  return { ok: false as const, 결과: 못함(이유, 어떻게) };
}

// ── 문서 (5) ───────────────────────────────────────────────────────────────

const 만들기스키마 = 묶음('빈 문서를 만든다', {});

const 열기스키마 = 묶음('파일을 연다', {
  path: 절대경로('열 HWPX 파일'),
  read_only: 참거짓('읽기만 할 건가. 기본 false'),
}, ['path']);

const 저장스키마 = 묶음('문서를 저장한다', {
  doc_id,
  path: 절대경로('저장할 곳. 안 주면 연 곳에 덮어쓴다'),
  overwrite: 참거짓('이미 있는 파일을 덮어쓸 건가. 기본 false — 켜지 않으면 거절한다'),
}, ['doc_id']);

const 닫기스키마 = 묶음('문서를 닫는다', { doc_id }, ['doc_id']);

const 목록스키마 = 묶음('열려 있는 문서들', {});

// ── 읽기 (4) ───────────────────────────────────────────────────────────────

const 뼈대스키마 = 묶음('문서 뼈대를 본다', {
  doc_id,
  section: 정수('구역 번호. 기본 0'),
  limit: 정수('몇 개까지 볼까. 기본 200. 잘리면 답의 truncated 가 true 다'),
  // 양식은 글이 거의 다 표 안에 있다. 맨 위만 보면 아무것도 안 보인다 —
  // 학교 가정통신문은 문서 전체가 **문단 하나에 든 표 둘**이라 뼈대가 1개로 나왔다.
  in_tables: 참거짓('표 **안**의 셀까지 볼까. 양식을 채울 때 켠다'),
}, ['doc_id']);

const 내용스키마 = 묶음('요소 하나의 내용을 본다 (id 를 안 주면 문서 전체 글)', {
  doc_id,
  // **id 는 안 줘도 된다.** 안 주면 문서를 처음부터 끝까지 글로 낸다.
  // 고치기 전에 「전체 흐름을 먼저 읽는다」 를 하려면 이 길이 있어야 한다.
  id: 글자('요소 ID. 안 주면 문서 전체 글. get_outline 이나 find 가 준 값 (p_3f2a, tbl_9c1, cell_9c1_0_2)'),
}, ['doc_id']);

const 찾기스키마 = 묶음('글이나 종류로 요소를 찾는다', {
  doc_id,
  text: 글자('찾을 글. 이 글이 든 문단·셀을 찾는다'),
  kind: 고름('찾을 종류', ['paragraph', 'table', 'cell']),
  // 훑을 때(text 없이 kind 만)와 찾을 때의 기본이 다르다.
  // **훑기는 본디 전수다** — 50 으로 자르면 뒷절이 통째로 안 보인다.
  // 실제로 계획서 84문단 가운데 「4. 예산사용계획」이 51번째 뒤에 있었다.
  limit: 정수('몇 개까지. 훑을 때(kind 만) 기본 500, 글로 찾을 때 기본 50'),
}, ['doc_id']);

const 서식스키마 = 묶음('문서에 정의된 서식을 본다', { doc_id }, ['doc_id']);

// ── 조판 (1) ───────────────────────────────────────────────────────────────

const 블록스키마: 스키마 = 묶음('블록 하나', {
  kind: 고름('블록 종류', [...블록종류]),
  text: 글자(
    '글. `**굵게**` 와 `[[강조]]` 를 섞어 쓸 수 있다 (겹쳐도 된다: `**[[둘 다]]**`). '
    + '별표를 글자 그대로 쓰려면 `\\*\\*` 로 적는다.',
  ),
  date: 글자('title 블록의 날짜 (예: 2026. 3.)'),
  org: 글자('title 블록의 기관 이름 (예: 교 육 부)'),
  background: 글자('band·box 의 배경색 #RRGGBB'),
  color: 글자('band 의 글자색 #RRGGBB'),
  title: 글자('box 의 머리 줄'),
  items: 목록('box 의 항목들, 또는 outline 의 항목들', 묶음('항목', {
    level: 정수('개조식 단계 1~4. 깊을수록 들여쓴다'),
    text: 글자('항목 글'),
    bold: 참거짓('굵게 할까'),
  })),
  headers: 목록('table 의 머리 줄', 글자('칸 글')),
  rows: 목록('table 의 줄들', 목록('한 줄', 글자('칸 글'))),
  widths: 목록('table 의 열 폭 (pt). 안 주면 고르게 나눈다', 숫자('폭 pt')),
  repeat_header: 참거짓('머리 줄을 쪽마다 되풀이할까. 기본 true'),
  // 표 서식은 **열 단위**로 받는다. 칸마다 객체로 받으면 중첩이 한 겹 깊어지고
  // (rows[][].text), 정부 문서 표는 실제로 칸이 아니라 열마다 정렬이 다르다.
  col_align: 목록('table 의 열마다 정렬. 열 수만큼 준다',
    고름('정렬', ['left', 'center', 'right'])),
  cell_size: 숫자('table 안 글자 크기 pt. 기본 10'),
  cell_padding: 숫자('셀 안쪽 여백 pt'),
  header_background: 글자('table 머리 줄 배경색 #RRGGBB. 기본 #E8EEF7'),
  border_width: 글자("table 테두리 굵기 (예: '0.12 mm', '0.4 mm')"),
  // 실측: 문서 161편 가운데 122편(76%)이 셀을 합친다. 이게 없으면 정부 문서 표를 못 만든다.
  caption_side: 고름('table 캡션 자리. 기본 top', ['top', 'bottom', 'left', 'right']),
  merges: 목록('table 에서 합칠 칸들', 묶음('합칠 칸', {
    row: 정수('시작 줄 (0부터)'),
    col: 정수('시작 칸 (0부터)'),
    rowspan: 정수('몇 줄을 덮을까. 기본 1'),
    colspan: 정수('몇 칸을 덮을까. 기본 1'),
  })),
  size: 숫자('글자 크기 pt'),
  // 줄 높이가 글꼴마다 다르다 — 같은 180% 라도 휴먼명조 24pt, 함초롬바탕 27pt.
  // 안 맞추면 쪽에 들어가는 줄 수가 달라져 세로로 넘친다.
  font: 글자("이 블록의 글꼴 이름 (예: '휴먼명조'). 안 주면 body_font 를 따른다"),
  align: 고름('정렬', ['left', 'center', 'right', 'justify']),
  bold: 참거짓('굵게 할까'),
  // 문서 층에는 있었는데 **입구가 없어 못 쓰던 것들.** 기능표가 잡아 줬다.
  italic: 참거짓('기울임'),
  underline: 참거짓('밑줄'),
  shade: 글자('글자 배경(음영) 색 #RRGGBB'),
  width_ratio: 숫자('장평 — 글자 너비 %. 100 이 보통'),
  outer_margin: 숫자('table 바깥 여백 pt'),
  // shape 블록. 실측: 도형 쓰는 34편 가운데 33편이 hp:rect 다 (254개).
  border_color: 글자('shape 테두리 색 #RRGGBB'),
  line_width: 숫자('shape 테두리 굵기 pt'),
  indent: 참거짓('body 의 첫 줄 들여쓰기. 기본 true'),
  line_spacing: 숫자('줄 간격 %. 기본 160'),
  letter_spacing: 숫자('자간 %. 음수면 좁아진다'),
  emphasize: 목록('outline 에서 굵게 할 어구들', 글자('어구')),

  // image 블록. 이 넷이 없어서 **모델이 그림을 아예 못 넣었다** —
  // compose 는 image 를 다 만들어 놓았는데 스키마에 자리가 없어 인자 검사가 막았다.
  // 조판 층에 있는 것과 도구 표면에 뚫린 것이 어긋나면, 있는 기능이 없는 것이 된다.
  // 그래서 `블록표면.test.ts` 가 그 어긋남을 지킨다.
  path: 글자('image 블록의 그림 파일 **절대 경로** (png·jpg·gif·bmp)'),
  width: 숫자('image 의 너비 pt. 높이만 주면 비율대로 맞춘다'),
  height: 숫자('image 의 높이 pt. 너비만 주면 비율대로 맞춘다'),
  caption: 글자('image 아래에 붙일 설명 (예: 〈그림 1〉 …)'),

  // 문단 사이 간격과 개조식 내어쓰기.
  // 정부 문서의 `○ (참여 대상) …` 같은 줄은 내어쓰기로 둘째 줄을 글머리 아래 넣는다.
  // 이게 없으면 둘째 줄이 왼쪽 끝까지 나가 모양이 통째로 달라진다.
  space_before: 숫자('문단 위 여백 pt'),
  space_after: 숫자('문단 아래 여백 pt'),
  indent_left: 숫자('왼쪽 여백 pt. 개조식 단계마다 들여쓰는 그것'),
  hanging: 숫자('첫 줄 내어쓰기 pt. **음수면 둘째 줄부터 들여간다**'),
}, ['kind']);

/**
 * 고치는 일 하나.
 *
 * **도구를 늘리지 않고 `op` 로 가른다.** 옛 MCP 는 이걸 열한 개 도구로 쪼갰다
 * (`update_table_cell` `batch_fill_table` `replace_text` `batch_replace`
 * `insert_table_row` `delete_paragraph` `update_paragraph_text_preserve_styles` …).
 * 그러면 `tools/list` 가 먼저 컨텍스트를 먹고, 모델은 어느 것을 쓸지 헷갈린다.
 *
 * 묶어서 받는 것도 뜻이 있다. 한 칸씩 여러 번 부르면 그 사이에 줄이 밀린다 —
 * Draftsmith 지침도 "한 칸씩보다 묶어서" 를 못박아 두고 있다.
 */
const 고침스키마: 스키마 = 묶음('고칠 것 하나', {
  op: 고름('무엇을 할까',
    ['set_text', 'replace', 'set_style', 'insert_row', 'delete_row', 'insert_image']),
  id: 글자('가리킬 것의 ID. find·get_outline 이 준 값 (p_… tbl_… cell_…)'),
  text: 글자('set_text 로 넣을 글. `**굵게**` `[[강조]]` 를 섞어 쓸 수 있다'),
  find: 글자('replace 로 찾을 글'),
  replace: 글자('replace 로 바꿀 글'),
  limit: 정수('replace 로 몇 개까지 바꿀까. 안 주면 다'),
  bold: 참거짓('set_style — 굵게'),
  italic: 참거짓('set_style — 기울임'),
  underline: 참거짓('set_style — 밑줄'),
  size: 숫자('set_style — 글자 크기 pt'),
  color: 글자('set_style — 글자색 #RRGGBB'),
  font: 글자('set_style — 글꼴 이름'),
  align: 고름('set_style — 정렬', ['left', 'center', 'right', 'justify']),
  at: 정수('insert_row — 몇 번째 자리에 넣을까 (0부터). 안 주면 맨 뒤. '
    + 'delete_row — 몇 번째 줄부터 지울까 (0부터). **이건 꼭 줘야 한다**'),
  count: 정수('insert_row · delete_row — 몇 줄. 기본 1'),
  // **지우는 것은 되돌릴 수 없다.** 그래서 기본은 빈 줄만 지운다.
  force: 참거짓('delete_row — 글이 든 줄도 지울까. 기본 false (빈 줄만 지운다)'),
  path: 글자('insert_image — 그림 파일 **절대 경로** (png·jpg·gif·bmp)'),
  // **하나만 주는 것이 낫다.** 하나만 주면 비율을 지켜 나머지를 잡는다.
  // 둘 다 주면 그대로 늘려서 찌그러진다 — 그럴 뜻이 있을 때만 둘을 줘라.
  width: 숫자('insert_image — 너비 pt. **보통 이것만 준다** (높이는 비율대로 잡힌다)'),
  height: 숫자('insert_image — 높이 pt. width 와 같이 주면 비율을 안 지켜 찌그러진다'),
}, ['op']);

const 고치기스키마 = 묶음('열어 놓은 문서를 고친다', {
  doc_id: 글자('문서 손잡이'),
  edits: 목록('고칠 것들. 적은 차례대로 한다', 고침스키마),
}, ['doc_id', 'edits']);

const 조판스키마 = 묶음('블록 목록으로 문서를 쓴다', {
  doc_id,
  blocks: 목록(
    '쓸 블록들. **순서대로 앉는다** — 위치 번호를 주지 않는다. '
    + '뒤에 손볼 것이 있으면 돌려주는 ID 로 가리켜라.',
    블록스키마,
  ),
  body_font: 글자('본문 글꼴 이름 (예: 함초롬바탕)'),
  title_font: 글자('제목 글꼴 이름'),
  highlight_color: 글자('`[[…]]` 에 쓸 색 #RRGGBB. 기본 #0000FF'),
  line_spacing: 숫자('본문 줄 간격 %. 기본 160'),
  letter_spacing: 숫자('본문 자간 %. 음수면 좁아진다'),
  margin_left: 숫자('쪽 왼쪽 여백 pt (20mm = 56.7pt)'),
  margin_right: 숫자('쪽 오른쪽 여백 pt'),
  margin_top: 숫자('쪽 위 여백 pt'),
  margin_bottom: 숫자('쪽 아래 여백 pt'),
  // 머리말·꼬리말 자리의 높이. 이게 다르면 **쪽에 들어가는 줄 수가 달라진다** —
  // 본문 높이가 `쪽높이 - 위 - 아래 - 머리말 - 꼬리말` 이기 때문이다.
  margin_header: 숫자('머리말 자리 높이 pt. 정부 문서는 보통 10mm(28.35pt)'),
  margin_footer: 숫자('꼬리말 자리 높이 pt. 정부 문서는 보통 10mm(28.35pt)'),
  // 실측: 문서 161편 가운데 12편(7%)이 머리말·꼬리말에 글을 넣는다.
  header_text: 글자('머리말에 넣을 글'),
  footer_text: 글자('꼬리말에 넣을 글'),
  page_number: 고름('쪽 번호 자리', ['bottom-center', 'bottom-left', 'bottom-right']),
}, ['doc_id', 'blocks']);

// ── 도구들 ─────────────────────────────────────────────────────────────────

export const 도구들: 도구[] = [
  {
    name: 'create_document',
    description:
      '빈 HWPX 문서를 만들고 손잡이(doc_id)를 준다. '
      + '**맨바닥에서 쓸 때만** 부른다 — 채울 양식 파일이 있으면 open_document 를 써라. '
      + '만든 뒤 compose 로 내용을 넣고 save_document 로 저장한다. '
      + '틀(한글이 만든 빈 문서)에서 시작하므로 한글이 바로 연다.',
    inputSchema: 만들기스키마,
    outputSchema: 묶음('만든 문서', {
      ok: 참거짓('됐나'),
      doc_id: 글자('문서 손잡이'),
    }, ['ok', 'doc_id']),
    annotations: { title: '빈 문서 만들기', idempotentHint: false },
    처리: 검사하고(만들기스키마, (_인자, 방) => {
      const d = 문서.새로();
      d.ID매기기();
      const id = 방.들이기(d);
      return 잘됨(`빈 문서를 만들었다 (${id})`, { ok: true, doc_id: id });
    }),
  },

  {
    name: 'open_document',
    description:
      '있는 HWPX 파일을 열고 손잡이(doc_id)를 준다. '
      + '**남의 문서를 고칠 때 여기서 시작한다.** 손대지 않은 부분은 바이트 그대로 보존되므로 '
      + '한 글자만 고쳐도 나머지가 안 바뀐다. 연 다음 get_outline 으로 무엇이 있는지 본다.',
    inputSchema: 열기스키마,
    outputSchema: 묶음('연 문서', {
      ok: 참거짓('됐나'),
      doc_id: 글자('문서 손잡이'),
      sections: 정수('구역 수'),
      paragraphs: 정수('문단 수'),
      tables: 정수('표 수'),
    }, ['ok', 'doc_id']),
    annotations: { title: '문서 열기', readOnlyHint: true },
    처리: 검사하고<{ path: string; read_only?: boolean }>(열기스키마, (인자, 방) => {
      const 절대 = 절대경로검사(인자.path);
      if (!절대.ok) return 못함(절대.이유, 절대.어떻게);
      if (!fs.existsSync(인자.path)) {
        const 폴더 = path.dirname(인자.path);
        const 있는것 = fs.existsSync(폴더)
          ? fs.readdirSync(폴더).filter((f) => f.toLowerCase().endsWith('.hwpx')).slice(0, 8)
          : [];
        return 못함(
          `${인자.path} 파일이 없다`,
          있는것.length
            ? `그 폴더에 있는 HWPX: ${있는것.join(', ')}`
            : `${폴더} 폴더에 HWPX 가 없다. 경로를 다시 보라.`,
        );
      }

      let d: 문서;
      try {
        d = 문서.열기(fs.readFileSync(인자.path));
      } catch (e) {
        return 못함(
          `열 수 없다: ${(e as Error).message.split('\n')[0]}`,
          'HWPX 가 맞는지, .hwp(옛 형식)를 .hwpx 로 잘못 부른 건 아닌지 보라.',
        );
      }
      d.ID매기기();
      const id = 방.들이기(d, { 경로: 인자.path, 읽기만: 인자.read_only ?? false });
      const 문단수 = d.구역들.reduce((n, s) => n + s.모든문단들.length, 0);
      const 표수 = d.구역들.reduce((n, s) => n + s.표들.length, 0);
      return 잘됨(
        `${path.basename(인자.path)} 를 열었다 — 구역 ${d.구역들.length}개 · 문단 ${문단수}개 · 표 ${표수}개 (${id})`,
        { ok: true, doc_id: id, sections: d.구역들.length, paragraphs: 문단수, tables: 표수 },
      );
    }),
  },

  {
    name: 'save_document',
    description:
      '문서를 파일로 저장한다. `path` 를 안 주면 연 곳에 덮어쓴다. '
      + '**이미 있는 파일은 `overwrite: true` 없이 덮어쓰지 않는다.** '
      + '저장 전에 규격 검사를 돌려, 한글이 못 읽을 파일이면 쓰지 않고 무엇이 문제인지 말한다.',
    inputSchema: 저장스키마,
    outputSchema: 묶음('저장 결과', {
      ok: 참거짓('됐나'),
      path: 글자('저장한 곳'),
      bytes: 정수('파일 크기'),
    }, ['ok']),
    annotations: { title: '문서 저장', destructiveHint: true, idempotentHint: true },
    처리: 검사하고<{ doc_id: string; path?: string; overwrite?: boolean }>(저장스키마, (인자, 방) => {
      const 것 = 문서꺼내기(방, 인자.doc_id);
      if (!것.ok) return 것.결과;
      if (것.it.읽기만) {
        return 못함(
          '읽기만 하려고 연 문서다',
          'read_only 없이 다시 열거나, 다른 path 로 저장하라.',
        );
      }

      const 낼곳 = 인자.path ?? 것.it.경로;
      if (!낼곳) {
        return 못함(
          '어디에 저장할지 모른다',
          '새로 만든 문서라 온 곳이 없다. path 에 절대 경로를 적어라.',
        );
      }
      const 절대 = 절대경로검사(낼곳);
      if (!절대.ok) return 못함(절대.이유, 절대.어떻게);

      if (fs.existsSync(낼곳) && !인자.overwrite) {
        return 못함(
          `${낼곳} 가 이미 있다`,
          '덮어쓰려면 overwrite: true 를 같이 주거나, 다른 path 를 적어라.',
        );
      }

      const 탈 = 것.it.d.검사();
      if (탈.length) {
        return 못함(
          `이대로 쓰면 한글이 못 읽는다 (${탈.length}건)`,
          `고칠 것:\n${탈.map((t) => `  - ${t}`).join('\n')}`,
        );
      }

      let 바이트: Buffer;
      try {
        바이트 = 것.it.d.저장();
      } catch (e) {
        return 못함(`저장을 막았다: ${(e as Error).message.split('\n')[0]}`, '위 문제를 고치고 다시 저장하라.');
      }

      const 폴더 = path.dirname(낼곳);
      if (!fs.existsSync(폴더)) {
        return 못함(`${폴더} 폴더가 없다`, '있는 폴더에 저장하거나 폴더를 먼저 만들어라.');
      }
      fs.writeFileSync(낼곳, 바이트);
      것.it.경로 = 낼곳;
      return 잘됨(
        `${path.basename(낼곳)} 로 저장했다 (${바이트.length.toLocaleString()}바이트)`,
        { ok: true, path: 낼곳, bytes: 바이트.length },
      );
    }),
  },

  {
    name: 'close_document',
    description:
      '문서를 닫고 손잡이를 버린다. **저장하지 않은 것은 사라진다** — 먼저 save_document 를 부르라. '
      + '안 닫아도 한 시간 뒤에는 저절로 닫힌다.',
    inputSchema: 닫기스키마,
    outputSchema: 묶음('닫기 결과', {
      ok: 참거짓('됐나'),
      closed: 참거짓('닫았나'),
    }, ['ok']),
    annotations: { title: '문서 닫기', idempotentHint: true },
    처리: 검사하고<{ doc_id: string }>(닫기스키마, (인자, 방) => {
      const 닫았나 = 방.닫기(인자.doc_id);
      if (!닫았나) {
        const { 이유, 어떻게 } = 방.못찾음말(인자.doc_id);
        return 못함(이유, 어떻게);
      }
      return 잘됨(`${인자.doc_id} 를 닫았다`, { ok: true, closed: true });
    }),
  },

  {
    name: 'list_documents',
    description:
      '지금 열려 있는 문서들을 본다. **어떤 손잡이가 살아 있는지 모를 때** 부른다. '
      + '손잡이는 한 시간 안 쓰면 닫히므로, 오래된 작업을 이어갈 때 먼저 확인하면 좋다.',
    inputSchema: 목록스키마,
    outputSchema: 묶음('열린 문서들', {
      ok: 참거짓('됐나'),
      count: 정수('몇 개'),
      documents: 목록('열린 문서들', 묶음('문서 하나', {
        doc_id: 글자('손잡이'),
        path: 글자('파일 경로. 새로 만든 것이면 없다'),
        read_only: 참거짓('읽기만 하려고 열었나'),
        opened_ago_sec: 정수('연 지 몇 초'),
      })),
    }, ['ok', 'count']),
    annotations: { title: '열린 문서 보기', readOnlyHint: true, idempotentHint: true },
    처리: 검사하고(목록스키마, (_인자, 방) => {
      const 목 = 방.목록();
      return 잘됨(
        목.length ? `열린 문서 ${목.length}개: ${목.map((x) => x.doc_id).join(', ')}` : '열린 문서가 없다',
        { ok: true, count: 목.length, documents: 목 },
      );
    }),
  },

  {
    name: 'get_outline',
    description:
      '문서 뼈대를 본다 — 요소마다 **ID·종류·글 미리보기.** '
      + '**남의 문서를 다룰 때 여기서 시작한다.** 여기서 얻은 ID 로 get_content·compose 를 부른다. '
      + '읽기만 하므로 마음 놓고 불러도 된다.',
    inputSchema: 뼈대스키마,
    outputSchema: 묶음('문서 뼈대', {
      ok: 참거짓('됐나'),
      section: 정수('본 구역 번호'),
      total: 정수('그 구역의 요소 수'),
      items: 목록('요소들', 묶음('요소 하나', {
        id: 글자('요소 ID'),
        kind: 글자('paragraph · table · cell'),
        preview: 글자('글 미리보기'),
        rows: 정수('표일 때 줄 수'),
        cols: 정수('표일 때 칸 수'),
      })),
      truncated: 참거짓('한도에 걸려 잘렸나. true 면 limit 을 키워 다시 불러라'),
    }, ['ok', 'items', 'truncated']),
    annotations: { title: '문서 뼈대 보기', readOnlyHint: true, idempotentHint: true },
    처리: 검사하고<{ doc_id: string; section?: number; limit?: number; in_tables?: boolean }>(뼈대스키마, (인자, 방) => {
      const 것 = 문서꺼내기(방, 인자.doc_id);
      if (!것.ok) return 것.결과;
      const d = 것.it.d;
      const 번호 = 인자.section ?? 0;
      const s = d.구역들[번호];
      if (!s) {
        return 못함(
          `${번호}번 구역이 없다`,
          `이 문서에는 구역이 ${d.구역들.length}개 있다 (0~${d.구역들.length - 1}).`,
        );
      }

      const 한도 = 인자.limit ?? 200;
      const 것들: Record<string, unknown>[] = [];
      for (const p of s.문단들) {
        // 표가 든 문단은 표로 적는다 — 그게 모델이 찾는 것이다
        const 표들 = childrenNamed(p.el, 'hp:run').flatMap((r) => childrenNamed(r, 'hp:tbl'));
        if (표들.length) {
          for (const t of 표들) {
            const tt = new 표(t);
            것들.push({
              id: d.이름표.아이디(t), kind: 'table',
              preview: 미리보기(tt.셀들.slice(0, 4).map((c) => 셀글(c.el)).join(' | ')),
              rows: tt.줄수, cols: tt.칸수,
            });
          }
          continue;
        }
        const 글 = p.글.trim();
        것들.push({ id: d.이름표.아이디(p.el), kind: 'paragraph', preview: 미리보기(글) });
      }

      // 표 안까지 본다. 양식은 글이 거의 다 셀에 있다.
      //
      // **셀 안에 든 표까지 내려간다.** 학교 가정통신문의 회신서가 그 꼴이다 —
      // 바깥 표(2x3) 의 한 칸에 회신서(3x7) 가 들어 있다.
      // 안 내려가면 그 표를 가리킬 길이 없어, 줄을 넣으려다 **바깥 표**에 넣는다.
      // 실제로 그래서 1쪽짜리가 3쪽이 됐다.
      if (인자.in_tables) {
        const 볼표 = 것들.filter((x) => x['kind'] === 'table').map((x) => x['id'] as string);
        while (볼표.length > 0) {
          const 표아이디 = 볼표.shift()!;
          const 찾은것 = d.찾기(표아이디);
          if (!찾은것.ok || 찾은것.value.갈래 !== '표') continue;
          const tt = 찾은것.value.표;
          for (let y = 0; y < tt.줄수; y++) {
            for (let x = 0; x < tt.칸수; x++) {
              // 합쳐진 칸은 시작 자리에서만 낸다 — 같은 셀을 여러 번 내면 헷갈린다
              const 셀 = tt.시작셀(y, x);
              if (!셀) continue;

              // 이 칸 안에 표가 또 있나
              for (const 안표 of findAll(셀.subList, 'hp:tbl')) {
                const 안것 = new 표(안표);
                const 안아이디 = d.이름표.아이디(안표);
                것들.push({
                  id: 안아이디, kind: 'table',
                  preview: 미리보기(안것.셀들.slice(0, 4).map((c) => 셀글(c.el)).join(' | ')),
                  rows: 안것.줄수, cols: 안것.칸수, in_cell: d.셀아이디(표아이디, y, x),
                });
                볼표.push(안아이디);
              }

              const 글 = 셀글(셀.el).trim();
              if (!글) continue;   // 빈 칸은 뼈대를 어지럽힌다. 채울 자리는 find 로 찾는다
              것들.push({
                id: d.셀아이디(표아이디, y, x), kind: 'cell',
                preview: 미리보기(글), row: y, col: x,
              });
            }
          }
        }
      }

      const 자른것 = 것들.slice(0, 한도);
      // `find` 와 같은 흠이 여기에도 있었다 — 잘린 것을 사람 말로만 알려 주면
      // 아무도 안 본다. **답에 담아야 안다.**
      const 잘림 = 것들.length > 자른것.length;
      return 잘됨(
        `${번호}번 구역에 요소 ${것들.length}개`
        + (잘림 ? ` — **앞 ${자른것.length}개만 준다. limit 을 키워 다시 불러라.**` : ''),
        { ok: true, section: 번호, total: 것들.length, items: 자른것, truncated: 잘림 },
      );
    }),
  },

  {
    name: 'get_content',
    description:
      '요소 하나의 내용을 자세히 본다 — 글·서식·표라면 칸별 값까지. '
      + '**고치기 전에 지금 무엇이 들었는지 확인할 때** 쓴다. ID 는 get_outline 이나 find 가 준 값. '
      + 'id 를 안 주면 **문서 전체 글**을 처음부터 끝까지 낸다.',
    inputSchema: 내용스키마,
    outputSchema: 묶음('요소 내용', {
      ok: 참거짓('됐나'),
      // **id 는 늘 낸다.** 필수라고 적어 놓고 안 내면 엄격한 클라이언트가 답을 거절한다.
      // 전체를 본 때는 doc_id 를 낸다 — 무엇을 읽은 것인지는 그때도 있어야 한다.
      id: 글자('요소 ID. 전체를 봤으면 doc_id'),
      kind: 글자('paragraph · table · cell · document'),
      text: 글자('글'),
      rows: 정수('표일 때 줄 수'),
      cols: 정수('표일 때 칸 수'),
      // **칸마다 id 를 같이 준다.** 글만 주면 그 칸을 가리킬 길이 없어,
      // 줄을 넣은 뒤 새 칸을 채우려면 뼈대를 통째로 다시 받아야 했다.
      cells: 목록('표일 때 칸들 (줄 순서로)', 묶음('칸 하나', {
        id: 글자('칸 ID. 이걸로 edit 을 부른다'),
        text: 글자('칸 글'),
        row: 정수('몇 째 줄 (0부터)'),
        col: 정수('몇 째 칸 (0부터)'),
        // **합침을 드러낸다.** 안 드러내면 덮인 자리가 딴 칸처럼 보이고,
        // 같은 글이 두 번 나와 **모델이 두 칸인 줄 안다.**
        // 거기 글을 쓰면 「이미 같은 글이라 바뀐 것이 없다」 는 알 수 없는 말이 났다.
        rowspan: 정수('세로로 몇 줄을 덮나. 1 이면 안 합친 것'),
        colspan: 정수('가로로 몇 칸을 덮나. 1 이면 안 합친 것'),
        covered_by: 글자('**덮인 자리**일 때 — 이 자리를 덮는 칸의 ID. 여긴 글을 못 쓴다'),
      })),
      empty: 참거짓('표일 때 — 칸이 다 비었나'),
      // 칸일 때만. **문단마다 ID 를 준다** — 줄마다 따로 채우려면 이게 있어야 한다.
      paragraphs: 목록('칸일 때 — 그 안의 문단들 (줄 차례로)', 묶음('문단 하나', {
        id: 글자('문단 ID'),
        text: 글자('그 줄의 글'),
      })),
    }, ['ok', 'id', 'kind']),
    annotations: { title: '요소 내용 보기', readOnlyHint: true, idempotentHint: true },
    처리: 검사하고<{ doc_id: string; id?: string }>(내용스키마, (인자, 방) => {
      const 것 = 문서꺼내기(방, 인자.doc_id);
      if (!것.ok) return 것.결과;

      // id 가 없다 = 문서를 통째로 읽겠다는 뜻.
      if (인자.id === undefined) {
        const 온글 = 것.it.d.구역들
          .flatMap((s) => s.모든문단들.map((p) => p.글))
          .join('\n');
        return 잘됨(`문서 전체 글 (${온글.length}자)`,
          { ok: true, id: 인자.doc_id, kind: 'document', text: 온글 });
      }

      const r = 것.it.d.찾기(인자.id);
      if (!r.ok) return 못함(r.이유, r.어떻게);

      if (r.value.갈래 === '문단') {
        return 잘됨(`${인자.id}: «${미리보기(r.value.문단.글)}»`,
          { ok: true, id: 인자.id, kind: 'paragraph', text: r.value.문단.글 });
      }
      if (r.value.갈래 === '셀') {
        // **한 칸에 문단이 여럿일 수 있다.** 이어 붙여서만 주면
        // "첫 줄 글둘째 줄 글" 이 되어 두 줄인 줄도 모른다.
        // 실제 계획서 양식에 그런 칸이 4개 있었다.
        const 문단들 = 것.it.d.칸문단들(인자.id);
        const 줄들 = 문단들.ok
          ? 문단들.value.map((p) => ({ id: 것.it.d.이름표.아이디(p.el), text: p.글 }))
          : [];
        const 글 = 줄들.map((x) => x.text).join('\n');
        return 잘됨(
          `${인자.id}: «${미리보기(글)}»`
          + (줄들.length > 1 ? ` (문단 ${줄들.length}개)` : ''),
          { ok: true, id: 인자.id, kind: 'cell', text: 글, paragraphs: 줄들 });
      }
      const t = r.value.표;
      const 칸들: Record<string, unknown>[] = [];
      for (let y = 0; y < t.줄수; y++) {
        for (let x = 0; x < t.칸수; x++) {
          const 아이디 = 것.it.d.셀아이디(인자.id, y, x);
          // **여기서 시작하는 칸인가, 남에게 덮인 자리인가.**
          // 덮인 자리에 덮는 칸의 글을 그대로 넣으면 같은 글이 두 번 나오고,
          // 모델은 두 칸인 줄 안다. 실제로 그래서 「이미 같은 글이라」 가 났다.
          const 시작 = t.시작셀(y, x);
          if (!시작) {
            const 덮는것 = t.셀(y, x);
            const a = 덮는것?.자리;
            칸들.push({
              id: 아이디, text: '', row: y, col: x,
              ...(a ? { covered_by: 것.it.d.셀아이디(인자.id, a.row, a.col) } : {}),
            });
            continue;
          }
          const 자리 = 시작.자리;
          칸들.push({
            id: 아이디, text: 칸줄글(시작.el), row: y, col: x,
            ...(자리.rowSpan > 1 ? { rowspan: 자리.rowSpan } : {}),
            ...(자리.colSpan > 1 ? { colspan: 자리.colSpan } : {}),
          });
        }
      }
      const 다빔 = 칸들.every((c) => String(c['text'] ?? '').trim() === '');
      return 잘됨(
        `${인자.id}: ${t.줄수}줄 ${t.칸수}칸 표${다빔 ? ' (다 비었다)' : ''}`,
        {
          ok: true, id: 인자.id, kind: 'table',
          rows: t.줄수, cols: t.칸수, cells: 칸들, empty: 다빔,
        });
    }),
  },

  {
    name: 'find',
    description:
      '글이나 종류로 요소를 찾아 **ID 목록**을 준다. '
      + '**양식을 채울 때** 쓴다 — 바꿀 자리의 글을 넣어 부르면 그 자리 ID 가 나온다. '
      + 'text 를 안 주고 kind 만 주면 그 종류를 전부 **문서 차례대로** 준다. '
      + '**빈 자리를 찾을 때는 이 길을 쓴다** — kind:"paragraph" 로 훑어 preview 가 빈 것이 '
      + '채울 자리다. 빈 문단은 글이 없으니 text 로는 못 찾는다 (인사말 자리가 그런 꼴이다). '
      + '**잘렸으면 truncated 가 true 다 — 그러면 limit 을 키워 다시 불러라.** '
      + '잘린 채로 채우면 뒷절을 통째로 빼먹는다.',
    inputSchema: 찾기스키마,
    outputSchema: 묶음('찾은 것', {
      ok: 참거짓('됐나'),
      count: 정수('몇 개'),
      matches: 목록('찾은 것들', 묶음('하나', {
        id: 글자('요소 ID'),
        kind: 글자('paragraph · table · cell'),
        preview: 글자('글 미리보기'),
        // 표일 때만 붙는다. **빈 표를 고르려면 이게 있어야 한다** —
        // preview 만 보고는 '칸이 다 비었다' 와 '글이 짧다' 를 못 가른다.
        rows: 정수('표일 때 — 줄 수'),
        cols: 정수('표일 때 — 칸 수'),
        empty: 참거짓('표일 때 — 칸이 다 비었나'),
        in_cell: 글자('칸 안에 든 문단일 때 — 그 칸 ID'),
      })),
      // **잘렸다는 것을 답에 담는다.** count 와 matches.length 를 견주라고
      // 맡겨 두면 아무도 안 견준다 — 그러면 못 본 것을 못 봤는지도 모른다.
      truncated: 참거짓('한도에 걸려 잘렸나. true 면 limit 을 키워 다시 불러라'),
    }, ['ok', 'count', 'truncated']),
    annotations: { title: '요소 찾기', readOnlyHint: true, idempotentHint: true },
    처리: 검사하고<{ doc_id: string; text?: string; kind?: string; limit?: number }>(찾기스키마, (인자, 방) => {
      const 것 = 문서꺼내기(방, 인자.doc_id);
      if (!것.ok) return 것.결과;
      if (인자.text === undefined && 인자.kind === undefined) {
        return 못함(
          '무엇을 찾을지 안 줬다',
          'text(찾을 글) 나 kind(paragraph · table · cell) 가운데 하나는 줘야 한다.',
        );
      }
      const d = 것.it.d;
      // 훑기(kind 만)는 본디 전수다. 50 으로 자르면 뒷절이 통째로 안 보인다 —
      // 계획서 84문단 가운데 「4. 예산사용계획」이 51번째 뒤에 있었다.
      const 한도 = 인자.limit ?? (인자.text === undefined ? 500 : 50);
      const 나온것: Record<string, unknown>[] = [];

      for (const s of d.구역들) {
        if (인자.kind === undefined || 인자.kind === 'paragraph') {
          // **빈 문단은 낱말로 못 찾는다.** 인사말 자리가 빈 문단이면
          // `find(text:…)` 로는 채울 자리가 있는 줄도 모르고 지나간다.
          // 그래서 `kind:"paragraph"` 로 훑어 `preview` 가 빈 것을 고르게 되는데,
          // 그때 **그게 어느 칸 안인지**를 알아야 곧바로 집는다.
          // 표에는 이미 `in_cell` 이 붙는다 — 문단에도 붙인다.
          const 칸속: Map<ElementNode, string> = new Map();
          for (const t of s.표들) {
            const tt = new 표(t);
            const 표아이디 = d.이름표.아이디(t);
            for (let y = 0; y < tt.줄수; y++) {
              for (let x = 0; x < tt.칸수; x++) {
                const 셀 = tt.시작셀(y, x);
                if (!셀) continue;
                const 칸아이디 = d.셀아이디(표아이디, y, x);
                // 표들은 문서 차례라 **안쪽 표가 뒤에 온다.** 덮어쓰면 가장 안쪽 칸이 남는다.
                for (const q of findAll(셀.subList, 'hp:p')) 칸속.set(q, 칸아이디);
              }
            }
          }
          for (const p of s.모든문단들) {
            if (인자.text !== undefined && !p.글.includes(인자.text)) continue;
            const 칸 = 칸속.get(p.el);
            나온것.push({
              id: d.이름표.아이디(p.el), kind: 'paragraph', preview: 미리보기(p.글),
              ...(칸 !== undefined ? { in_cell: 칸 } : {}),
            });
          }
        }
        if (인자.kind === undefined || 인자.kind === 'table' || 인자.kind === 'cell') {
          for (const t of s.표들) {
            const tt = new 표(t);
            const 표아이디 = d.이름표.아이디(t);
            if (인자.kind !== 'cell') {
              const 온글 = tt.셀들.map((c) => 셀글(c.el)).join(' ');
              if (인자.text === undefined || 온글.includes(인자.text)) {
                나온것.push({
                  id: 표아이디, kind: 'table', preview: 미리보기(온글),
                  rows: tt.줄수, cols: tt.칸수, empty: 온글.trim() === '',
                });
              }
            }
            if (인자.kind === 'cell' || (인자.text !== undefined && 인자.kind === undefined)) {
              for (let y = 0; y < tt.줄수; y++) {
                for (let x = 0; x < tt.칸수; x++) {
                  // **덮인 자리는 안 낸다.** 합친 칸 아래 자리를 따로 내면
                  // 같은 글이 두 번 나오고, 그 ID 로는 아무것도 못 한다.
                  const 시작 = tt.시작셀(y, x);
                  if (!시작) continue;
                  const 글 = 셀글(시작.el);
                  if (인자.text !== undefined && !글.includes(인자.text)) continue;
                  나온것.push({ id: d.셀아이디(표아이디, y, x), kind: 'cell', preview: 미리보기(글) });
                }
              }
            }
          }
        }
      }

      const 자른것 = 나온것.slice(0, 한도);
      if (나온것.length === 0) {
        return 못함(
          인자.text !== undefined ? `'${인자.text}' 가 든 것을 못 찾았다` : `${인자.kind} 를 못 찾았다`,
          'get_outline 으로 문서에 무엇이 있는지 먼저 보라. 띄어쓰기까지 똑같아야 찾는다.',
        );
      }
      const 잘림 = 나온것.length > 자른것.length;
      return 잘됨(
        `${나온것.length}개 찾았다`
        + (잘림 ? ` — **앞 ${자른것.length}개만 준다. limit 을 키워 다시 불러라.**` : ''),
        { ok: true, count: 나온것.length, matches: 자른것, truncated: 잘림 },
      );
    }),
  },

  {
    name: 'get_styles',
    description:
      '문서에 정의된 서식을 본다 — 글꼴 · 글자 모양 · 문단 모양 · 테두리 수. '
      + '**남의 문서 서식에 맞춰 쓰고 싶을 때** 부른다. 어떤 글꼴을 쓰는지 알면 compose 에 그대로 넘길 수 있다.',
    inputSchema: 서식스키마,
    outputSchema: 묶음('문서 서식', {
      ok: 참거짓('됐나'),
      fonts: 목록('한글 글꼴 이름들', 글자('글꼴 이름')),
      char_shapes: 정수('글자 모양 수'),
      para_shapes: 정수('문단 모양 수'),
      border_fills: 정수('테두리·배경 수'),
      sizes_pt: 목록('쓰이는 글자 크기 (pt)', 숫자('크기')),
    }, ['ok']),
    annotations: { title: '문서 서식 보기', readOnlyHint: true, idempotentHint: true },
    처리: 검사하고<{ doc_id: string }>(서식스키마, (인자, 방) => {
      const 것 = 문서꺼내기(방, 인자.doc_id);
      if (!것.ok) return 것.결과;
      const 머리 = parseXml(것.it.d.머리.toXml()).root;

      const 글꼴들: string[] = [];
      const ff = findAll(머리, 'hh:fontface').find((f) => getAttr(f, 'lang') === 'HANGUL');
      if (ff) for (const f of childrenNamed(ff, 'hh:font')) {
        const 이름 = getAttr(f, 'face');
        if (이름) 글꼴들.push(이름);
      }

      const 글자모양 = findAll(머리, 'hh:charPr');
      const 크기들 = [...new Set(글자모양.map((c) => Number(getAttr(c, 'height') ?? 0) / 100))]
        .filter((x) => x > 0).sort((a, b) => a - b);

      return 잘됨(
        `글꼴 ${글꼴들.length}벌 · 글자모양 ${글자모양.length}개 · 문단모양 ${findAll(머리, 'hh:paraPr').length}개`,
        {
          ok: true,
          fonts: 글꼴들,
          char_shapes: 글자모양.length,
          para_shapes: findAll(머리, 'hh:paraPr').length,
          border_fills: findAll(머리, 'hh:borderFill').length,
          sizes_pt: 크기들,
        },
      );
    }),
  },

  {
    name: 'compose',
    description:
      '블록 목록으로 **맨바닥에서** 문서를 한 번에 쓴다. 제목·띠·개조식·상자·표·본문·주석·쪽나눔을 '
      + '순서대로 앉힌다. 문단을 하나씩 넣으면 호출이 수십 번이 되고 '
      + '중간에 하나 틀리면 문서가 반만 된다. '
      // 실측: 한 엔진이 열어 둔 양식을 놔두고 이걸로 새 문서를 지어 딴 폴더에 저장했다.
      // 「새로 쓸 때는 이걸 쓴다」 만 적혀 있으면 모델이 그리로 간다.
      + '**채울 양식이 이미 열려 있으면 쓰지 마라** — 그때는 edit 으로 그 문서를 채운다. '
      + '여기서 새로 지으면 양식의 표·서식·머리말이 다 없는 딴 문서가 나온다. '
      + '글 안에 `**굵게**` `[[강조]]` 를 섞어 쓸 수 있어 어구마다 서식을 따로 부르지 않아도 된다. '
      + '만든 것의 ID 를 전부 돌려주므로 뒤에 손볼 수 있다.',
    inputSchema: 조판스키마,
    outputSchema: 묶음('조판 결과', {
      ok: 참거짓('됐나'),
      blocks: 정수('쓴 블록 수'),
      elements: 정수('만든 요소 수'),
      created: 목록('만든 것들', 묶음('블록 하나', {
        kind: 글자('블록 종류'),
        ids: 목록('만든 요소 ID 들', 글자('ID')),
      })),
    }, ['ok', 'blocks']),
    annotations: { title: '문서 조판', idempotentHint: false },
    // 블록 목록은 본질적으로 배열이라 깊어진다: $ → blocks → blocks[] → items → items[]
    중첩예외: {
      // 실제로 재 보면 6단계다: $ → blocks → blocks[] → rows → rows[] → rows[][]
      // 짐작으로 5라고 적었다가 린터에 걸렸다. 예외는 **실제 값**으로 적는다.
      최대: 6,
      왜: 'compose 의 블록 목록은 본질적으로 배열이다. 이걸 평평하게 펴면 '
        + '도구를 열 개로 쪼개야 하고, 그러면 호출 횟수를 줄이려던 목적이 사라진다.',
    },
    처리: 검사하고<{
      doc_id: string; blocks: 블록[];
      body_font?: string; title_font?: string; highlight_color?: string;
      line_spacing?: number; letter_spacing?: number;
      margin_left?: number; margin_right?: number; margin_top?: number; margin_bottom?: number;
      margin_header?: number; margin_footer?: number;
      header_text?: string; footer_text?: string;
      page_number?: 'bottom-center' | 'bottom-left' | 'bottom-right';
    }>(조판스키마, (인자, 방) => {
      const 것 = 문서꺼내기(방, 인자.doc_id);
      if (!것.ok) return 것.결과;
      if (것.it.읽기만) {
        return 못함('읽기만 하려고 연 문서다', 'read_only 없이 다시 열어라.');
      }

      const 여백 = {
        ...(인자.margin_left !== undefined ? { margin_left: 인자.margin_left } : {}),
        ...(인자.margin_right !== undefined ? { margin_right: 인자.margin_right } : {}),
        ...(인자.margin_top !== undefined ? { margin_top: 인자.margin_top } : {}),
        ...(인자.margin_bottom !== undefined ? { margin_bottom: 인자.margin_bottom } : {}),
        ...(인자.margin_header !== undefined ? { margin_header: 인자.margin_header } : {}),
        ...(인자.margin_footer !== undefined ? { margin_footer: 인자.margin_footer } : {}),
      };

      const r = 조판(것.it.d, 인자.blocks, {
        ...(인자.body_font !== undefined ? { body_font: 인자.body_font } : {}),
        ...(인자.title_font !== undefined ? { title_font: 인자.title_font } : {}),
        ...(인자.highlight_color !== undefined ? { highlight_color: 인자.highlight_color } : {}),
        ...(인자.line_spacing !== undefined ? { line_spacing: 인자.line_spacing } : {}),
        ...(인자.letter_spacing !== undefined ? { letter_spacing: 인자.letter_spacing } : {}),
        ...(Object.keys(여백).length ? { page: 여백 } : {}),
        // 머리말·꼬리말 **글**은 여백이 아니다 — 조판 설정 맨 위에서 찾는다
        ...(인자.header_text !== undefined ? { header_text: 인자.header_text } : {}),
        ...(인자.footer_text !== undefined ? { footer_text: 인자.footer_text } : {}),
        ...(인자.page_number !== undefined ? { page_number: 인자.page_number } : {}),
      });
      if (!r.ok) return 못함(r.이유, r.어떻게);

      const 만든것 = r.value.만든것.map((m) => ({ kind: m.kind, ids: m.ids }));
      return 잘됨(
        `블록 ${인자.blocks.length}개로 요소 ${r.value.문단수}개를 썼다`,
        { ok: true, blocks: 인자.blocks.length, elements: r.value.문단수, created: 만든것 },
      );
    }),
  },

  {
    name: 'edit',
    description:
      '**열어 놓은 문서를 고친다.** 양식을 채울 때 쓰는 도구다. '
      + '`find` 나 `get_outline` 이 준 ID(`p_…` `tbl_…` `cell_…`)로 가리킨다. '
      + '**여러 개를 한 번에 준다** — 한 칸씩 여러 번 부르면 그 사이에 줄이 밀린다. '
      + '글을 갈아도 **서식은 그대로 남는다** (글자 칸만 갈고 런은 안 건드린다). '
      + '`delete_row` 는 **빈 줄만** 지운다 — 양식에 남는 줄을 걷어낼 때 쓴다. '
      + '글이 든 줄을 지우려면 force 를 켜야 하고, **지운 글은 못 되돌린다.** '
      + '**중간에 하나가 어긋나면 거기서 멈추되 앞의 것은 안 물린다** — '
      + '답의 done 이 몇 개가 이미 들어갔는지 알려 준다. 다시 넣지 말고 그 뒤부터 이어서 해라.',
    inputSchema: 고치기스키마,
    outputSchema: 묶음('고친 것', {
      ok: 참거짓('됐나'),
      done: 정수('해낸 것 수'),
      results: 목록('하나씩', 묶음('결과', {
        op: 글자('무엇을 했나'),
        id: 글자('무엇을'),
        changed: 정수('몇 개가 바뀌었나'),
      })),
    }, ['ok', 'done']),
    annotations: { title: '문서 고치기', idempotentHint: false },
    // 고칠 것 목록은 본질적으로 배열이다: $ → edits → edits[] → op
    중첩예외: {
      // 실제로 재 보면 4단계다. 짐작으로 적지 않는다.
      최대: 4,
      왜: '고치는 일을 묶어서 받는 것이 이 도구의 뜻이다. 평평하게 펴려면 '
        + '`update_table_cell` `batch_fill_table` `replace_text` `insert_table_row` … '
        + '열한 개로 쪼개야 하고, 그러면 tools/list 가 먼저 컨텍스트를 먹는다. '
        + '한 칸씩 여러 번 부르면 그 사이에 줄이 밀리는 문제도 실제로 있었다.',
    },
    처리: 검사하고<{ doc_id: string; edits: 고침[] }>(고치기스키마, (인자, 방) => {
      const 것 = 문서꺼내기(방, 인자.doc_id);
      if (!것.ok) return 것.결과;
      if (것.it.읽기만) {
        return 못함('읽기만 하려고 연 문서다', 'read_only 없이 다시 열어라.');
      }
      if (인자.edits.length === 0) {
        return 못함('고칠 것이 하나도 없다', 'edits 에 적어도 하나를 적어라.');
      }

      const d = 것.it.d;
      d.ID매기기();
      const 낸것: Record<string, unknown>[] = [];

      for (const [i, e] of 인자.edits.entries()) {
        const r = 고침하나(d, e);
        if (!r.ok) {
          // **중간에 멈추면 어디까지 됐는지 말한다.** 반쯤 하고 됐다고 하면 안 된다.
          //
          // **앞의 것은 안 물린다(rollback 이 아니다).** 그대로 문서에 남는다.
          // 이걸 말로만 적어 뒀더니 부르는 쪽이 거꾸로 읽고 **다시 넣어 두 번 쓸** 뻔했다.
          // 그래서 답에 수로도 담는다 — 글을 파싱하지 않아도 알 수 있게.
          return 못함(
            `${i}번째 고침(${e.op})에서 멈췄다: ${r.이유}`,
            `${i}번째 앞의 ${i}개는 **이미 문서에 들어갔다** (안 물린다). `
            + `다시 넣지 말고 ${i}번째부터 이어서 해라. ${r.어떻게}`,
            { done: i, failed_at: i, failed_op: e.op, results: 낸것 },
          );
        }
        낸것.push({ op: e.op, id: e.id ?? '', changed: r.value });
      }

      const 합 = 낸것.reduce((a, x) => a + (x['changed'] as number), 0);
      return 잘됨(
        `${인자.edits.length}가지를 고쳐 ${합}곳이 바뀌었다`,
        { ok: true, done: 인자.edits.length, results: 낸것 },
      );
    }),
  },
];

/** 고침 하나의 꼴 */
interface 고침 {
  op: 'set_text' | 'replace' | 'set_style' | 'insert_row' | 'delete_row' | 'insert_image';
  id?: string;
  text?: string;
  find?: string;
  replace?: string;
  limit?: number;
  bold?: boolean; italic?: boolean; underline?: boolean;
  size?: number; color?: string; font?: string; align?: string;
  at?: number; count?: number; force?: boolean;
  path?: string; width?: number; height?: number;
}

/**
 * 고침 하나를 한다. **몇 곳이 바뀌었는지** 돌려준다.
 *
 * 0 을 돌려주는 것과 실패하는 것은 다르다 — 0 은 "찾았는데 이미 그랬다" 이고,
 * 실패는 "못 찾았거나 못 한다" 이다. 둘을 섞으면 조용한 실패가 된다.
 */
function 고침하나(d: 문서, e: 고침): 결과<number> {
  switch (e.op) {
    case 'set_text': {
      if (!e.id) return 안됨('set_text 에 id 가 없다', 'find 나 get_outline 이 준 ID 를 줘라.');
      if (e.text === undefined) return 안됨('set_text 에 text 가 없다', '넣을 글을 적어라.');
      // **칸이면 칸 전체를 간다.** 칸 안에 문단이 둘일 수 있는데,
      // 첫 문단만 갈고 "1곳이 바뀌었다" 고 말하면 옛 글이 뒤에 남는다.
      const r = e.id.startsWith('cell_') ? d.칸글바꾸기(e.id, e.text) : d.글바꾸기(e.id, e.text);
      if (!r.ok) return r;
      return 됨(r.value.바뀐수);
    }

    case 'replace': {
      if (!e.find) return 안됨('replace 에 find 가 없다', '찾을 글을 적어라.');
      if (e.replace === undefined) return 안됨('replace 에 replace 가 없다', '바꿀 글을 적어라.');
      const 한도 = e.limit ?? Number.MAX_SAFE_INTEGER;
      let 바꾼수 = 0;

      // id 를 주면 그 안에서만, 안 주면 문서 전체에서
      const 볼것 = e.id
        ? 한곳의문단들(d, e.id)
        : 됨(d.구역들.flatMap((s) => s.모든문단들));
      if (!볼것.ok) return 볼것;

      // **글자 칸 안에서** 바꾼다 — 문단을 통째로 갈면 런이 합쳐져 서식이 날아간다.
      // 문장 가운데 굵은 낱말이 있는 문서에서 실제로 그랬다.
      let 칸을넘는것 = 0;
      for (const p of 볼것.value) {
        if (바꾼수 >= 한도) break;
        const r = p.어구바꾸기(e.find, e.replace, 한도 - 바꾼수);
        if (!r.ok) return r;
        바꾼수 += r.value.바뀐수;
        if (r.value.못찾음) 칸을넘는것++;
      }
      if (바꾼수 === 0) {
        if (칸을넘는것 > 0) {
          // **찾은 척하고 서식을 부수지 않는다.** 무엇을 하면 되는지까지 말한다.
          return 안됨(
            `'${e.find}' 가 ${칸을넘는것}곳에 있지만 **글자 칸 경계를 넘는다** `
            + '(가운데 낱말만 굵은 줄 같은 것)',
            'set_text 로 그 문단·셀을 통째로 다시 써라. '
            + '여기서 바꾸면 런이 합쳐져 굵기·색이 날아간다.',
          );
        }
        return 안됨(
          `'${e.find}' 를 찾지 못했다`,
          'find 도구로 먼저 있는지 보라. 띄어쓰기까지 똑같아야 한다.',
        );
      }
      return 됨(바꾼수);
    }

    case 'set_style': {
      if (!e.id) return 안됨('set_style 에 id 가 없다', 'find 나 get_outline 이 준 ID 를 줘라.');
      let 바꾼수 = 0;
      const 글자패치 = {
        ...(e.bold !== undefined ? { 굵게: e.bold } : {}),
        ...(e.italic !== undefined ? { 기울임: e.italic } : {}),
        ...(e.underline !== undefined ? { 밑줄: e.underline ? 'BOTTOM' : 'NONE' } : {}),
        ...(e.size !== undefined ? { 크기: pt(e.size) } : {}),
        ...(e.color !== undefined ? { 색: e.color } : {}),
        ...(e.font !== undefined ? { 글꼴: e.font } : {}),
      };
      if (Object.keys(글자패치).length > 0) {
        const r = d.글자서식주기(e.id, 글자패치);
        if (!r.ok) return r;
        바꾼수 += r.value.바뀐수;
      }
      if (e.align !== undefined) {
        const 맞춘것 = 정렬맞추기(e.align);
        if (!맞춘것) {
          return 안됨(`모르는 정렬: ${e.align}`, 'left · center · right · justify 가운데 하나여야 한다.');
        }
        const r = d.문단서식주기(e.id, { 정렬: 맞춘것 });
        if (!r.ok) return r;
        바꾼수++;
      }
      if (바꾼수 === 0) {
        return 안됨('바꿀 서식을 하나도 안 줬다', 'bold · size · color · align 가운데 하나는 줘라.');
      }
      return 됨(바꾼수);
    }

    case 'insert_row': {
      if (!e.id) return 안됨('insert_row 에 id 가 없다', 'get_outline 이 준 표 ID(tbl_…)를 줘라.');
      const r = d.찾기(e.id);
      if (!r.ok) return r;
      if (r.value.갈래 !== '표') {
        return 안됨(`${e.id} 는 표가 아니다 (${r.value.갈래})`, 'tbl_ 로 시작하는 ID 를 줘라.');
      }
      // 표에 source 를 물려준다 — 없으면 복제본이 빈 채로 나온다
      const t = new 표(r.value.표.el, r.value.구역.source);
      const 넣기 = t.줄넣기(e.at ?? t.줄수, e.count ?? 1);
      if (!넣기.ok) return 넣기;
      if (t.탈만.length) {
        return 안됨(
          `줄을 넣었더니 표가 어긋났다: ${t.탈만[0]}`,
          '이건 우리 잘못이다. 되돌리고 다시 열어라.',
        );
      }
      return 됨(넣기.value.넣은수);
    }

    case 'delete_row': {
      if (!e.id) return 안됨('delete_row 에 id 가 없다', 'get_outline 이 준 표 ID(tbl_…)를 줘라.');
      // **자리를 꼭 받는다.** insert_row 는 안 주면 맨 뒤에 붙이지만,
      // 지우기에서 그런 기본값을 두면 **엉뚱한 줄을 말없이 지운다.**
      if (e.at === undefined) {
        return 안됨(
          'delete_row 에 at 이 없다',
          '몇 번째 줄부터 지울지 꼭 줘라 (0부터). '
          + 'get_content(id: 표ID) 로 줄·칸을 먼저 보라.',
        );
      }
      const r = d.찾기(e.id);
      if (!r.ok) return r;
      if (r.value.갈래 !== '표') {
        return 안됨(`${e.id} 는 표가 아니다 (${r.value.갈래})`, 'tbl_ 로 시작하는 ID 를 줘라.');
      }
      const t = new 표(r.value.표.el, r.value.구역.source);
      const 지우기 = t.줄지우기(e.at, e.count ?? 1, e.force !== true);
      if (!지우기.ok) return 지우기;
      if (t.탈만.length) {
        return 안됨(
          `줄을 지웠더니 표가 어긋났다: ${t.탈만[0]}`,
          '이건 우리 잘못이다. 되돌리고 다시 열어라.',
        );
      }
      return 됨(지우기.value.지운수);
    }

    case 'insert_image': {
      if (!e.id) return 안됨('insert_image 에 id 가 없다', '그림을 넣을 셀·문단 ID 를 줘라.');
      if (!e.path) return 안됨('insert_image 에 path 가 없다', '그림 파일 절대 경로를 줘라.');
      const 절대 = 절대경로검사(e.path);
      if (!절대.ok) return 안됨(절대.이유, 절대.어떻게);
      if (!fs.existsSync(e.path)) {
        return 안됨(`${e.path} 파일이 없다`, '경로를 다시 보라.');
      }

      const 담을것 = 그림담을곳(d, e.id);
      if (!담을것.ok) return 담을것;

      let 바이트: Buffer;
      try { 바이트 = fs.readFileSync(e.path); }
      catch (x) { return 안됨(`${e.path} 를 못 읽었다: ${(x as Error).message}`, '읽을 수 있는 파일인지 보라.'); }

      const 들임 = 그림들이기(d.컨테이너, 바이트, path.basename(e.path));
      if (!들임.ok) return 들임;

      // 크기 — 안 주면 그림 크기대로. 하나만 주면 비율을 지킨다.
      const 본디 = { w: 들임.value.너비px * 75, h: 들임.value.높이px * 75 };   // 1px = 0.75pt = 75 HWPUNIT
      let 너비 = e.width !== undefined ? ptToHwp(pt(e.width)) : 본디.w;
      let 높이 = e.height !== undefined ? ptToHwp(pt(e.height)) : 본디.h;
      if (e.width !== undefined && e.height === undefined) 높이 = Math.round(너비 * (본디.h / 본디.w));
      if (e.height !== undefined && e.width === undefined) 너비 = Math.round(높이 * (본디.w / 본디.h));

      const pic = 뜨기(조각.그림);
      크기맞추기(pic, 너비, 높이, 들임.value.항목id);

      const 런 = 뜨기(조각.표런);
      appendChild(런, pic);
      appendChild(담을것.value, 런);
      return 됨(1);
    }

    default:
      return 안됨(
        `모르는 op: ${(e as { op?: string }).op}`,
        'set_text · replace · set_style · insert_row · insert_image 가운데 하나여야 한다.',
      );
  }
}

/**
 * 그림을 담을 문단을 고른다.
 *
 * 셀을 주면 **그 안 첫 문단**에, 문단을 주면 그 문단에 넣는다.
 * 표를 주면 거절한다 — 표 어디에 넣을지 모르기 때문이다.
 */
function 그림담을곳(d: 문서, id: string): 결과<ElementNode> {
  const r = d.찾기(id);
  if (!r.ok) return r;
  if (r.value.갈래 === '문단') return 됨(r.value.문단.el);
  if (r.value.갈래 === '셀') {
    const p = findAll(r.value.셀.subList, 'hp:p')[0];
    if (!p) return 안됨(`${id} 셀 안에 문단이 없다`, '깨진 셀이다.');
    return 됨(p);
  }
  return 안됨(
    `${id} 는 표다 — 표 어디에 넣을지 모른다`,
    '셀 ID(cell_…)를 줘라. find 가 셀 ID 를 준다.',
  );
}

/** id 가 가리키는 곳의 문단들 (표면 그 안의 셀 문단 다) */
function 한곳의문단들(d: 문서, id: string): 결과<문단[]> {
  const r = d.찾기(id);
  if (!r.ok) return r;
  if (r.value.갈래 === '문단') return 됨([r.value.문단]);
  if (r.value.갈래 === '셀') {
    return 됨(findAll(r.value.셀.subList, 'hp:p').map((p) => new 문단(p, r.value.구역.source)));
  }
  return 됨(findAll(r.value.표.el, 'hp:p').map((p) => new 문단(p, r.value.구역.source)));
}

// ── 거들기 ─────────────────────────────────────────────────────────────────

function 미리보기(글: string, 폭 = 60): string {
  const 한줄 = 글.replace(/\s+/g, ' ').trim();
  return 한줄.length > 폭 ? `${한줄.slice(0, 폭)}…` : 한줄;
}

function 셀글(el: unknown): string {
  if (!el) return '';
  return findAll(el as never, 'hp:t')
    .map((t) => (t.children[0] as { raw?: string } | undefined)?.raw ?? '')
    .join('');
}

/**
 * 칸 글을 **문단마다 줄을 갈라서** 준다.
 *
 * `셀글` 은 다 이어 붙인다 — 미리보기에는 그게 맞다.
 * 그런데 **값으로 줄 때 이어 붙이면 "첫 줄 글둘째 줄 글" 이 된다.**
 * 두 줄인 줄도 모르고, 그대로 다시 넣으면 한 줄이 된다.
 */
function 칸줄글(el: unknown): string {
  if (!el) return '';
  return findAll(el as never, 'hp:p')
    .map((p) => 셀글(p))
    .join('\n');
}
