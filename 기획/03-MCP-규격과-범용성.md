# 03. MCP 규격(2026-07-28)과 범용성

규격 원문: <https://modelcontextprotocol.io/specification/2026-07-28>
(2026-08-25 확인. 도구 주석 필드는 별도 확인)

---

## 이번 규격에서 챙길 것

### 1. 세션이 없다 — 손잡이(handle)를 명시적으로

> MCP has no protocol-level session … servers should return an explicit handle
> from a creation tool and accept that handle as an argument on subsequent calls.

우리 `doc_id` 가 정확히 이 방식이다. 규격이 이제 이걸 권장한다. 지킬 것:

- **불투명한 ID.** 구조를 짐작할 수 있으면 모델이 만들어 낸다. UUID 를 쓴다.
- **수명을 도구 설명에 적는다.** 그래야 모델이 언제 다시 열지 판단한다.
- **없는 손잡이는 그렇게 말한다.** "문서 abc 를 찾을 수 없습니다. `open_document` 로 다시 여세요."

### 2. 구조화 출력 (`outputSchema` + `structuredContent`)

도구가 결과 구조를 선언하고, 그 구조대로 값을 돌려준다.

```jsonc
// 도구 정의
{ "name": "get_outline",
  "outputSchema": { "type": "object", "properties": { ... }, "required": [...] } }

// 결과
{ "resultType": "complete",
  "content": [{ "type": "text", "text": "표 3개, 문단 41개" }],   // 사람·구버전용
  "structuredContent": { "tables": 3, "paragraphs": 41, ... } }
```

**규칙**: `structuredContent` 를 주는 도구는 **반드시 `content` 에도 같은 내용을 넣는다.**
규격이 하위 호환을 위해 그렇게 하라고 한다. 셋 중 하나라도 구조화 출력을 안 읽으면
그 클라이언트에서 도구가 벙어리가 된다.

### 3. 도구 주석 (annotations)

| 필드 | 뜻 | 우리 예 |
|---|---|---|
| `readOnlyHint` | 읽기만 한다 | `get_outline`, `find_text` |
| `destructiveHint` | 되돌리기 어렵다 | `delete_element`, `save_document`(덮어쓰기) |
| `idempotentHint` | 여러 번 불러도 같다 | `set_page_setup` |
| `openWorldHint` | 바깥 세계를 건드린다 | 우리는 전부 `false` (로컬 파일만) |

읽기 도구에 `readOnlyHint: true` 를 달면 호스트가 확인 없이 통과시킬 수 있다.
**모델이 문서를 살펴보는 일이 잦으므로 이게 체감 차이를 만든다.**

주의: 규격은 "클라이언트는 주석을 **신뢰하지 않는다**" 고 못 박는다. 힌트지 보증이 아니다.

### 4. 도구 목록 캐시

`tools/list` 응답에 `ttlMs` / `cacheScope` 를 줄 수 있고,
**도구 순서를 항상 같게** 하라고 한다 (클라이언트 캐시와 모델 프롬프트 캐시가 산다).

→ 도구 배열을 상수로 두고 정렬 순서를 고정한다. 조건부로 도구를 빼지 않는다.

### 5. 입력 요청 (MRTR)

도구가 결과 대신 "입력이 더 필요하다" 를 돌려줄 수 있다
(`resultType: "input_required"` + `inputRequests` + `requestState`).

쓸 만한 자리:

- 저장하려는데 파일이 이미 있다 → 덮어쓸지 묻는다
- 글꼴이 없다 → 비슷한 것으로 대체할지 묻는다

**단, 선택 기능이다.** 클라이언트가 안 받아 주면 도구가 죽는다.
→ 규칙: **입력 요청 없이도 항상 끝까지 동작하는 길이 있어야 한다.**
(위 예에서는 `overwrite: true` 매개변수)

### 6. `_meta` 필수 필드

요청마다 `io.modelcontextprotocol/protocolVersion`, `clientInfo`, `clientCapabilities`
가 온다. SDK 가 처리하지만, **클라이언트 능력을 보고 기능을 켜고 끄는 데 쓴다.**

### 7. 확장 — 나중에 볼 것

| 확장 | 우리에게 | 판단 |
|---|---|---|
| **Tasks** (비동기 장시간 작업) | 큰 문서 변환, 한글 렌더 검증 | 2단계에서 검토. **없어도 되게** 만든다 |
| **Skills over MCP** | '정부 보고서 작성' 절차를 통째로 | 조판 규칙이 굳으면 유력하다 |
| **MCP Apps** (인라인 UI) | 미리보기 | 범용성과 안 맞는다. 보류 |

---

## 범용성 — Claude · Codex · Gemini

셋 다에서 똑같이 동작해야 한다. 그러려면 **가장 좁은 쪽에 맞춘다.**

### 규칙 1 — 전송은 stdio 를 기본으로

셋 다 stdio 를 지원한다. Streamable HTTP 는 나중에 얹는다(선택).

### 규칙 1-1 — **실제로 물고 쓰는 앱의 제약** (Draftsmith)

이 MCP 를 실제로 갖다 쓰는 앱이 있다 — Draftsmith(Electron).
2026-08-25 에 그쪽 세션이 직접 알려 온 제약이다. **추측이 아니라 받은 것이다.**

| 제약 | 우리가 지킬 것 |
|---|---|
| 앱이 `ELECTRON_RUN_AS_NODE=1` + `process.execPath` 로 서버를 띄운다 | **진입점이 순수 Node 로 돌아가야 한다.** 번들러·로더·`tsx` 에 기대지 않는다 |
| 학교·교육청망이 SSL 인스펙션을 건다. 앱이 `NODE_EXTRA_CA_CERTS` 를 자식에 물려준다 | 서버가 그 환경변수를 **지우거나 덮어쓰지 않는다** |
| 그림은 앱이 `userData/hwpx/images` 에 사본을 두고 CLI 에 `--add-dir` 로 열어 준다 | 그림 블록은 **절대 경로**를 받고, 그 폴더 밖을 스스로 뒤지지 않는다 |
| 앱 버전 `0.4.0` 은 실제로 갈아탄 뒤에 붙인다 | 우리 쪽 번호에 그쪽이 끌려다니지 않게 한다 |

진입점 제약이 가장 무겁다. `npx hwpx-mcp` 와 `node dist/server.js` 가 **둘 다** 돌아야 한다.

### 규칙 2 — 스키마는 보수적 부분집합만

클라이언트마다 JSON Schema 지원 범위가 다르다. 특히 함수 선언으로 바꿔 넘기는 쪽은
좁다. **아래만 쓴다.**

| 써도 되는 것 | 쓰지 않는 것 |
|---|---|
| `type` (object/string/number/integer/boolean/array) | `oneOf` `anyOf` `allOf` `not` |
| `properties` `required` `description` | `$ref` `$defs` |
| `enum` | `additionalProperties`(false 말고) |
| `items` (단일 스키마) | 튜플형 `items: []` |
| `default` `minimum` `maximum` | `patternProperties` `dependentSchemas` |

- **중첩은 3단계까지.** 그보다 깊으면 도구를 쪼갠다.
- 열거값은 **문자열**로. 숫자 코드를 쓰지 않는다 (모델이 못 외운다).
- 매개변수는 **평평하게.** 깊은 객체보다 이름 붙은 값 여럿이 낫다.
  예외: `compose` 의 블록 목록은 본질적으로 배열이라 예외로 둔다.

이 규칙은 **린터로 강제한다** — 도구 정의를 훑어 금지 키워드가 있으면 빌드를 깬다.

### 규칙 3 — 도구 30개 안쪽

도구가 많으면 모델이 고르는 정확도가 떨어진다. 지금 MCP 는 100개가 넘는다.
비슷한 도구가 여럿이면 **하나로 합치고 매개변수로 가른다.**

### 규칙 4 — 이름 규칙 하나

- `[a-z0-9_]`, `동사_명사`
- 같은 뜻엔 같은 이름. 매개변수 사전은 [`04-도구-설계.md`](04-도구-설계.md)

### 규칙 5 — 경로는 절대 경로만

클라이언트마다 작업 디렉터리가 다르다. 상대 경로를 받으면
**어디를 가리키는지 말하고 거절한다.**

### 규칙 6 — 선택 기능에 기대지 않는다

sampling·elicitation·roots·tasks 는 **있으면 좋고 없으면 다른 길**로.
`clientCapabilities` 를 보고 판단하되, 못 쓴다고 기능이 죽으면 안 된다.

### 규칙 7 — 결과는 세 겹으로

```
content[0]  사람이 읽는 한 줄 요약     ← 어느 클라이언트든 보인다
content[1]  구조화 값의 JSON 문자열     ← 구버전 호환
structuredContent                       ← 최신 클라이언트
```

### 규칙 8 — 오류는 `isError: true` 로

프로토콜 오류(JSON-RPC error)가 아니라 **도구 실행 오류**로 돌려준다.
규격이 "모델이 스스로 고칠 수 있게" 그러라고 한다. 문구에 **다음 수**를 적는다.

---

## 확인 표

각 클라이언트에서 실제로 돌려 보고 채운다. 추측으로 채우지 않는다.

| 항목 | Claude | Codex | Gemini |
|---|---|---|---|
| stdio 연결 | | | |
| 도구 30개 인식 | | | |
| `structuredContent` 읽음 | | | |
| `readOnlyHint` 반영 | | | |
| 한글 설명·인자 처리 | | | |
| 절대 경로 처리 | | | |
