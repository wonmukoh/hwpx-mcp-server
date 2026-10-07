/**
 * 들어온 인자를 검사한다.
 *
 * ## 왜 우리가 검사하나
 *
 * Zod 에 맡기면 편하다. 하지만 Zod 가 내는 말은
 * `Expected string, received number at path blocks.0.text` 같은 것이다.
 * 모델은 그걸 읽고 **무엇을 넣어야 하는지** 알기 어렵다.
 *
 * 우리는 **쓸 수 있는 값을 전부 적어** 돌려준다.
 * `align 은 left, center, right, justify 가운데 하나여야 한다. 준 값: 가운데`
 *
 * 그리고 스키마를 손으로 쓰기로 했으니(`스키마.ts`) 검사도 손으로 한다.
 * 둘이 따로 놀면 스키마엔 있는데 검사엔 없는 인자가 생긴다 —
 * 그래서 **같은 스키마를 보고** 검사한다.
 */

import type { 스키마 } from './스키마.js';

export interface 검사탈 {
  어디: string;
  무엇: string;
}

/**
 * 인자가 스키마에 맞나.
 *
 * 맞으면 빈 목록. 안 맞으면 **어디가 왜** 틀렸는지 다 모아서 준다
 * (하나만 말하면 고치고 또 부르고를 되풀이한다).
 */
export function 인자검사(값: unknown, s: 스키마, 어디 = ''): 검사탈[] {
  const 탈: 검사탈[] = [];
  const 이름 = 어디 || '인자';

  if (값 === undefined || 값 === null) {
    return [{ 어디: 이름, 무엇: '값이 없다' }];
  }

  switch (s.type) {
    case 'object': {
      if (typeof 값 !== 'object' || Array.isArray(값)) {
        return [{ 어디: 이름, 무엇: `객체여야 하는데 ${꼴이름(값)} 을 줬다` }];
      }
      const o = 값 as Record<string, unknown>;

      // **제 속성만 본다.** `s.properties?.[k]` 는 원형까지 뒤져서, 인자 이름이 `constructor`·
      // `__proto__` 면 함수를 스키마로 알고 「is not iterable」로 터졌다 (2026-10-07 검토)
      const 제것 = (k: string): 스키마 | undefined =>
        s.properties && Object.prototype.hasOwnProperty.call(s.properties, k) ? s.properties[k] : undefined;
      for (const k of s.required ?? []) {
        if (o[k] === undefined) {
          const 설명 = 제것(k)?.description ?? '';
          탈.push({ 어디: 어디 ? `${어디}.${k}` : k, 무엇: `꼭 있어야 한다${설명 ? ` — ${설명}` : ''}` });
        }
      }

      for (const [k, v] of Object.entries(o)) {
        const 속 = 제것(k);
        if (!속) {
          const 있는것 = Object.keys(s.properties ?? {});
          탈.push({
            어디: 어디 ? `${어디}.${k}` : k,
            무엇: `모르는 인자다. 쓸 수 있는 것: ${있는것.join(', ') || '(없음)'}`,
          });
          continue;
        }
        if (v === undefined) continue;
        탈.push(...인자검사(v, 속, 어디 ? `${어디}.${k}` : k));
      }
      return 탈;
    }

    case 'array': {
      if (!Array.isArray(값)) {
        return [{ 어디: 이름, 무엇: `목록이어야 하는데 ${꼴이름(값)} 을 줬다` }];
      }
      if (s.items) {
        값.forEach((x, i) => 탈.push(...인자검사(x, s.items!, `${어디}[${i}]`)));
      }
      return 탈;
    }

    case 'string': {
      if (typeof 값 !== 'string') {
        return [{ 어디: 이름, 무엇: `글자여야 하는데 ${꼴이름(값)} 을 줬다` }];
      }
      // **못 쓰는 글자는 입구에서 막는다 — 어느 인자든.** 본문 글만 막았더니 글꼴 이름·링크 주소·
      // 책갈피 이름·메모 지은이로 들어가 깨진 XML 이 저장되고 「저장했다」고 답했다 (2026-10-07 검토).
      const 나쁜것 = 못쓸글자(값);
      if (나쁜것) {
        return [{
          어디: 이름,
          무엇: `${나쁜것.자리}번째 글자 ${나쁜것.글자} 는 문서에 쓸 수 없다 (${나쁜것.왜}). 빼고 다시 줘라`,
        }];
      }
      if (s.enum && !s.enum.includes(값)) {
        return [{
          어디: 이름,
          무엇: `${s.enum.join(', ')} 가운데 하나여야 한다. 준 값: ${값}`,
        }];
      }
      return 탈;
    }

    case 'number':
    case 'integer': {
      if (typeof 값 !== 'number' || Number.isNaN(값)) {
        return [{ 어디: 이름, 무엇: `숫자여야 하는데 ${꼴이름(값)} 을 줬다` }];
      }
      if (!Number.isFinite(값)) {
        return [{ 어디: 이름, 무엇: `끝이 있는 숫자여야 한다. 준 값: ${값}` }];
      }
      if (s.type === 'integer' && !Number.isInteger(값)) {
        탈.push({ 어디: 이름, 무엇: `정수여야 하는데 ${값} 을 줬다` });
      }
      if (s.minimum !== undefined && 값 < s.minimum) {
        탈.push({ 어디: 이름, 무엇: `${s.minimum} 이상이어야 한다. 준 값: ${값}` });
      }
      if (s.maximum !== undefined && 값 > s.maximum) {
        탈.push({ 어디: 이름, 무엇: `${s.maximum} 이하여야 한다. 준 값: ${값}` });
      }
      return 탈;
    }

    case 'boolean': {
      if (typeof 값 !== 'boolean') {
        return [{ 어디: 이름, 무엇: `참/거짓이어야 하는데 ${꼴이름(값)} 을 줬다` }];
      }
      return 탈;
    }
  }
}

/**
 * 문서에 쓸 수 없는 글자 — XML 1.0 이 못 쓰는 제어문자(탭·줄바꿈 빼고), U+FFFE·FFFF,
 * **짝 없는 대리 글자**(짝 없는 \uD800 따위는 저장하면 말없이 U+FFFD 로 바뀐다).
 */
function 못쓸글자(s: string): { 글자: string; 자리: number; 왜: string } | undefined {
  for (let i = 0; i < s.length; i++) {
    const n = s.charCodeAt(i);
    const 꼴 = `U+${n.toString(16).toUpperCase().padStart(4, '0')}`;
    if ((n < 0x20 && n !== 0x09 && n !== 0x0a && n !== 0x0d) || n === 0xfffe || n === 0xffff) {
      return { 글자: 꼴, 자리: i, 왜: 'XML 이 못 쓰는 제어문자 — 든 파일은 한글이 못 연다' };
    }
    if (n >= 0xd800 && n <= 0xdbff) {
      const 다음 = s.charCodeAt(i + 1);
      if (다음 >= 0xdc00 && 다음 <= 0xdfff) { i++; continue; }
      return { 글자: 꼴, 자리: i, 왜: '짝 없는 대리 글자' };
    }
    if (n >= 0xdc00 && n <= 0xdfff) return { 글자: 꼴, 자리: i, 왜: '짝 없는 대리 글자' };
  }
  return undefined;
}

/** 탈들을 한 덩이 말로 */
export function 탈말(탈: 검사탈[]): string {
  return 탈.map((t) => `  ${t.어디}: ${t.무엇}`).join('\n');
}

function 꼴이름(값: unknown): string {
  if (값 === null) return 'null';
  if (Array.isArray(값)) return '목록';
  const t = typeof 값;
  const 표: Record<string, string> = {
    string: '글자', number: '숫자', boolean: '참/거짓', object: '객체',
  };
  return 표[t] ?? t;
}

/**
 * 경로가 절대 경로인가.
 *
 * 클라이언트마다 작업 디렉터리가 다르다. 상대 경로를 받으면
 * **어디를 가리키는지 알 수 없다.** 그러니 받지 않는다 — 조용히 짐작하지 않는다.
 */
export function 절대경로검사(p: string): { ok: true } | { ok: false; 이유: string; 어떻게: string } {
  const 윈도우 = /^[a-zA-Z]:[\\/]/.test(p) || /^\\\\/.test(p);
  const 유닉스 = p.startsWith('/');
  if (윈도우 || 유닉스) return { ok: true };
  return {
    ok: false,
    이유: `'${p}' 는 절대 경로가 아니다`,
    어떻게: '클라이언트마다 작업 폴더가 달라 상대 경로가 어디를 가리키는지 알 수 없다. '
      + 'C:\\Users\\… 처럼 처음부터 적어라.',
  };
}
