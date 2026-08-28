/**
 * 도구 스키마 — **보수적 부분집합만 쓴다.**
 *
 * ## 왜 좁게 쓰나
 *
 * 클라이언트마다 JSON Schema 를 받아들이는 범위가 다르다.
 * Claude·Codex·Gemini 가 다 같지 않고, 특히 **함수 선언으로 바꿔 넘기는 쪽은 좁다.**
 * 넓게 쓰면 어떤 클라이언트에서는 도구가 아예 안 보이거나 인자가 통째로 사라진다.
 *
 * 그래서 쓸 것을 미리 좁혀 두고 **린터로 강제한다.**
 * 금지 키워드가 하나라도 들어가면 시험이 깨진다.
 *
 * | 써도 되는 것 | 쓰지 않는 것 |
 * |---|---|
 * | `type` `properties` `required` `description` | `oneOf` `anyOf` `allOf` `not` |
 * | `enum` `items`(단일) `default` `minimum` `maximum` | `$ref` `$defs` 튜플형 `items` |
 * |  | `patternProperties` `dependentSchemas` |
 *
 * 중첩은 **3단계까지.** 그보다 깊으면 도구를 쪼갠다.
 *
 * ## 왜 Zod 를 안 쓰나
 *
 * SDK 는 Zod 를 받아 JSON Schema 로 바꿔 준다. 편하지만 **무엇이 나갈지 우리가 모른다** —
 * 선택 인자 하나가 `anyOf` 로 나가면 위 규칙이 깨지는데 그걸 알 길이 없다.
 * 그래서 손으로 쓰고, 손으로 쓴 것을 린터가 지킨다.
 */

/** 우리가 쓰는 스키마 조각 */
export interface 스키마 {
  type: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';
  description?: string;
  properties?: Record<string, 스키마>;
  required?: string[];
  items?: 스키마;
  enum?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
}

/** 쓰면 안 되는 키워드. 하나라도 있으면 린터가 깬다 */
export const 금지키워드 = [
  'oneOf', 'anyOf', 'allOf', 'not',
  '$ref', '$defs', 'definitions',
  'patternProperties', 'dependentSchemas', 'dependentRequired',
  'if', 'then', 'else',
  'prefixItems', 'contains',
  'additionalProperties',
  'const',
] as const;

/**
 * 입력 스키마의 중첩 한도.
 *
 * 입력은 클라이언트가 **함수 선언으로 바꿔** 모델에 넘긴다. 깊으면 그 과정에서 뭉개진다.
 * 그보다 깊어야 하면 도구를 쪼갠다 — 못 쪼갤 이유가 있으면 `중첩예외` 에 **왜인지 적는다.**
 */
export const 최대중첩 = 3;

/**
 * 출력 스키마의 중첩 한도.
 *
 * 한 단계 더 준다. **목록-레코드는 본질적으로 4단계**이기 때문이다:
 * `$ → matches → matches[] → matches[].id`.
 * 목록을 돌려주는 도구는 어떻게 짜도 이보다 얕아지지 않는다.
 *
 * 그리고 출력은 함수 선언으로 안 바뀐다 — 못 읽는 클라이언트는 그냥 무시한다.
 * 그래서 입력만큼 조일 까닭이 없다.
 */
export const 출력최대중첩 = 4;

export interface 린트탈 {
  어디: string;
  무엇: string;
}

/**
 * 스키마를 훑어 규칙을 어긴 데를 찾는다.
 *
 * **어디서** 어겼는지 길로 짚어 준다. 안 짚으면 큰 스키마에서 못 찾는다.
 */
export function 스키마린트(s: unknown, 어디 = '$', 깊이 = 1): 린트탈[] {
  const 탈: 린트탈[] = [];
  if (s === null || typeof s !== 'object') return 탈;

  if (Array.isArray(s)) {
    s.forEach((x, i) => 탈.push(...스키마린트(x, `${어디}[${i}]`, 깊이)));
    return 탈;
  }

  const o = s as Record<string, unknown>;

  for (const 금지 of 금지키워드) {
    if (금지 in o) 탈.push({ 어디, 무엇: `'${금지}' 를 썼다 — 클라이언트마다 받아들이는 범위가 다르다` });
  }

  // 튜플형 items 는 배열이다. 단일 스키마만 쓴다.
  if (Array.isArray(o['items'])) {
    탈.push({ 어디, 무엇: "'items' 가 배열이다 (튜플형) — 단일 스키마만 쓴다" });
  }

  // 열거값은 문자열만. 숫자 코드는 모델이 못 외운다.
  if (Array.isArray(o['enum'])) {
    const 문자열아닌것 = (o['enum'] as unknown[]).filter((x) => typeof x !== 'string');
    if (문자열아닌것.length) {
      탈.push({ 어디, 무엇: `enum 에 문자열이 아닌 값이 있다 (${문자열아닌것.join(', ')}) — 숫자 코드는 모델이 못 외운다` });
    }
  }

  if (깊이 > 최대중첩) {
    탈.push({ 어디, 무엇: `중첩이 ${깊이}단계다 — ${최대중첩}단계까지만 쓴다. 도구를 쪼개라` });
  }

  // 설명이 없으면 모델이 무엇을 넣을지 모른다
  if (o['type'] !== undefined && o['description'] === undefined && 어디 !== '$') {
    탈.push({ 어디, 무엇: '설명(description)이 없다 — 모델이 무엇을 넣을지 모른다' });
  }

  const 속성들 = o['properties'];
  if (속성들 && typeof 속성들 === 'object') {
    for (const [k, v] of Object.entries(속성들 as Record<string, unknown>)) {
      탈.push(...스키마린트(v, `${어디}.${k}`, 깊이 + 1));
    }
  }
  if (o['items']) 탈.push(...스키마린트(o['items'], `${어디}[]`, 깊이 + 1));

  // required 에 적힌 것이 properties 에 있나
  const 필수 = o['required'];
  if (Array.isArray(필수) && 속성들 && typeof 속성들 === 'object') {
    for (const k of 필수 as string[]) {
      if (!(k in (속성들 as Record<string, unknown>))) {
        탈.push({ 어디, 무엇: `required 에 '${k}' 가 있는데 properties 에는 없다` });
      }
    }
  }

  return 탈;
}

// ── 자주 쓰는 조각 ─────────────────────────────────────────────────────────

export const 글자 = (설명: string): 스키마 => ({ type: 'string', description: 설명 });
export const 숫자 = (설명: string): 스키마 => ({ type: 'number', description: 설명 });
export const 정수 = (설명: string): 스키마 => ({ type: 'integer', description: 설명 });
export const 참거짓 = (설명: string): 스키마 => ({ type: 'boolean', description: 설명 });
export const 목록 = (설명: string, 낱개: 스키마): 스키마 =>
  ({ type: 'array', description: 설명, items: 낱개 });
export const 고름 = (설명: string, 값들: string[]): 스키마 =>
  ({ type: 'string', description: 설명, enum: 값들 });

export function 묶음(설명: string, 속성: Record<string, 스키마>, 필수: string[] = []): 스키마 {
  return { type: 'object', description: 설명, properties: 속성, required: 필수 };
}

/** 도구마다 되풀이되는 것 */
export const doc_id = 글자(
  '문서 손잡이. open_document 나 create_document 가 준 값을 그대로 넣는다. '
  + '한 시간 안 쓰면 닫힌다 — 그때는 다시 열어야 한다.',
);

export const 절대경로 = (무엇: string) => 글자(
  `${무엇}. **절대 경로**여야 한다 (예: C:\\Users\\…\\문서.hwpx). `
  + '상대 경로는 어디를 가리키는지 알 수 없어 거절한다.',
);
