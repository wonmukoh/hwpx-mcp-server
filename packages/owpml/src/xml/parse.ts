/**
 * XML 파서. 원본 자리를 하나도 잃지 않고 나무로 만든다.
 *
 * 규칙 하나: **아무것도 해석하지 않는다.**
 *   - 이스케이프를 풀지 않는다 (`&amp;` 는 `&amp;` 인 채로 둔다)
 *   - 공백을 다듬지 않는다
 *   - 속성 순서를 바꾸지 않는다
 *   - `<a/>` 와 `<a></a>` 를 구분해 기억한다
 * 해석은 위 계층이 필요할 때 한다. 여기서 해석하면 되돌릴 수 없다.
 */

import type {
  Attr, CdataNode, CommentNode, DoctypeNode, ElementNode,
  Node, PiNode, TextNode, XmlDocument,
} from './ast.js';

export class XmlParseError extends Error {
  constructor(
    message: string,
    readonly offset: number,
    readonly source: string
  ) {
    super(`${message} (${describePosition(source, offset)})`);
    this.name = 'XmlParseError';
  }
}

/** 오류 문구에 줄·칸과 그 언저리를 넣는다. 어디가 문제인지 바로 보이게 */
function describePosition(source: string, offset: number): string {
  const before = source.slice(0, offset);
  const line = before.split('\n').length;
  const col = offset - (before.lastIndexOf('\n') + 1) + 1;
  const 언저리 = source.slice(Math.max(0, offset - 30), offset + 30).replace(/\n/g, '\\n');
  return `${line}줄 ${col}칸 — …${언저리}…`;
}

const 공백 = /\s/;

/** 이름에 쓸 수 있는 글자. XML 규격보다 넉넉하게 잡되 태그 구분자는 뺀다 */
function 이름글자인가(ch: string): boolean {
  return !(
    ch === '<' || ch === '>' || ch === '/' || ch === '=' ||
    ch === '"' || ch === "'" || 공백.test(ch)
  );
}

class Parser {
  private i = 0;

  constructor(private readonly src: string) {}

  private get 끝인가(): boolean {
    return this.i >= this.src.length;
  }

  private 오류(message: string, at = this.i): never {
    throw new XmlParseError(message, at, this.src);
  }

  private 공백먹기(): string {
    const from = this.i;
    while (!this.끝인가 && 공백.test(this.src[this.i]!)) this.i++;
    return this.src.slice(from, this.i);
  }

  private 이름읽기(): string {
    const from = this.i;
    while (!this.끝인가 && 이름글자인가(this.src[this.i]!)) this.i++;
    if (this.i === from) this.오류('이름이 있어야 하는 자리다');
    return this.src.slice(from, this.i);
  }

  /** `<!-- -->`, `<![CDATA[]]>`, `<!DOCTYPE ...>` 처럼 `<!` 로 시작하는 것들 */
  private 느낌표읽기(parent?: ElementNode): Node {
    const start = this.i;

    if (this.src.startsWith('<!--', this.i)) {
      const end = this.src.indexOf('-->', this.i + 4);
      if (end === -1) this.오류('주석이 안 닫혔다', start);
      this.i = end + 3;
      const node: CommentNode = {
        kind: 'comment', start, end: this.i,
        raw: this.src.slice(start, this.i), dirty: false, parent,
      };
      return node;
    }

    if (this.src.startsWith('<![CDATA[', this.i)) {
      const end = this.src.indexOf(']]>', this.i + 9);
      if (end === -1) this.오류('CDATA 가 안 닫혔다', start);
      this.i = end + 3;
      const node: CdataNode = {
        kind: 'cdata', start, end: this.i,
        raw: this.src.slice(start, this.i), dirty: false, parent,
      };
      return node;
    }

    // <!DOCTYPE …> — 안에 대괄호 묶음이 있을 수 있다
    this.i += 2;
    let depth = 0;
    while (!this.끝인가) {
      const ch = this.src[this.i]!;
      if (ch === '[') depth++;
      else if (ch === ']') depth--;
      else if (ch === '>' && depth <= 0) { this.i++; break; }
      this.i++;
    }
    const node: DoctypeNode = {
      kind: 'doctype', start, end: this.i,
      raw: this.src.slice(start, this.i), dirty: false, parent,
    };
    return node;
  }

  /** `<? … ?>` */
  private 처리명령읽기(parent?: ElementNode): PiNode {
    const start = this.i;
    const end = this.src.indexOf('?>', this.i + 2);
    if (end === -1) this.오류('처리 명령이 안 닫혔다', start);
    this.i = end + 2;
    return {
      kind: 'pi', start, end: this.i,
      raw: this.src.slice(start, this.i), dirty: false, parent,
    };
  }

  private 속성읽기(): Attr {
    const beforeName = this.공백먹기();
    const name = this.이름읽기();
    const eqBefore = this.공백먹기();

    if (this.src[this.i] !== '=') {
      // 값 없는 속성. XML 에서는 규격 위반이지만 원본을 지키는 것이 우선이다.
      return { name, raw: '', quote: '"', beforeName, aroundEq: [eqBefore, ''], hasValue: false };
    }
    this.i++;   // '='
    const eqAfter = this.공백먹기();

    const q = this.src[this.i];
    if (q !== '"' && q !== "'") this.오류('속성 값을 따옴표로 감싸야 한다');
    this.i++;
    const from = this.i;
    const close = this.src.indexOf(q, this.i);
    if (close === -1) this.오류('속성 값이 안 닫혔다', from);
    this.i = close + 1;

    return {
      name,
      raw: this.src.slice(from, close),
      quote: q,
      beforeName,
      aroundEq: [eqBefore, eqAfter],
      hasValue: true,
    };
  }

  /** 여는 태그를 읽는다. 닫는 태그를 만나면 undefined */
  private 요소읽기(parent?: ElementNode): ElementNode {
    const start = this.i;
    this.i++;                       // '<'
    const name = this.이름읽기();

    const attrs: Attr[] = [];
    let beforeSelfClose = '';

    for (;;) {
      const save = this.i;
      const ws = this.공백먹기();

      if (this.끝인가) this.오류('태그가 안 닫혔다', start);

      const ch = this.src[this.i]!;
      if (ch === '>') {
        beforeSelfClose = ws;
        this.i++;
        break;
      }
      if (ch === '/' && this.src[this.i + 1] === '>') {
        beforeSelfClose = ws;
        this.i += 2;
        const el: ElementNode = {
          kind: 'element', name, attrs, children: [], selfClosing: true,
          beforeSelfClose, start, end: this.i,
          openSpan: { start, end: this.i },
          dirty: false, parent,
        };
        return el;
      }

      // 속성. 앞 공백은 속성이 들고 간다.
      this.i = save;
      attrs.push(this.속성읽기());
    }

    const openEnd = this.i;
    const el: ElementNode = {
      kind: 'element', name, attrs, children: [], selfClosing: false,
      beforeSelfClose, start, end: openEnd,
      openSpan: { start, end: openEnd },
      dirty: false, parent,
    };

    // 자식들
    for (;;) {
      if (this.끝인가) this.오류(`<${name}> 가 안 닫혔다`, start);

      if (this.src[this.i] === '<' && this.src[this.i + 1] === '/') {
        const closeStart = this.i;
        this.i += 2;
        const closeName = this.이름읽기();
        if (closeName !== name) {
          this.오류(`<${name}> 를 닫아야 하는데 </${closeName}> 가 나왔다`, closeStart);
        }
        this.공백먹기();
        if (this.src[this.i] !== '>') this.오류('닫는 태그가 안 끝났다');
        this.i++;
        el.closeSpan = { start: closeStart, end: this.i };
        el.end = this.i;
        return el;
      }

      const child = this.노드읽기(el);
      if (child) el.children.push(child);
    }
  }

  private 텍스트읽기(parent?: ElementNode): TextNode {
    const start = this.i;
    const next = this.src.indexOf('<', this.i);
    this.i = next === -1 ? this.src.length : next;
    return {
      kind: 'text', start, end: this.i,
      raw: this.src.slice(start, this.i), dirty: false, parent,
    };
  }

  private 노드읽기(parent?: ElementNode): Node | undefined {
    if (this.끝인가) return undefined;

    if (this.src[this.i] === '<') {
      const n = this.src[this.i + 1];
      if (n === '?') return this.처리명령읽기(parent);
      if (n === '!') return this.느낌표읽기(parent);
      if (n === '/') return undefined;      // 부르는 쪽이 처리한다
      return this.요소읽기(parent);
    }
    return this.텍스트읽기(parent);
  }

  parse(): XmlDocument {
    const children: Node[] = [];
    let root: ElementNode | undefined;

    while (!this.끝인가) {
      const before = this.i;
      const node = this.노드읽기();
      if (!node) {
        if (this.i === before) this.오류('짝이 안 맞는 닫는 태그');
        continue;
      }
      if (node.kind === 'element') {
        if (root) this.오류('최상위 요소가 둘이다', node.start);
        root = node;
      }
      children.push(node);
    }

    if (!root) this.오류('최상위 요소가 없다', 0);
    return { source: this.src, children, root };
  }
}

/** XML 문자열을 나무로. 원본은 그대로 들고 있는다 */
export function parseXml(source: string): XmlDocument {
  return new Parser(source).parse();
}
