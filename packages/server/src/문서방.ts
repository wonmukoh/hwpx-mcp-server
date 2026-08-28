/**
 * 열린 문서를 보관한다.
 *
 * ## 왜 이게 있어야 하나
 *
 * 이번 MCP 규격에는 **프로토콜 수준의 세션이 없다.**
 * 그러니 "지금 다루는 문서" 같은 숨은 상태를 두면 안 된다 —
 * 클라이언트가 다시 붙거나 병렬로 부르면 엉뚱한 문서를 고친다.
 *
 * 그래서 **손잡이(doc_id)를 명시적으로** 주고받는다.
 * 도구를 부를 때마다 어느 문서인지 말해야 한다.
 *
 * ## 손잡이는 불투명하다
 *
 * `doc_1` `doc_2` 로 매기면 모델이 "다음은 doc_3 이겠지" 하고 셈을 한다.
 * 그래서 섞은 값을 쓴다. 더하고 빼는 것이 아니다.
 *
 * ## 오래된 것은 닫는다
 *
 * 안 닫고 두면 메모리가 는다. 한 시간 안 쓴 것은 치운다.
 * 치운 손잡이로 부르면 **"다시 여세요" 까지 말한다** — 그냥 "없다" 만 하면
 * 모델이 무엇을 해야 할지 모른다.
 */

import type { 문서 } from '@hwpx/doc';

export interface 열린문서 {
  id: string;
  d: 문서;
  /** 어디서 왔나. 새로 만든 것이면 undefined */
  경로?: string;
  /** 읽기만 하려고 열었나 */
  읽기만: boolean;
  연때: number;
  마지막으로쓴때: number;
}

/** 한 시간 안 쓰면 닫는다 */
export const 수명밀리초 = 60 * 60 * 1000;

const 자리 = 36 ** 6;
const 섞는수 = 1_010_101_01;   // 36^6 과 서로소
// 0 부터 시작하면 첫 손잡이가 `doc_000000` 이 되어 번호처럼 보인다
const 밀기 = 104_729;

export class 문서방 {
  private readonly 방 = new Map<string, 열린문서>();
  private 다음번호 = 0;

  constructor(private readonly 지금 = () => Date.now()) {}

  /** 열린 문서 수 */
  get 개수(): number {
    this.오래된것치우기();
    return this.방.size;
  }

  /** 문서를 들여놓고 손잡이를 준다 */
  들이기(d: 문서, 어디서?: { 경로?: string; 읽기만?: boolean }): string {
    this.오래된것치우기();
    const 때 = this.지금();
    let id: string;
    do {
      id = `doc_${(((this.다음번호++ + 밀기) * 섞는수) % 자리).toString(36).padStart(6, '0')}`;
    } while (this.방.has(id));

    this.방.set(id, {
      id,
      d,
      ...(어디서?.경로 !== undefined ? { 경로: 어디서.경로 } : {}),
      읽기만: 어디서?.읽기만 ?? false,
      연때: 때,
      마지막으로쓴때: 때,
    });
    return id;
  }

  /** 손잡이로 꺼낸다. 없으면 undefined */
  꺼내기(id: string): 열린문서 | undefined {
    this.오래된것치우기();
    const it = this.방.get(id);
    if (!it) return undefined;
    it.마지막으로쓴때 = this.지금();
    return it;
  }

  /** 못 찾았을 때 뭐라고 할지 — **다음에 무엇을 할지까지** 말한다 */
  못찾음말(id: string): { 이유: string; 어떻게: string } {
    const 열린것 = [...this.방.keys()];
    return {
      이유: `${id} 라는 문서가 없다`,
      어떻게: 열린것.length
        ? `지금 열려 있는 것: ${열린것.join(', ')}. 이 가운데 하나를 쓰거나 open_document 로 다시 열어라.`
        : '열려 있는 문서가 하나도 없다. open_document 나 create_document 를 먼저 불러라.'
        + ' (손잡이는 한 시간 안 쓰면 닫힌다)',
    };
  }

  닫기(id: string): boolean {
    return this.방.delete(id);
  }

  /** 열린 것들 (사람이 볼 꼴로) */
  목록(): { doc_id: string; path?: string; read_only: boolean; opened_ago_sec: number }[] {
    this.오래된것치우기();
    const 때 = this.지금();
    return [...this.방.values()].map((it) => ({
      doc_id: it.id,
      ...(it.경로 !== undefined ? { path: it.경로 } : {}),
      read_only: it.읽기만,
      opened_ago_sec: Math.round((때 - it.연때) / 1000),
    }));
  }

  /** 전부 닫는다 (시험과 끝낼 때) */
  비우기(): void {
    this.방.clear();
  }

  private 오래된것치우기(): void {
    const 때 = this.지금();
    for (const [id, it] of this.방) {
      if (때 - it.마지막으로쓴때 > 수명밀리초) this.방.delete(id);
    }
  }
}
