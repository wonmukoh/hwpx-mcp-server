/**
 * 단위.
 *
 * 한글 문서는 길이를 **HWPUNIT** 으로 적는다.
 *   1pt = 100 HWPUNIT      1mm = 283.465 HWPUNIT
 *
 * 지금 쓰는 MCP 는 이걸 그냥 `number` 로 다뤘다. 그래서 같은 도구에
 * `width: 42520`(HWPUNIT) 과 `font_size: 11`(pt) 이 나란히 있었고,
 * 부르는 쪽도 나도 헷갈렸다.
 *
 * 여기서는 **타입으로 구분한다.** 섞어 쓰면 컴파일이 안 된다.
 * 바깥(도구 표면)으로는 pt 만 내보내고, HWPUNIT 은 이 안에서만 쓴다.
 */

declare const 표시: unique symbol;

/** 한글 내부 길이 단위. 1pt = 100 */
export type HwpUnit = number & { readonly [표시]: 'hwpunit' };
/** 포인트 */
export type Pt = number & { readonly [표시]: 'pt' };
/** 밀리미터 */
export type Mm = number & { readonly [표시]: 'mm' };

const PT_PER_HWPUNIT = 100;
const MM_PER_HWPUNIT = 283.465;

export const pt = (v: number): Pt => v as Pt;
export const mm = (v: number): Mm => v as Mm;
export const hwp = (v: number): HwpUnit => v as HwpUnit;

/** pt → HWPUNIT */
export function ptToHwp(v: Pt): HwpUnit {
  return Math.round(v * PT_PER_HWPUNIT) as HwpUnit;
}

/** HWPUNIT → pt */
export function hwpToPt(v: HwpUnit): Pt {
  return (v / PT_PER_HWPUNIT) as Pt;
}

/** mm → HWPUNIT */
export function mmToHwp(v: Mm): HwpUnit {
  return Math.round(v * MM_PER_HWPUNIT) as HwpUnit;
}

/** HWPUNIT → mm */
export function hwpToMm(v: HwpUnit): Mm {
  return (v / MM_PER_HWPUNIT) as Mm;
}

/** XML 속성에서 HWPUNIT 을 읽는다. 없거나 숫자가 아니면 undefined */
export function readHwp(raw: string | undefined): HwpUnit | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? (n as HwpUnit) : undefined;
}

/** HWPUNIT 을 속성 값으로 */
export function writeHwp(v: HwpUnit): string {
  return String(Math.round(v));
}

/**
 * 테두리 굵기. 한글은 `"0.12 mm"` 처럼 **숫자와 단위 사이에 칸을 둔다.**
 * 칸이 없으면 한글이 안 읽는다 — 지금 쓰는 MCP 에서 물린 적이 있다.
 */
export const 테두리굵기 = [
  '0.1 mm', '0.12 mm', '0.15 mm', '0.2 mm', '0.25 mm', '0.3 mm', '0.4 mm', '0.5 mm',
  '0.6 mm', '0.7 mm', '1.0 mm', '1.5 mm', '2.0 mm', '3.0 mm', '4.0 mm', '5.0 mm',
] as const;

export type 테두리굵기값 = (typeof 테두리굵기)[number];

/** 사람이 준 굵기를 한글이 받는 값으로 맞춘다. 가장 가까운 것을 고른다 */
export function 굵기맞추기(v: string | number): 테두리굵기값 {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return '0.12 mm';
  let 고른것: 테두리굵기값 = 테두리굵기[0];
  let 차이 = Infinity;
  for (const w of 테두리굵기) {
    const d = Math.abs(parseFloat(w) - n);
    if (d < 차이) { 차이 = d; 고른것 = w; }
  }
  return 고른것;
}
