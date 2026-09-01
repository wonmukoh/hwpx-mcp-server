/**
 * 나무를 고치는 유일한 통로.
 *
 * 왜 함수로 감싸나:
 *   노드를 직접 고치면 `dirty` 표시를 잊을 수 있다. 잊으면 **고친 것이 저장 안 된다.**
 *   도구는 "됐습니다" 라고 답하고 파일은 그대로다 — 지금 쓰는 MCP 에서 21건 나온 그 병이다.
 *   여기 있는 함수만 쓰면 잊을 수가 없다.
 *
 * 위 계층은 `node.attrs[0].raw = …` 같은 직접 대입을 하지 않는다.
 */

import { markDirty } from './ast.js';
import type { Attr, ElementNode, Node, TextNode } from './ast.js';

/** XML 특수문자를 이스케이프한다. 속성 값과 글자 모두 이걸 거친다 */
/**
 * **XML 1.0 이 못 쓰는 제어문자.**
 *
 * C0 제어문자 가운데 TAB·LF·CR 만 쓸 수 있다. 나머지는 **어떤 방법으로도 못 쓴다** —
 * `&#0;` 같은 숫자 참조로도 안 된다. 규격이 그렇게 정해 놓았다.
 *
 * 그런 글자가 든 파일은 XML 파서가 거절하고 **한글도 못 연다.**
 * 실제로 겪었다: `U+0000` 이 든 글을 넣었더니 저장은 됐는데 한글이 `OPENFAIL` 을 냈다.
 *
 * 찾으면 첫 번째 것을 알려 준다. 없으면 `undefined`.
 */
export function 못쓰는제어문자(s: string): { 글자: string; 자리: number } | undefined {
  for (let i = 0; i < s.length; i++) {
    const n = s.charCodeAt(i);
    // TAB(9) · LF(10) · CR(13) 만 쓸 수 있다
    if (n < 0x20 && n !== 0x09 && n !== 0x0a && n !== 0x0d) {
      return { 글자: `U+${n.toString(16).toUpperCase().padStart(4, '0')}`, 자리: i };
    }
    // U+FFFE · U+FFFF 도 못 쓴다
    if (n === 0xfffe || n === 0xffff) {
      return { 글자: `U+${n.toString(16).toUpperCase()}`, 자리: i };
    }
  }
  return undefined;
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 이스케이프를 푼다. 읽을 때만 쓴다 — 나무에는 원본을 그대로 둔다 */
export function unescapeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (m, body: string) => {
    switch (body) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return "'";
      default:
        if (body[0] === '#') {
          const code = body[1] === 'x' || body[1] === 'X'
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10);
          return Number.isFinite(code) ? String.fromCodePoint(code) : m;
        }
        return m;
    }
  });
}

/** 속성 값을 읽는다. 이스케이프를 풀어서 준다 */
export function getAttr(el: ElementNode, name: string): string | undefined {
  const a = el.attrs.find((x) => x.name === name);
  return a ? unescapeXml(a.raw) : undefined;
}

/** 속성 값을 숫자로 */
export function getAttrNumber(el: ElementNode, name: string): number | undefined {
  const v = getAttr(el, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 속성을 넣거나 고친다.
 *
 * 이미 있으면 **값만** 바꾼다 — 순서와 공백은 그대로 둔다.
 * 없으면 맨 뒤에 붙인다 (한글도 그렇게 한다).
 */
export function setAttr(el: ElementNode, name: string, value: string): void {
  const raw = escapeXml(value);
  const 있던것 = el.attrs.find((a) => a.name === name);
  if (있던것) {
    if (있던것.raw === raw) return;      // 안 바뀌었으면 손대지 않는다
    있던것.raw = raw;
  } else {
    const 새것: Attr = {
      name, raw, quote: '"',
      beforeName: ' ',
      aroundEq: ['', ''],
      hasValue: true,
    };
    el.attrs.push(새것);
  }
  markDirty(el);
}

/** 속성을 뺀다. 없으면 아무 일도 안 한다 */
export function removeAttr(el: ElementNode, name: string): boolean {
  const i = el.attrs.findIndex((a) => a.name === name);
  if (i === -1) return false;
  el.attrs.splice(i, 1);
  markDirty(el);
  return true;
}

/** 요소의 글자를 통째로 바꾼다 (자식 요소는 사라진다) */
export function setText(el: ElementNode, text: string): void {
  const t: TextNode = {
    kind: 'text',
    start: el.start, end: el.end,
    raw: escapeXml(text),
    dirty: true,
    parent: el,
  };
  el.children = [t];
  el.selfClosing = false;
  markDirty(el);
}

/** 요소 안의 글자를 모은다 (자손까지. 이스케이프는 푼다) */
export function textOf(el: ElementNode): string {
  const out: string[] = [];
  const 훑기 = (n: Node): void => {
    if (n.kind === 'text') out.push(unescapeXml(n.raw));
    else if (n.kind === 'cdata') out.push(n.raw.slice(9, -3));
    else if (n.kind === 'element') for (const c of n.children) 훑기(c);
  };
  훑기(el);
  return out.join('');
}

/** 자식을 맨 뒤에 붙인다 */
export function appendChild(parent: ElementNode, child: Node): void {
  child.parent = parent;
  child.dirty = true;
  parent.children.push(child);
  parent.selfClosing = false;
  markDirty(parent);
}

/** 자식을 특정 자리에 끼운다 */
export function insertChildAt(parent: ElementNode, index: number, child: Node): void {
  child.parent = parent;
  child.dirty = true;
  parent.children.splice(index, 0, child);
  parent.selfClosing = false;
  markDirty(parent);
}

/** 어떤 노드 **앞**에 끼운다 */
export function insertBefore(ref: Node, child: Node): boolean {
  const parent = ref.parent;
  if (!parent) return false;
  const i = parent.children.indexOf(ref);
  if (i === -1) return false;
  insertChildAt(parent, i, child);
  return true;
}

/** 어떤 노드 **뒤**에 끼운다 */
export function insertAfter(ref: Node, child: Node): boolean {
  const parent = ref.parent;
  if (!parent) return false;
  const i = parent.children.indexOf(ref);
  if (i === -1) return false;
  insertChildAt(parent, i + 1, child);
  return true;
}

/** 노드를 뺀다 */
export function removeNode(node: Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  const i = parent.children.indexOf(node);
  if (i === -1) return false;
  parent.children.splice(i, 1);
  markDirty(parent);
  return true;
}

/** 노드를 다른 것으로 갈아 끼운다 */
export function replaceNode(old: Node, 새것: Node): boolean {
  const parent = old.parent;
  if (!parent) return false;
  const i = parent.children.indexOf(old);
  if (i === -1) return false;
  새것.parent = parent;
  새것.dirty = true;
  parent.children[i] = 새것;
  markDirty(parent);
  return true;
}

/** 새 요소를 만든다 */
export function createElement(
  name: string,
  attrs: Record<string, string> = {},
  children: Node[] = []
): ElementNode {
  const el: ElementNode = {
    kind: 'element',
    name,
    attrs: Object.entries(attrs).map(([n, v]): Attr => ({
      name: n, raw: escapeXml(v), quote: '"',
      beforeName: ' ', aroundEq: ['', ''], hasValue: true,
    })),
    children: [],
    selfClosing: children.length === 0,
    beforeSelfClose: '',
    start: 0, end: 0,
    openSpan: { start: 0, end: 0 },
    dirty: true,
  };
  for (const c of children) {
    c.parent = el;
    c.dirty = true;
    el.children.push(c);
  }
  return el;
}

/** 새 글자 노드를 만든다 */
export function createText(text: string): TextNode {
  return {
    kind: 'text', start: 0, end: 0,
    raw: escapeXml(text), dirty: true,
  };
}
