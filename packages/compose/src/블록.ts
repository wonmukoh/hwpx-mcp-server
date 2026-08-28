/**
 * 블록 — 조판이 받는 것.
 *
 * ## 왜 블록인가
 *
 * 문단 하나 넣고 서식 주고, 또 하나 넣고 서식 주고… 를 되풀이하면
 * 도구 호출이 수십 번이 된다. 느리고 비싸고, 중간에 하나 틀리면 문서가 반만 된다.
 *
 * 그래서 **블록 목록을 한 번에 받아 한 번에 쓴다.**
 *
 * ## 위치 번호가 없다
 *
 * 블록은 **순서대로 앉는다.** `at: 12` 같은 것을 받지 않는다.
 * 번호로 자리를 잡으면 앞에 뭐가 하나 늘 때마다 어긋난다.
 * 뒤에 손볼 일이 있으면 조판이 돌려준 **ID** 로 가리킨다.
 *
 * ## 종류는 실제로 쓰이는 것만
 *
 * 정부 문서(교육부 업무계획·기본계획·보도자료)를 실제로 뜯어 보고 고른 것들이다.
 */

/** 글자 크기는 **pt 로만** 받는다. HWPUNIT 를 노출하면 모델이 틀린다 */
export type Pt수 = number;

export interface 제목블록 {
  kind: 'title';
  text: string;
  /** `2026. 3.` 처럼 */
  date?: string;
  /** `교 육 부` 처럼 */
  org?: string;
}

/** 배경색을 깐 한 줄. `Ⅰ. 추진 배경` 같은 큰 묶음 머리 */
export interface 띠블록 {
  kind: 'band';
  text: string;
  /** 배경색. 기본 남색 */
  background?: string;
  /** 글자색. 기본 흰색 */
  color?: string;
}

export interface 개조식항목 {
  /** 1부터. 깊어질수록 들여쓴다 */
  level: number;
  text: string;
  bold?: boolean;
}

/** 정부 문서의 뼈대. `□ ○ -` 로 내려가는 그것 */
export interface 개조식블록 {
  kind: 'outline';
  items: 개조식항목[];
  /** 이 어구들만 굵게. 줄마다 찾아서 건다 */
  emphasize?: string[];
}

/** 테두리 두른 상자. 요약·강조에 쓴다 */
export interface 상자블록 {
  kind: 'box';
  /** 상자 안 글. 여러 줄이면 줄마다 문단이 된다 */
  text?: string;
  /** `< 핵심 추진과제 >` 같은 머리. 있으면 굵게 가운데 */
  title?: string;
  items?: string[];
  /** 배경색 */
  background?: string;
}

export interface 표블록 {
  kind: 'table';
  /** 머리 줄. 주면 굵게·가운데·배경색이 붙는다 */
  headers?: string[];
  rows: string[][];
  /** 열 폭 (pt). 안 주면 고르게 나눈다 */
  widths?: Pt수[];
  /** 표 전체 폭 (pt). 안 주면 쪽 너비에 맞춘다 */
  width?: Pt수;
  /** 머리 줄을 쪽마다 되풀이할까. 기본 true */
  repeat_header?: boolean;
  /** 열마다 정렬 (`left` `center` `right`). 열 수만큼 준다 */
  col_align?: string[];
  /** 표 안 글자 크기 pt. 기본 10 */
  cell_size?: Pt수;
  /** 셀 안쪽 여백 pt. `hasMargin` 도 같이 켜진다 */
  cell_padding?: Pt수;
  /** 머리 줄 배경색 `#RRGGBB`. 기본 `#E8EEF7` */
  header_background?: string;
  /** 테두리 굵기 (예: `0.12 mm` `0.4 mm`). 기본 `0.12 mm` */
  border_width?: string;
  /**
   * 이 블록의 글꼴 이름 (예: `휴먼명조`).
   *
   * **줄 높이가 글꼴마다 다르다.** 같은 180% 라도 휴먼명조는 24pt,
   * 함초롬바탕은 27pt 로 그려진다 — 안 맞추면 쪽에 들어가는 줄 수가 달라져
   * 세로로 넘친다. 안 주면 `body_font`·`title_font` 를 따른다.
   */
  font?: string;
  /** 표를 쪽에서 어디에 놓을까 (`left` `center` `right`) */
  align?: string;
  /** 표 바깥 여백 pt */
  outer_margin?: Pt수;
  /**
   * 합칠 칸들. `{ row, col, rowspan, colspan }` 로 적는다.
   *
   * 실측: 문서 161편 가운데 **122편(76%)이 셀을 합친다.**
   * 정부 문서 표는 합침 없이는 못 만든다.
   */
  merges?: { row: number; col: number; rowspan?: number; colspan?: number }[];
  /** 표 위(또는 아래)에 붙일 설명. 실측 161편 가운데 8편(5%)이 쓴다 */
  caption?: string;
  /** 캡션 자리 (`top` `bottom` `left` `right`). 기본 `top` */
  caption_side?: string;
}

export interface 글블록 {
  kind: 'text';
  text: string;
  size?: Pt수;
  /** `left` `center` `right` `justify` */
  align?: string;
  bold?: boolean;
  color?: string;
  /** 이 블록의 글꼴 이름. 안 주면 `body_font` 를 따른다 */
  font?: string;
  /** 기울임 */
  italic?: boolean;
  /** 밑줄. `true` 면 아래에 긋는다. `BOTTOM` `CENTER` `TOP` 도 받는다 */
  underline?: boolean | string;
  /** 글자 배경(음영) 색 `#RRGGBB`. `none` 이면 없앤다 */
  shade?: string;
  /** 장평 — 글자 너비 백분율. 100 이 보통 */
  width_ratio?: number;
}

/**
 * 본문 문단. **정부 문서에서 가장 많이 쓰이는 것.**
 *
 * 실측 (교육부 2026 업무계획, paraPr 54):
 * 양쪽 정렬 · 위 여백 1000 · 줄간격 160% · 첫 줄은 **공백 두 칸**으로 들여쓴다
 * (`hc:intent` 가 아니라 글 앞 공백을 쓴다 — 41문단이 그랬다).
 *
 * `text` 에 `**굵게**` 와 `[[강조]]` 를 섞어 쓸 수 있다.
 */
export interface 본문블록 {
  kind: 'body';
  text: string;
  /** 첫 줄 들여쓰기. 기본 true */
  indent?: boolean;
  size?: Pt수;
  align?: string;
  /** 줄 간격 (%). 안 주면 설정값, 그것도 없으면 160 */
  line_spacing?: number;
  /** 자간 (%). 음수면 좁아진다 */
  letter_spacing?: number;
  /** 문단 위 여백 (pt) */
  space_before?: Pt수;
  /** 문단 아래 여백 (pt) */
  space_after?: Pt수;
  /** 왼쪽 여백 (pt). 개조식 단계마다 들여쓰는 그것 */
  indent_left?: Pt수;
  /**
   * 첫 줄 내어쓰기 (pt). **음수면 둘째 줄부터 들여간다.**
   *
   * 정부 문서의 `○ (참여 대상) …` 같은 줄이 이걸 쓴다 —
   * 없으면 둘째 줄이 왼쪽 끝까지 나가서 모양이 통째로 달라진다.
   */
  hanging?: Pt수;
  /**
   * 이 블록의 글꼴 이름 (예: `휴먼명조`).
   *
   * **줄 높이가 글꼴마다 다르다.** 같은 180% 라도 휴먼명조는 24pt,
   * 함초롬바탕은 27pt 로 그려진다 — 안 맞추면 쪽에 들어가는 줄 수가 달라져
   * 세로로 넘친다. 안 주면 `body_font`·`title_font` 를 따른다.
   */
  font?: string;
  /** 기울임 */
  italic?: boolean;
  /** 밑줄. `true` 면 아래에 긋는다. `BOTTOM` `CENTER` `TOP` 도 받는다 */
  underline?: boolean | string;
  /** 글자 배경(음영) 색 `#RRGGBB`. `none` 이면 없앤다 */
  shade?: string;
  /** 장평 — 글자 너비 백분율. 100 이 보통 */
  width_ratio?: number;
}

/**
 * 소제목. `(3) AI를 활용한 대학 진학상담 고도화` 같은 줄.
 *
 * 실측 (paraPr 70): 양쪽 정렬 · 위 여백 1400 · 14pt **굵게**.
 * 핵심어에 파란 색이 붙는다 — `[[…]]` 로 적는다.
 */
export interface 소제목블록 {
  kind: 'heading';
  text: string;
  size?: Pt수;
  align?: string;
  /** 줄 간격 (%). 안 주면 설정값, 그것도 없으면 160 */
  line_spacing?: number;
  /** 자간 (%). 음수면 좁아진다 */
  letter_spacing?: number;
  /** 문단 위 여백 (pt) */
  space_before?: Pt수;
  /** 문단 아래 여백 (pt) */
  space_after?: Pt수;
  /** 왼쪽 여백 (pt). 개조식 단계마다 들여쓰는 그것 */
  indent_left?: Pt수;
  /**
   * 첫 줄 내어쓰기 (pt). **음수면 둘째 줄부터 들여간다.**
   *
   * 정부 문서의 `○ (참여 대상) …` 같은 줄이 이걸 쓴다 —
   * 없으면 둘째 줄이 왼쪽 끝까지 나가서 모양이 통째로 달라진다.
   */
  hanging?: Pt수;
  /**
   * 이 블록의 글꼴 이름 (예: `휴먼명조`).
   *
   * **줄 높이가 글꼴마다 다르다.** 같은 180% 라도 휴먼명조는 24pt,
   * 함초롬바탕은 27pt 로 그려진다 — 안 맞추면 쪽에 들어가는 줄 수가 달라져
   * 세로로 넘친다. 안 주면 `body_font`·`title_font` 를 따른다.
   */
  font?: string;
  /** 기울임 */
  italic?: boolean;
  /** 밑줄. `true` 면 아래에 긋는다. `BOTTOM` `CENTER` `TOP` 도 받는다 */
  underline?: boolean | string;
  /** 글자 배경(음영) 색 `#RRGGBB`. `none` 이면 없앤다 */
  shade?: string;
  /** 장평 — 글자 너비 백분율. 100 이 보통 */
  width_ratio?: number;
}

/**
 * 주석 한 줄. `※ …` 이나 `* …` 로 시작하는 작은 글씨.
 *
 * 실측 (paraPr 58): **내어쓰기 -3216** — 둘째 줄이 첫 줄보다 들어간다.
 */
export interface 주석블록 {
  kind: 'note';
  text: string;
  size?: Pt수;
  /** 내어쓰기 (pt). 음수면 둘째 줄이 첫 줄보다 들어간다. 기본 -32.16 */
  hanging?: Pt수;
  /** 줄 간격 (%). 안 주면 설정값, 그것도 없으면 160 */
  line_spacing?: number;
  /** 자간 (%). 음수면 좁아진다 */
  letter_spacing?: number;
  /** 문단 위 여백 (pt) */
  space_before?: Pt수;
  /** 문단 아래 여백 (pt) */
  space_after?: Pt수;
  /**
   * 이 블록의 글꼴 이름 (예: `휴먼명조`).
   *
   * **줄 높이가 글꼴마다 다르다.** 같은 180% 라도 휴먼명조는 24pt,
   * 함초롬바탕은 27pt 로 그려진다 — 안 맞추면 쪽에 들어가는 줄 수가 달라져
   * 세로로 넘친다. 안 주면 `body_font`·`title_font` 를 따른다.
   */
  font?: string;
  /** 기울임 */
  italic?: boolean;
  /** 밑줄. `true` 면 아래에 긋는다. `BOTTOM` `CENTER` `TOP` 도 받는다 */
  underline?: boolean | string;
  /** 글자 배경(음영) 색 `#RRGGBB`. `none` 이면 없앤다 */
  shade?: string;
  /** 장평 — 글자 너비 백분율. 100 이 보통 */
  width_ratio?: number;
}

/**
 * 그림.
 *
 * 파일을 읽어 BinData 에 넣고 manifest 에 적는다 — **둘이 어긋나면 한글이 파일을 거부한다.**
 * 크기를 안 주면 그림 파일에서 읽은 크기를 그대로 쓴다 (72dpi 로 본다).
 *
 * 경로는 **절대 경로**여야 한다.
 */
export interface 그림블록 {
  kind: 'image';
  /** 그림 파일의 **절대 경로** */
  path: string;
  /** 넣을 너비 (pt). 안 주면 그림 크기 그대로 */
  width?: Pt수;
  /** 넣을 높이 (pt). width 만 주면 비율을 지켜 따라온다 */
  height?: Pt수;
  /** 그림 아래에 붙일 설명 (예: 〈그림 1〉 연도별 투자 추이) */
  caption?: string;
  /** 가로 자리. 기본 center */
  align?: string;
}

export interface 쪽나눔블록 {
  kind: 'page_break';
}

export type 블록 =
  | 제목블록 | 띠블록 | 개조식블록 | 상자블록 | 표블록 | 글블록 | 쪽나눔블록
  | 본문블록 | 소제목블록 | 주석블록 | 그림블록 | 도형블록 | 구역나눔블록;

/**
 * 사각형 도형.
 *
 * 실측: 도형을 쓰는 34편 가운데 **33편이 `hp:rect`** 를 쓴다 (254개).
 * 정부 문서의 제목 상자·강조 상자가 거의 다 이것이다.
 * 타원·다각형은 다 합쳐 5편뿐이라 아직 안 만든다.
 */
export interface 도형블록 {
  kind: 'shape';
  /** 안에 넣을 글. 없으면 빈 상자 */
  text?: string;
  /** 너비 pt */
  width?: Pt수;
  /** 높이 pt */
  height?: Pt수;
  /** 테두리 색 `#RRGGBB` */
  border_color?: string;
  /**
   * 테두리 굵기 pt.
   *
   * 표의 `border_width` 와 이름을 가른다 — 그쪽은 `'0.4 mm'` 같은 **글자**고
   * 이쪽은 HWPUNIT 로 가는 **숫자**다. 이름이 같으면 인자 검사가 부딪힌다.
   */
  line_width?: number;
  /** 채움 색 `#RRGGBB`. `none` 이면 안 채운다 */
  background?: string;
  /** 글자 크기 pt */
  size?: Pt수;
  /** 정렬 */
  align?: string;
  /** 굵게 */
  bold?: boolean;
  /** 글꼴 */
  font?: string;
}

/**
 * 구역 나눔. 이 뒤 블록은 **새 구역**에 들어간다.
 *
 * 쪽 나눔(`page_break`)과 다르다 — 구역은 쪽 설정(용지·여백·머리말)을 따로 가진다.
 * 표지와 본문의 쪽 설정이 다를 때, 가로·세로가 섞일 때 쓴다.
 *
 * 실측: 문서 161편 가운데 10편(6%)이 구역을 나눈다.
 */
export interface 구역나눔블록 {
  kind: 'section_break';
}

export const 블록종류 = [
  'title', 'heading', 'band', 'body', 'outline', 'box', 'table', 'image', 'note', 'text',
  'shape', 'page_break', 'section_break',
] as const;

/** 정렬 이름을 규격 값으로. 모르는 것은 그렇다고 말한다 */
export function 정렬맞추기(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const 표 : Record<string, string> = {
    left: 'LEFT', center: 'CENTER', right: 'RIGHT',
    justify: 'JUSTIFY', distribute: 'DISTRIBUTE', both: 'JUSTIFY',
  };
  const 값 = 표[v.toLowerCase()];
  if (!값) throw new Error(`정렬은 ${Object.keys(표).join(', ')} 가운데 하나여야 한다: ${v}`);
  return 값;
}
