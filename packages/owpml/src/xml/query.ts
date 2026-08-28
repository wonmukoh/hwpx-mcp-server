/**
 * 나무에서 무언가 찾기.
 *
 * 정규식으로 XML 을 뒤지지 않는다. 그게 지금 쓰는 MCP 버그의 절반이었다.
 *   `<hp:p>` 를 찾는 정규식이 `<hp:pic>` 을 물고,
 *   `<hp:footNote>` 검사가 `<hp:footNotePr>` 에 걸렸다.
 * 나무에서는 이름이 같으면 같고 다르면 다르다. 그뿐이다.
 */

import type { ElementNode, Node } from './ast.js';

/** 이 요소와 모든 자손을 훑는다 (자기 자신부터) */
export function* walk(root: ElementNode): Generator<ElementNode> {
  yield root;
  for (const c of root.children) {
    if (c.kind === 'element') yield* walk(c);
  }
}

/** 자손 중 이름이 같은 것 전부 (자기 자신은 안 센다) */
export function findAll(root: ElementNode, name: string): ElementNode[] {
  const out: ElementNode[] = [];
  for (const el of walk(root)) {
    if (el !== root && el.name === name) out.push(el);
  }
  return out;
}

/** 자손 중 이름이 같은 첫 번째 */
export function findFirst(root: ElementNode, name: string): ElementNode | undefined {
  for (const el of walk(root)) {
    if (el !== root && el.name === name) return el;
  }
  return undefined;
}

/**
 * **바로 아래** 자식 중 이름이 같은 것들.
 *
 * 이게 `findAll` 보다 자주 맞다. 표 안의 표, 각주 안의 문단처럼
 * 같은 이름이 겹쳐 있을 때 자손까지 긁으면 남의 것을 집는다.
 */
export function childrenNamed(el: ElementNode, name: string): ElementNode[] {
  return el.children.filter(
    (c): c is ElementNode => c.kind === 'element' && c.name === name
  );
}

/** 바로 아래 자식 중 이름이 같은 첫 번째 */
export function firstChildNamed(el: ElementNode, name: string): ElementNode | undefined {
  for (const c of el.children) {
    if (c.kind === 'element' && c.name === name) return c;
  }
  return undefined;
}

/** 조건에 맞는 자손 전부 */
export function findWhere(
  root: ElementNode,
   맞나: (el: ElementNode) => boolean
): ElementNode[] {
  const out: ElementNode[] = [];
  for (const el of walk(root)) {
    if (el !== root && 맞나(el)) out.push(el);
  }
  return out;
}

/** 위로 올라가며 조건에 맞는 첫 조상 */
export function closest(
  node: Node,
  맞나: (el: ElementNode) => boolean
): ElementNode | undefined {
  let cur = node.parent;
  while (cur) {
    if (맞나(cur)) return cur;
    cur = cur.parent;
  }
  return undefined;
}

/** 위로 올라가며 이름이 같은 첫 조상 */
export function closestNamed(node: Node, name: string): ElementNode | undefined {
  return closest(node, (el) => el.name === name);
}

/** 뿌리부터 이 노드까지의 길 (`hs:sec > hp:p > hp:run`) */
export function pathOf(node: Node): string {
  const 이름들: string[] = [];
  if (node.kind === 'element') 이름들.push(node.name);
  let cur = node.parent;
  while (cur) {
    이름들.push(cur.name);
    cur = cur.parent;
  }
  return 이름들.reverse().join(' > ');
}

/** 요소 이름별 개수. 문서에 무엇이 들어 있는지 볼 때 */
export function countByName(root: ElementNode): Map<string, number> {
  const 셈 = new Map<string, number>();
  for (const el of walk(root)) {
    셈.set(el.name, (셈.get(el.name) ?? 0) + 1);
  }
  return 셈;
}
