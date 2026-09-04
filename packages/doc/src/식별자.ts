/**
 * 안정 ID.
 *
 * 요소를 가리킬 때 **위치 번호를 쓰지 않는다.**
 * 지금 쓰는 MCP 는 `paragraphIndex: 12` 로 가리킨다.
 * 앞에 문단을 하나 넣으면 12번이 13번이 된다 — 모델이 엉뚱한 곳을 고친다.
 *
 * ## 문서 안에 있는 id 를 못 쓰는 이유
 *
 * HWPX 문단에는 `<hp:p id="1959704510">` 처럼 id 가 있다. 하지만 실측:
 *
 * | 요소 | 전체 | id 있음 | **한 문서 안에서 겹침** |
 * |---|---|---|---|
 * | `hp:p` | 34391 | 34391 | **33539** |
 * | `hp:tbl` | 1292 | 1292 | 9 |
 * | `hp:rect` | 254 | 254 | 190 |
 * | `hp:tc` `hp:tr` `hp:run` | — | **0** | — |
 *
 * 문단 id 는 **거의 다 겹친다.** 셀·줄·런에는 아예 없다.
 * 그러니 우리가 매긴다.
 *
 * ## 어떻게 매기나
 *
 * 나무를 들고 있는 동안 **노드 객체 자체**를 열쇠로 삼는다.
 * 앞에 무엇을 넣든 객체는 그대로다 — 그래서 ID 가 안 밀린다.
 *
 * ## 어디까지 안 밀리나 — **연 문서 안에서만이다**
 *
 * 위 문장은 **반만 참이다.** 열쇠가 노드 객체라 문서를 들고 있는 동안에는
 * 무엇을 넣고 빼든 ID 가 그대로다. 그런데 ID 값 자체는 `다음번호++` 로,
 * **문서를 훑는 차례**에서 나온다. 그러니 저장하고 **다시 열면** 다시 훑고,
 * 구조가 달라졌으면 같은 요소가 딴 번호를 받는다.
 *
 * 표는 문단을 다 매긴 **다음에** 매긴다(`문서.ID매기기`). 그래서 줄을 하나
 * 넣어 문단이 늘면 그 문서의 **표 ID 가 전부** 밀린다. 하나도 아니고 전부다.
 * 구역이 여럿이면 뒤 구역의 문단 ID 까지 밀린다.
 *
 * 실측(`자료/실측.md` 27항) — 줄 하나 넣고 저장했다 다시 열었을 때
 *
 * | 문서 | 표 | 밀린 표 ID | 밀린 문단 ID |
 * |---|---|---|---|
 * | 대학혁신지원사업 기본계획 | 65 | **65** | 0 |
 * | 업무계획 | 13 | **13** | 0 |
 * | 검인정도서매뉴얼(구역 여럿) | 27 | **27** | **8** |
 *
 * 글만 고치는 것(`set_text`·`replace`·`set_style`)은 아무것도 안 밀린다.
 * 구조를 고쳤으면 `save_document` 가 `ids_stale: true` 로 알린다.
 *
 * ## 왜 번호처럼 안 보이게 하나
 *
 * `p_1` `p_2` 로 매기면 모델이 `p_3` 도 있으리라 여기고 셈을 한다.
 * 사이에 넣으면 그 셈이 틀린다. 그래서 **번호를 섞어** 이웃해 보이지 않게 한다.
 * ID 는 불투명한 손잡이다. 더하고 빼는 것이 아니다.
 */

import type { ElementNode } from '@hwpx/owpml';

/** 요소 종류별 앞머리 */
const 앞머리: Record<string, string> = {
  'hp:p': 'p',
  'hp:tbl': 'tbl',
  'hp:tc': 'cell',
  'hp:tr': 'row',
  'hp:run': 'run',
  'hp:pic': 'pic',
  'hp:rect': 'rect',
  'hp:ellipse': 'oval',
  'hp:line': 'line',
  'hp:polygon': 'poly',
  'hp:container': 'grp',
  'hp:equation': 'eq',
  'hp:footNote': 'fn',
  'hp:endNote': 'en',
  'hp:fieldBegin': 'fld',
  'hp:ctrl': 'ctrl',
};

/** 종류를 모르면 태그 이름에서 만든다 (`hp:foo` → `foo`) */
export function 앞머리정하기(태그: string): string {
  return 앞머리[태그] ?? 태그.replace(/^[a-z]+:/, '').toLowerCase();
}

// 36^4 = 1679616. 그것과 서로소인 큰 홀수를 곱하면 1:1 로 섞인다.
// 되돌릴 수 있으니 잃는 것이 없고, 이웃한 번호가 이웃해 보이지 않는다.
const 자리 = 36 ** 4;
const 섞는수 = 1_010_101;      // 1679616 과 서로소
// 0 부터 시작하면 첫 ID 가 `p_0000` 이 되어 번호처럼 보인다.
// 그러면 모델이 `p_0001` 도 있으리라 여긴다. 그래서 밀어 둔다.
const 밀기 = 7_919;

function 섞기(n: number): string {
  return (((n + 밀기) * 섞는수) % 자리).toString(36).padStart(4, '0');
}

/**
 * 한 문서의 ID 장부.
 *
 * 노드 → ID, ID → 노드 를 양쪽으로 들고 있는다.
 */
export class 이름표 {
  private readonly 노드에서 = new WeakMap<ElementNode, string>();
  private readonly 아이디에서 = new Map<string, ElementNode>();
  private 다음번호 = 0;

  /** 이 노드의 ID. 없으면 그 자리에서 매긴다 */
  아이디(node: ElementNode): string {
    const 있는것 = this.노드에서.get(node);
    if (있는것) return 있는것;

    const 앞 = 앞머리정하기(node.name);
    let 새것: string;
    do {
      새것 = `${앞}_${섞기(this.다음번호++)}`;
    } while (this.아이디에서.has(새것));

    this.노드에서.set(node, 새것);
    this.아이디에서.set(새것, node);
    return 새것;
  }

  /** ID 로 노드를 찾는다. 없으면 undefined */
  노드(id: string): ElementNode | undefined {
    return this.아이디에서.get(id);
  }

  has(id: string): boolean {
    return this.아이디에서.has(id);
  }

  /** 매긴 ID 개수 */
  get 개수(): number {
    return this.아이디에서.size;
  }

  /**
   * 지운 요소의 ID 를 장부에서 뺀다.
   *
   * 안 빼면 지운 것을 가리키는 ID 가 계속 살아 있어서
   * 없는 것을 고치고도 "됐다" 고 답하게 된다.
   */
  버리기(id: string): boolean {
    return this.아이디에서.delete(id);
  }

  /** 같은 앞머리를 쓰는 ID 들 (검사용) */
  같은종류(앞: string): string[] {
    return [...this.아이디에서.keys()].filter((k) => k.startsWith(`${앞}_`));
  }
}

/**
 * 셀 주소. 표 ID + 줄 + 칸.
 *
 * 셀은 **매기지 않고 계산한다.** 표가 그대로면 (줄, 칸)이 그대로다.
 */
export function 셀아이디(표아이디: string, row: number, col: number): string {
  return `cell_${표아이디.replace(/^tbl_/, '')}_${row}_${col}`;
}

/** 셀 ID 를 도로 푼다 */
export function 셀아이디풀기(id: string): { 표아이디: string; row: number; col: number } | undefined {
  const m = /^cell_([0-9a-z]+)_(\d+)_(\d+)$/.exec(id);
  if (!m) return undefined;
  return { 표아이디: `tbl_${m[1]}`, row: Number(m[2]), col: Number(m[3]) };
}
