/**
 * 되돌림 값.
 *
 * **`void` 를 돌려주는 연산은 없다.** 무엇을 했는지, 못 했으면 왜 못 했는지 말한다.
 *
 * 지금 쓰는 MCP 에서 감사해 보니 **무동작이 21건**이었다.
 * "했다" 고 답하고 아무것도 안 한 도구가 21개였다는 뜻이다.
 * 그 병은 `void` 에서 나온다 — 아무것도 안 해도 티가 안 난다.
 *
 * 그래서 타입으로 막는다. 성공하면 **무엇을 바꿨는지** 세어서 돌려주고,
 * 실패하면 **왜** 와 **어떻게 하면 되는지** 를 같이 준다.
 */

export type 결과<T> =
  | { ok: true; value: T }
  | { ok: false; 이유: string; 어떻게: string };

export function 됨<T>(value: T): 결과<T> {
  return { ok: true, value };
}

export function 안됨<T = never>(이유: string, 어떻게: string): 결과<T> {
  return { ok: false, 이유, 어떻게 };
}

/**
 * 바꾼 것이 없으면 **실패로 친다.**
 *
 * "했다" 는데 0건인 것이 조용한 실패다. 여기서 잡는다.
 */
export function 몇건<T extends { 바뀐수: number }>(
  value: T,
   아무것도못했을때: { 이유: string; 어떻게: string },
): 결과<T> {
  if (value.바뀐수 === 0) return 안됨(아무것도못했을때.이유, 아무것도못했을때.어떻게);
  return 됨(value);
}

/** 실패를 사람이 읽을 글로 */
export function 풀어쓰기(r: 결과<unknown>): string {
  return r.ok ? '됨' : `${r.이유}\n→ ${r.어떻게}`;
}

/** 실패면 던진다. 시험과 안쪽 코드에서만 쓴다 */
export function 꺼내기<T>(r: 결과<T>): T {
  if (!r.ok) throw new Error(풀어쓰기(r));
  return r.value;
}
