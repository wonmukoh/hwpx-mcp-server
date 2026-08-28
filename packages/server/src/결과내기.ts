/**
 * 도구가 돌려주는 것 — **세 겹으로.**
 *
 * ```
 * content[0]           사람이 읽는 한 줄 요약     ← 어느 클라이언트든 보인다
 * content[1]           구조화 값의 JSON 글자      ← 구버전 호환
 * structuredContent    구조화 값 그대로            ← 최신 클라이언트
 * ```
 *
 * ## 왜 세 겹인가
 *
 * `structuredContent` 는 이번 규격에서 들어온 것이라 **아직 못 읽는 클라이언트가 있다.**
 * 그쪽에서는 `content` 만 보인다. 그래서 JSON 을 글자로도 한 번 더 넣는다.
 * 하나만 주면 어느 한쪽에서 값이 통째로 안 보인다.
 *
 * 첫 줄 요약은 사람이 볼 것이다. 모델도 이걸 먼저 읽으니
 * **무엇이 됐는지 한 줄로** 말한다 — "성공" 이 아니라 "문단 3개를 넣었다" 처럼.
 *
 * ## 실패는 `isError: true`
 *
 * 예외를 던지면 프로토콜 오류가 되어 모델이 고쳐 볼 기회를 못 얻는다.
 * 도구가 못 한 것은 **결과로** 돌려준다. 그래야 모델이 읽고 다시 시도한다.
 */

export interface 도구결과 {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * 됐을 때.
 *
 * `요약` 은 **무엇이 됐는지** 한 줄로. "성공" 같은 말은 쓰지 않는다.
 */
export function 잘됨(요약: string, 값: Record<string, unknown>): 도구결과 {
  return {
    content: [
      { type: 'text', text: 요약 },
      { type: 'text', text: JSON.stringify(값) },
    ],
    structuredContent: 값,
  };
}

/**
 * 못 했을 때.
 *
 * **왜 못 했는지**와 **어떻게 하면 되는지**를 같이 준다.
 * 왜만 말하면 모델이 같은 실수를 되풀이한다.
 */
export function 못함(이유: string, 어떻게: string, 덧?: Record<string, unknown>): 도구결과 {
  const 값 = { ok: false, reason: 이유, how: 어떻게, ...(덧 ?? {}) };
  return {
    content: [
      { type: 'text', text: `${이유}\n→ ${어떻게}` },
      { type: 'text', text: JSON.stringify(값) },
    ],
    structuredContent: 값,
    isError: true,
  };
}

/** `결과<T>` 를 도구 결과로 옮긴다 */
export function 옮기기<T extends Record<string, unknown>>(
  r: { ok: true; value: T } | { ok: false; 이유: string; 어떻게: string },
   요약: (v: T) => string,
): 도구결과 {
  return r.ok ? 잘됨(요약(r.value), { ok: true, ...r.value }) : 못함(r.이유, r.어떻게);
}
