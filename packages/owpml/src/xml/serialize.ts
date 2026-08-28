/**
 * 나무를 다시 XML 로.
 *
 * 규칙: **안 건드린 노드는 원본 조각을 그대로 뱉는다.**
 * 그래서 아무것도 안 고치고 다시 쓰면 원본과 **바이트가 같다.**
 * 고친 노드만 새로 쓴다.
 */

import type { Attr, ElementNode, Node, XmlDocument } from './ast.js';

function 속성쓰기(a: Attr): string {
  if (!a.hasValue) {
    // 원본에 `=` 자체가 없던 속성. 규격 위반이지만 원본이 그랬다면 지킨다.
    // (`name=""` 은 여기 오면 안 된다 — 그러면 한글이 파일을 거부한다)
    return `${a.beforeName}${a.name}`;
  }
  return `${a.beforeName}${a.name}${a.aroundEq[0]}=${a.aroundEq[1]}${a.quote}${a.raw}${a.quote}`;
}

function 여는태그쓰기(el: ElementNode): string {
  const attrs = el.attrs.map(속성쓰기).join('');
  return el.selfClosing
    ? `<${el.name}${attrs}${el.beforeSelfClose}/>`
    : `<${el.name}${attrs}${el.beforeSelfClose}>`;
}

function 노드쓰기(node: Node, source: string, out: string[]): void {
  // 안 바뀌었으면 원본 그대로. 이것이 무손실의 전부다.
  if (!node.dirty) {
    out.push(source.slice(node.start, node.end));
    return;
  }

  switch (node.kind) {
    case 'text':
    case 'comment':
    case 'pi':
    case 'doctype':
    case 'cdata':
      out.push(node.raw);
      return;

    case 'element': {
      out.push(여는태그쓰기(node));
      if (node.selfClosing) return;
      for (const c of node.children) 노드쓰기(c, source, out);
      out.push(`</${node.name}>`);
      return;
    }
  }
}

/** 문서를 XML 문자열로. 안 고쳤으면 원본과 같다 */
export function serializeXml(doc: XmlDocument): string {
  const out: string[] = [];
  for (const c of doc.children) 노드쓰기(c, doc.source, out);
  return out.join('');
}

/** 요소 하나만 XML 로 (조각을 들여다볼 때 쓴다) */
export function serializeNode(node: Node, source: string): string {
  const out: string[] = [];
  노드쓰기(node, source, out);
  return out.join('');
}
