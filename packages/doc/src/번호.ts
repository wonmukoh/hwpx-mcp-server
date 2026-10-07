/**
 * **문단 번호·글머리표** — 한글이 문단 앞에 그려 주는 「1.」「가.」「∘」.
 *
 * 이것들은 글이 아니다. 문단 모양(`hh:paraPr/hh:heading`)이 「이 문단은 몇 번 번호틀의
 * 몇 수준」이라고만 적고, 숫자는 한글이 **문서 차례대로 세어** 그린다.
 *
 * 우리는 글자 칸만 읽어서 이것을 통째로 놓쳤다. 한글의 글 내보내기와 표본 35편을 대 보니
 * 학교 문서 셋에서 「1.」「∘」「-」가 빠져 있었다(2026-10-07). 빠지면 모델은 번호가
 * 저절로 붙는 줄 모르고 글에 「1. 목적」이라 또 써서 **「1. 1. 목적」**이 된다.
 *
 * ## 세는 법 (한글 내보내기와 대 보고 맞춘 것)
 *
 *   - 번호틀(`hh:numbering`)마다 수준별 셈이 따로 간다. 개요 번호는 구역의
 *     `outlineShapeIDRef` 가 가리키는 번호틀을 쓰되 셈은 따로 친다.
 *   - 어떤 수준을 세면 그보다 **깊은 수준은 처음으로** 돌아간다.
 *   - 번호 없는 문단이 사이에 끼어도 셈은 이어진다.
 *   - 틀 글의 `^n` 은 n 수준의 지금 셈을 그 수준의 꼴(`numFormat`)로 쓴 것이다.
 *
 * 각주·미주·메모 안 문단은 따로 세지 않는다(본문 차례에 안 든다).
 */

import { findAll, getAttr, type ElementNode } from '@hwpx/owpml';

export interface 번호정의 {
  /** 문단 모양 id → 머리 (NONE 은 안 넣는다) */
  머리: Map<string, { 갈래: string; idRef: string; 수준: number }>;
  /** 번호틀 id → 수준(1부터) → 시작·꼴·틀 글 */
  번호틀: Map<string, Map<number, { 시작: number; 꼴: string; 틀: string }>>;
  /** 글머리표 id → 글자 */
  글머리: Map<string, string>;
}

const 원숫자 = (n: number, 첫: number, 개수: number) => (n >= 1 && n <= 개수 ? String.fromCodePoint(첫 + n - 1) : String(n));
const 차례글 = (n: number, 글들: string) => {
  const 낱 = [...글들];
  return n >= 1 && n <= 낱.length ? 낱[n - 1]! : String(n);
};

function 로마(n: number): string {
  if (n <= 0 || n >= 4000) return String(n);
  const 표: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let 남은 = n;
  let 글 = '';
  for (const [값, 자] of 표) while (남은 >= 값) { 글 += 자; 남은 -= 값; }
  return 글;
}

/** 수를 번호 꼴로. 모르는 꼴이나 범위를 넘으면 아라비아 숫자 */
export function 번호꼴(n: number, 꼴: string): string {
  switch (꼴) {
    case 'DIGIT': return String(n);
    case 'CIRCLED_DIGIT': return 원숫자(n, 0x2460, 20);
    case 'ROMAN_CAPITAL': return 로마(n);
    case 'ROMAN_SMALL': return 로마(n).toLowerCase();
    case 'LATIN_CAPITAL': return 원숫자(n, 0x41, 26);
    case 'LATIN_SMALL': return 원숫자(n, 0x61, 26);
    case 'CIRCLED_LATIN_CAPITAL': return 원숫자(n, 0x24b6, 26);
    case 'CIRCLED_LATIN_SMALL': return 원숫자(n, 0x24d0, 26);
    case 'HANGUL_SYLLABLE': return 차례글(n, '가나다라마바사아자차카타파하');
    case 'CIRCLED_HANGUL_SYLLABLE': return 원숫자(n, 0x326e, 14);
    case 'HANGUL_JAMO': return 차례글(n, 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ');
    case 'CIRCLED_HANGUL_JAMO': return 원숫자(n, 0x3260, 14);
    case 'HANGUL_PHONETIC': return 차례글(n, '일이삼사오육칠팔구십');
    case 'IDEOGRAPH': return 차례글(n, '一二三四五六七八九十');
    case 'CIRCLED_IDEOGRAPH': return 원숫자(n, 0x3280, 10);
    default: return String(n);
  }
}

/**
 * 구역들의 문단을 문서 차례로 세어 **문단마다 그 앞에 그려질 표지**를 준다.
 * 번호도 글머리표도 없는 문단은 지도에 없다.
 *
 * @param 구역뿌리들 구역 차례대로
 * @param 곁글인가 각주·미주·메모 안 문단이면 참 — 세지 않는다
 */
export function 번호매기기(
  정의: 번호정의, 구역뿌리들: ElementNode[], 곁글인가: (p: ElementNode) => boolean,
): Map<ElementNode, string> {
  const 지도 = new Map<ElementNode, string>();
  if (정의.머리.size === 0) return 지도;
  const 셈들 = new Map<string, Map<number, number>>();
  for (const 뿌리 of 구역뿌리들) {
    const 쪽 = findAll(뿌리, 'hp:secPr')[0];
    const 개요틀 = (쪽 && getAttr(쪽, 'outlineShapeIDRef')) || '1';
    for (const p of findAll(뿌리, 'hp:p')) {
      const 머리 = 정의.머리.get(getAttr(p, 'paraPrIDRef') ?? '');
      if (!머리 || 곁글인가(p)) continue;
      if (머리.갈래 === 'BULLET') {
        const 자 = 정의.글머리.get(머리.idRef);
        if (자) 지도.set(p, 자);
        continue;
      }
      const 틀id = 머리.갈래 === 'OUTLINE' ? 개요틀 : 머리.idRef;
      const 틀 = 정의.번호틀.get(틀id);
      if (!틀) continue;
      const 열쇠 = `${머리.갈래 === 'OUTLINE' ? 'O' : 'N'}${틀id}`;
      const 셈 = 셈들.get(열쇠) ?? new Map<number, number>();
      셈들.set(열쇠, 셈);
      const 수준 = 머리.수준 + 1;
      const 지금 = (셈.get(수준) ?? (틀.get(수준)?.시작 ?? 1) - 1) + 1;
      셈.set(수준, 지금);
      for (const k of [...셈.keys()]) if (k > 수준) 셈.delete(k);
      const 이수준 = 틀.get(수준);
      if (!이수준 || 이수준.틀 === '') continue;
      const 표지 = 이수준.틀.replace(/\^(\d+)/g, (_, 몇: string) => {
        const k = Number(몇);
        const 값 = 셈.get(k) ?? 틀.get(k)?.시작 ?? 1;
        return 번호꼴(값, 틀.get(k)?.꼴 ?? 'DIGIT');
      });
      지도.set(p, 표지);
    }
  }
  return 지도;
}
