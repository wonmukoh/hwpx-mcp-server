/**
 * XML 나무. **원본 위치를 그대로 들고 있는 것**이 핵심이다.
 *
 * 왜 이렇게 하나:
 *   보통 XML 파서는 문서를 읽어 다시 쓰면 원본과 달라진다.
 *     - 속성 순서가 바뀐다
 *     - `<a/>` 가 `<a></a>` 로 바뀐다
 *     - 공백·개행이 사라지거나 늘어난다
 *     - `&#xA;` 같은 문자 표기가 실제 문자로 바뀐다
 *   남의 문서를 열어 한 글자만 고치고 저장했는데 나머지가 바뀌면 안 된다.
 *
 * 그래서 노드마다 원본에서의 자리(start~end)를 들고 있고,
 * **손대지 않은 노드는 원본 조각을 그대로 뱉는다.**
 * 고친 노드만 새로 쓴다. 무손실이 성질로 보장된다.
 *
 * (지금 쓰는 MCP 는 이걸 정규식 문자열 치환으로 했다. 거기서 버그의 절반이 나왔다)
 */

/** 원본에서의 자리. end 는 열린 구간(그 자리 직전까지) */
export interface Span {
  start: number;
  end: number;
}

export type Node = ElementNode | TextNode | CommentNode | PiNode | DoctypeNode | CdataNode;

export interface Attr {
  /** 이름. 이름공간 접두사를 포함한 그대로 (`xmlns:hp`, `charPrIDRef`) */
  name: string;
  /** 값. **원본 그대로** — 이스케이프를 풀지 않는다 */
  raw: string;
  /** 값을 감싼 따옴표. 원본이 홑따옴표면 홑따옴표로 되돌려야 한다 */
  quote: '"' | "'";
  /** 이름과 `=` 사이, `=` 와 값 사이의 공백까지 보존 */
  beforeName: string;
  aroundEq: [before: string, after: string];
  /**
   * `=` 가 있었나. `name=""` 과 `name` 을 가르는 유일한 표시다.
   *
   * 이걸 안 들고 있었더니 `name=""` 을 `name` 으로 써서 한글이 파일을 거부했다.
   * 빈 값과 값 없음은 raw 만 보면 똑같아 보인다. 짐작하지 말고 기억한다.
   */
  hasValue: boolean;
}

export interface ElementNode extends Span {
  kind: 'element';
  /** `hp:p` 처럼 접두사를 포함한 이름 */
  name: string;
  attrs: Attr[];
  children: Node[];
  /** `<a/>` 로 닫혔나 */
  selfClosing: boolean;
  /** 여는 태그에서 `>` 앞의 공백 (`<a />` 의 그 칸) */
  beforeSelfClose: string;
  /** 여는 태그의 자리 */
  openSpan: Span;
  /** 닫는 태그의 자리. selfClosing 이면 없다 */
  closeSpan?: Span;
  /** 이 노드나 자손이 바뀌었나. 안 바뀌었으면 원본을 그대로 뱉는다 */
  dirty: boolean;
  parent?: ElementNode;
}

export interface TextNode extends Span {
  kind: 'text';
  /** **원본 그대로.** `&amp;` 를 `&` 로 풀지 않는다 */
  raw: string;
  dirty: boolean;
  parent?: ElementNode;
}

export interface CommentNode extends Span {
  kind: 'comment';
  raw: string;
  dirty: boolean;
  parent?: ElementNode;
}

/** `<?xml ... ?>` 같은 처리 명령 */
export interface PiNode extends Span {
  kind: 'pi';
  raw: string;
  dirty: boolean;
  parent?: ElementNode;
}

export interface DoctypeNode extends Span {
  kind: 'doctype';
  raw: string;
  dirty: boolean;
  parent?: ElementNode;
}

export interface CdataNode extends Span {
  kind: 'cdata';
  raw: string;
  dirty: boolean;
  parent?: ElementNode;
}

/** 문서 하나. 원본 문자열을 끝까지 들고 있는다 — 조각을 떠 와야 하기 때문이다 */
export interface XmlDocument {
  /** 원본 문자열 */
  source: string;
  /** 최상위 노드들 (선언·주석·루트 요소) */
  children: Node[];
  /** 루트 요소 */
  root: ElementNode;
}

/** 이 노드와 조상들을 '바뀜' 으로 표시한다 */
export function markDirty(node: Node): void {
  let cur: Node | undefined = node;
  while (cur) {
    if (cur.dirty) break;    // 위쪽은 이미 표시돼 있다
    cur.dirty = true;
    cur = cur.parent;
  }
}

/** 요소의 자식 중 요소만 */
export function childElements(el: ElementNode): ElementNode[] {
  return el.children.filter((c): c is ElementNode => c.kind === 'element');
}

/** 속성 값을 **원본 그대로** 읽는다 (이스케이프를 안 푼다).
 *  보통은 `getAttr` 을 쓸 것 — 그쪽이 이스케이프를 풀어 준다. */
export function attrRaw(el: ElementNode, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.raw;
}
