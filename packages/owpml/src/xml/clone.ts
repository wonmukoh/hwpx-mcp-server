/**
 * 노드 복제.
 *
 * ## 왜 그냥 베끼면 안 되나
 *
 * 노드는 **원본 글에서의 자리(start~end)** 를 들고 있고,
 * 직렬화할 때 안 고친 노드는 `source.slice(start, end)` 를 뱉는다.
 * 다른 나무에 그대로 옮겨 붙이면 그 자리가 **딴 문서의 자리**를 가리킨다.
 * 엉뚱한 글자가 나온다.
 *
 * 그래서 복제한 노드는 **전부 고친 것으로 표시한다.**
 * 그러면 원본 조각을 안 쓰고 부품에서 새로 짠다.
 *
 * 손으로 다시 쓰는 길이 원본과 바이트가 같다는 것은
 * 2단계에서 문서 161편 / XML 부품 1141개로 확인했다.
 */

import type { ElementNode, Node } from './ast.js';
import { parseXml } from './parse.js';
import { serializeNode } from './serialize.js';

function 전부더럽히기(node: Node): void {
  node.dirty = true;
  if (node.kind === 'element') for (const c of node.children) 전부더럽히기(c);
}

/**
 * 요소를 복제한다. 복제본은 어느 나무에 붙여도 안전하다.
 *
 * `source` 는 그 노드가 살던 글이다 (`XmlDocument.source`).
 */
export function 복제하기(node: ElementNode, source: string): ElementNode {
  const 조각 = serializeNode(node, source);
  if (조각.length === 0) {
    // 안 고친 노드는 source.slice(start, end) 로 나온다.
    // 그러니 엉뚱한 source 를 주면 **빈 복제본**이 조용히 나온다.
    // 여기서 소리 내어 막는다. 안 그러면 빈 문단이 문서에 들어간다.
    throw new Error(
      `복제할 것이 비었다 (${node.name}). 그 노드가 살던 글(XmlDocument.source)을 줘야 한다.`,
    );
  }
  const doc = parseXml(조각);
  const 새것 = doc.root;
  전부더럽히기(새것);
  새것.parent = undefined;
  return 새것;
}

/**
 * 요소의 **지문**.
 *
 * 같은 모양인지 견주는 데 쓴다. `제외` 에 적은 속성은 빼고 본다
 * (보통 `id` — 번호만 다르고 모양이 같은 것을 같다고 봐야 하니까).
 *
 * 글자 그대로 견준다. 속성 순서가 다르면 다른 것으로 본다 —
 * 우리가 만드는 것은 늘 같은 순서로 나오니 문제가 없고,
 * 섣불리 정규화하다 틀리는 것보다 낫다.
 */
export function 지문(node: ElementNode, source: string, 제외: string[] = ['id']): string {
  const 조각 = serializeNode(node, source);
  const doc = parseXml(조각);
  const el = doc.root;
  for (const 이름 of 제외) {
    const i = el.attrs.findIndex((a) => a.name === 이름);
    if (i !== -1) el.attrs.splice(i, 1);
  }
  전부더럽히기(el);
  return serializeNode(el, 조각);
}
