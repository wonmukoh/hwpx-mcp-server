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

/**
 * **글자 칸(`hp:t`) 안에서 글자 하나로 치는 개체.**
 *
 * 한글은 Shift+Enter 줄 나눔·탭·전각 빈칸·묶음 빈칸을 글자로 안 쓰고 `hp:t` 안의
 * **빈 요소**로 쓴다. `textOf` 는 빈 요소를 건너뛰므로, 그걸로 읽으면
 * `담당자<hp:lineBreak/>2. 교육부` 가 「담당자2. 교육부」로 **붙는다.** 그리고
 * `setText` 로 되쓰면 **넷 다 지워진다.** 표본 46편에 lineBreak 53 · tab 53 ·
 * fwSpace 220 · nbSpace 90 개가 있었다 (실측 35항).
 *
 * 그래서 글자 칸은 이 둘로만 읽고 쓴다. 표본에 U+3000·U+00A0 이 글자로 박힌 곳은
 * 0 이라 글자 ↔ 요소를 맞바꿔도 한글이 쓰는 꼴과 어긋나지 않는다.
 */
export const 글자개체: Readonly<Record<string, string>> = {
  'hp:lineBreak': '\n',
  'hp:tab': '\t',
  'hp:fwSpace': '\u3000',
  'hp:nbSpace': '\u00a0',
};

const 글자에서개체: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(글자개체).map(([이름, 글자]) => [글자, 이름]),
);

/** 한글이 새 문서에서 탭을 칠 때 쓰는 값 (기준파일에서 떴다) */
const 새탭속성 = { width: '2056', leader: '0', type: '1' };

/**
 * 글자 칸 안에 **개체 넷 말고 다른 요소**가 있나 — 형광펜·차례 표시·하이픈·변경 추적 따위.
 *
 * `글자칸쓰기` 는 그것들을 되살리지 못한다. 고치기 전에 이걸로 보고 거절한다.
 * 표본 46편에는 0개였다 (2026-09-27 검토) — 막아도 멀쩡한 문서를 못 고치게 되는 일은 없다.
 */
export function 글자칸의모르는것(t: ElementNode): string[] {
  return t.children
    .filter((c): c is ElementNode => c.kind === 'element' && 글자개체[c.name] === undefined)
    .map((c) => c.name);
}

/** 글자 칸 하나를 읽는다 — 개체 넷은 글자로 (`\n` `\t` U+3000 U+00A0) */
export function 글자칸읽기(t: ElementNode): string {
  const out: string[] = [];
  for (const c of t.children) {
    if (c.kind === 'text') out.push(unescapeXml(c.raw));
    else if (c.kind === 'cdata') out.push(c.raw.slice(9, -3));
    else if (c.kind === 'element') out.push(글자개체[c.name] ?? textOf(c));
  }
  return out.join('');
}

/**
 * 글자 칸 하나를 다시 쓴다 — `글자칸읽기` 의 짝.
 *
 * `\n` `\t` U+3000 U+00A0 은 개체로 되돌린다. **있던 개체는 차례대로 다시 쓴다** —
 * 탭은 `width`·`leader`(채움 점선)를 지고 있어서, 새로 만들면 목차의 점선이 사라진다.
 * 모자라면 새로 만든다. `\r\n`·`\r` 은 `\n` 으로 친다.
 */
export function 글자칸쓰기(t: ElementNode, 글: string): void {
  const 있던것 = new Map<string, ElementNode[]>();
  for (const c of t.children) {
    if (c.kind === 'element' && 글자개체[c.name] !== undefined) {
      const 줄 = 있던것.get(c.name) ?? [];
      줄.push(c);
      있던것.set(c.name, 줄);
    }
  }
  const 새자식: Node[] = [];
  for (const 쪽 of 글.replace(/\r\n?/g, '\n').split(/([\n\t\u3000\u00a0])/)) {
    if (쪽 === '') continue;
    const 이름 = 글자에서개체[쪽];
    if (이름 === undefined) {
      새자식.push(createText(쪽));
      continue;
    }
    새자식.push(있던것.get(이름)?.shift() ?? createElement(이름, 이름 === 'hp:tab' ? 새탭속성 : {}));
  }
  if (새자식.length === 0) 새자식.push(createText(''));
  for (const c of 새자식) c.parent = t;
  t.children = 새자식;
  t.selfClosing = false;
  markDirty(t);
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

/**
 * 노드를 뺀다.
 *
 * **뺀 노드의 `parent` 를 끊는다.** 전에는 남겨 두어서, 뺀 표도 위로 올라가면 문서
 * 뿌리에 닿았다 — 「아직 문서에 있나」 가 참이 됐다. join_tables 로 흡수된 표의 옛 ID 가
 * 0줄짜리 표로 살아 있었고, 그걸 delete_table 하면 「1곳이 바뀌었다」 고 했다
 * (2026-09-27 검토에서 잼).
 */
export function removeNode(node: Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  const i = parent.children.indexOf(node);
  if (i === -1) return false;
  parent.children.splice(i, 1);
  markDirty(parent);
  node.parent = undefined;
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

/**
 * **요소의 이름을 바꾼다.**
 *
 * 왜 있나 — 도형은 앞뒤가 다 같고 **가운데 기하만 다르다.** 실측(도형 세 갈래):
 *
 *     사각형   … shadow → hc:pt0 hc:pt1 hc:pt2 hc:pt3 → sz → pos …
 *     타원     … shadow → hc:center hc:ax1 hc:ax2 …    → sz → pos …
 *     다각형   … shadow → hc:pt × N                    → sz → pos …
 *
 * 앞(offset·orgSz·curSz·flip·rotationInfo·renderingInfo·lineShape·fillBrush·shadow)과
 * 뒤(sz·pos·outMargin)는 셋이 **똑같다.** 그래서 사각형 조각을 떠서 이름과 기하만
 * 갈아 끼우면 타원·다각형이 된다 — 뼈대를 손으로 다시 짜지 않는다.
 *
 * 이름을 바꾸면 여는 태그도 닫는 태그도 새 이름으로 나간다 (`dirty` 로 표시하므로).
 */
export function 이름바꾸기(el: ElementNode, 새이름: string): void {
  if (el.name === 새이름) return;
  el.name = 새이름;
  markDirty(el);
}
