/**
 * **검사식도 의심한다** (작성지침 9항).
 *
 * 시험이 첫 시도에 다 통과하면 그럴수록 의심해야 한다.
 * 아무것도 안 보고 통과하는 시험은 없는 것만 못하다 —
 * 있으면 "확인했다" 는 착각까지 준다.
 *
 * 여기서는 소스를 **일부러 고장 내고** 시험이 실제로 실패하는지 본다.
 * 고장 냈는데 통과하면, 그 시험은 그것을 안 보고 있다는 뜻이다.
 *
 *   node 검증/고장내보기.mjs
 *
 * 소스는 반드시 되돌린다 (끝에서도, 도중에 죽어도).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
process.chdir(뿌리);

/** 고장 목록 — [이름, 파일, 원래글, 고장난글, 이걸 잡아야 하는 시험] */
const 고장들 = [
  [
    '취소선을 「있으면 켜진 것」 으로 읽는다 (문서 전체에 줄이 그어진다)',
    'packages/render/src/서식읽기.ts',
    "  return 꼴 !== 'NONE' && 꼴 !== '3D';",
    '  return true;',
    'packages/render',
  ],
  [
    '취소선 shape=3D 를 진짜 취소선으로 친다 (업무계획 charPr 124/125 가 그것이다)',
    'packages/render/src/서식읽기.ts',
    "  return 꼴 !== 'NONE' && 꼴 !== '3D';",
    "  return 꼴 !== 'NONE';",
    'packages/render',
  ],
  [
    '문단 여백을 hp:case 에서 읽는다 (값이 절반이 된다)',
    'packages/render/src/서식읽기.ts',
    "  return firstChildNamed(sw, 'hp:default') ?? firstChildNamed(sw, 'hp:case');",
    "  return firstChildNamed(sw, 'hp:case') ?? firstChildNamed(sw, 'hp:default');",
    'packages/render',
  ],
  [
    'landscape=WIDELY 를 가로로 읽어 용지를 뒤집는다 (A4 세로가 가로로 나온다)',
    'packages/render/src/엮기.ts',
    '  return `@page { size: ${mm(크기.너비)} ${mm(크기.높이)}; margin: 0 }`;',
    '  return `@page { size: ${mm(크기.높이)} ${mm(크기.너비)}; margin: 0 }`;',
    'packages/render',
  ],
  [
    '묶은 개체를 건너뛴다 (제목 띠 안의 절 제목이 통째로 사라진다)',
    'packages/render/src/엮기.ts',
    '      return 떠있으면감싸기(것, 묶음엮기(것, c));',
    "      return '';",
    'packages/render',
  ],
  [
    '뜬 개체를 줄 안에 그냥 둔다 (문단 내어쓰기를 따라가 쪽 밖으로 밀린다)',
    'packages/render/src/엮기.ts',
    '  return `<div class="뜬것">${속}</div>`;',
    '  return 속;',
    'packages/render',
  ],
  [
    '표 제목(hp:caption)을 안 낸다 (그림·표 설명이 사라진다)',
    'packages/render/src/엮기.ts',
    '    + `${표제목(el, c)}<colgroup>${열}</colgroup><tbody>${줄들}</tbody></table>`;',
    '    + `<colgroup>${열}</colgroup><tbody>${줄들}</tbody></table>`;',
    'packages/render',
  ],
  [
    '문단을 <div> 가 아니라 <p> 로 낸다 (문단 안의 표가 밖으로 끌려 나간다)',
    'packages/render/src/엮기.ts',
    '  return `<div class="p"${문단스타일(모양, p)}>${알맹이}</div>`;',
    '  return `<p class="p"${문단스타일(모양, p)}>${알맹이}</p>`;',
    'packages/render',
  ],
  [
    '본뜬 줄에서 안쪽 표를 안 빼낸다 (겹친 표가 복제되고 무너진다)',
    'packages/doc/src/표.ts',
    '            if (개체) removeNode(r);',
    '            void 개체;',
    'packages/doc',
  ],
  [
    'get_outline 이 셀 안에 든 표를 안 낸다 (회신서를 못 가리킨다)',
    'packages/server/src/도구.ts',
    "              for (const 안표 of findAll(셀.subList, 'hp:tbl')) {",
    '              for (const 안표 of []) {',
    'packages/server',
  ],
  [
    'replace 가 문단을 통째로 갈아 런을 합친다 (굵기가 날아간다)',
    'packages/doc/src/본문.ts',
    '        setText(t, 지금.split(찾을글).join(새글));',
    '        void t; this.글바꾸기(this.글.split(찾을글).join(새글));',
    'packages/doc',
  ],
  [
    '칸 경계를 넘는 어구를 그냥 못 찾았다고만 한다 (무엇을 하면 되는지 안 알려 준다)',
    'packages/doc/src/본문.ts',
    '    return 됨({ 바뀐수, 못찾음: 바뀐수 === 0 && this.글.includes(찾을글) });',
    '    return 됨({ 바뀐수, 못찾음: false });',
    'packages/doc',
  ],
  [
    'edit 이 그림을 넣고도 안 넣은 척한다 (조용한 무동작)',
    'packages/server/src/도구.ts',
    '      appendChild(담을것.value, 런);',
    '      /* 안 붙인다 */',
    'packages/server',
  ],
  [
    '줄을 넣으면서 줄 주소를 다시 안 매긴다 (표 검사에 걸린다)',
    'packages/doc/src/표.ts',
    "        if (addr) setAttr(addr, 'rowAddr', String(r));",
    '        /* 주소를 안 매긴다 */',
    'packages/doc',
  ],
  [
    '넣은 줄의 글을 안 비운다 (본뜬 줄의 글이 딸려 온다)',
    'packages/doc/src/표.ts',
    "      for (const t of findAll(새줄, 'hp:t')) setText(t, '');",
    '      /* 글을 안 비운다 */',
    'packages/doc',
  ],
  [
    '줄을 넣으면서 rowCnt 를 안 올린다',
    'packages/doc/src/표.ts',
    "    setAttr(this.el, 'rowCnt', String(childrenNamed(this.el, 'hp:tr').length));",
    '    /* rowCnt 를 안 올린다 */',
    'packages/doc',
  ],
  [
    'edit 이 아무것도 안 하고 됐다고 한다 (조용한 무동작)',
    'packages/server/src/도구.ts',
    '        const r = 고침하나(d, e);',
    '        const r = 됨(1);',
    'packages/server',
  ],
  [
    'edit 이 중간에 실패해도 그냥 이어 간다 (반쯤 고치고 됐다고 한다)',
    'packages/server/src/도구.ts',
    '        const r = 고침하나(d, e);',
    '        const r = e.op === "set_text" ? 안됨("일부러", "고장") : 고침하나(d, e);',
    'packages/server',
  ],
  [
    '구역을 더하면서 머리글의 secCnt 를 안 올린다 (한글이 새 구역을 통째로 버린다)',
    'packages/doc/src/문서.ts',
    '    this.머리.구역수적기(this.통.sectionNames().length);',
    '    // secCnt 를 안 올린다',
    'packages/doc',
  ],
  [
    '새 구역에 남의 글을 그대로 둔다',
    'packages/doc/src/문서.ts',
    "      for (const t of childrenNamed(r, 'hp:t')) setText(t, '');",
    '      /* 글을 안 비운다 */',
    'packages/doc',
  ],
  [
    'manifest 항목을 목록 밖에 붙인다',
    'packages/hwpx/src/container.ts',
    "      hpf = hpf.replace('</opf:manifest>', `${항목}</opf:manifest>`);",
    "      hpf = hpf.replace('<opf:spine>', `${항목}<opf:spine>`);",
    'packages/doc',
  ],
  [
    '머리말 조각에 남의 글을 그대로 둔다',
    'packages/compose/src/조판.ts',
    'setText(글칸, 글);',
    '/* 글을 안 넣는다 */',
    'packages/compose',
  ],
  [
    '탭을 글자 그대로 둔다 (한글이 안 읽는다)',
    'packages/compose/src/조판.ts',
    "      if (!글.includes('\t')) continue;",
    '      continue;',
    'packages/compose',
  ],
  [
    '도형 글을 상자 안이 아니라 뒤에 붙인다 (빈 상자가 나온다)',
    'packages/compose/src/조판.ts',
    'appendChild(rect, 글자리);',
    '// 상자 안에 안 넣는다',
    'packages/compose',
  ],
  [
    '도형 크기를 한 곳만 맞춘다 (한글이 딴 크기로 그린다)',
    'packages/compose/src/조판.ts',
    "      ['hp:sz', { width: w, height: h }],",
    '',
    'packages/compose',
  ],
  [
    '칸을 합치면서 덮인 셀을 안 지운다 (같은 칸을 둘이 덮는다)',
    'packages/doc/src/표.ts',
    'for (const it of 덮일것) removeNode(it.el);',
    '// 안 지운다',
    'packages/doc',
  ],
  [
    '합친 셀 너비를 덮는 열 폭의 합으로 안 맞춘다 (표 밖으로 나간다)',
    'packages/doc/src/표.ts',
    'if (다있나) 시작.크기주기(합, undefined);',
    '// 너비를 안 맞춘다',
    'packages/doc',
  ],
  [
    '저장 길목의 규격 검사를 뺀다 (흠을 내놓고도 저장된다)',
    'packages/doc/src/문서.ts',
    'const 새로난탈 = this.검사().filter((t) => !this.처음탈.has(t));',
    'const 새로난탈 = [];',
    'packages/doc',
  ],
  [
    '저장 길목에서 원래 있던 흠까지 막는다 (남의 문서를 못 연다)',
    'packages/doc/src/문서.ts',
    'const 새로난탈 = this.검사().filter((t) => !this.처음탈.has(t));',
    'const 새로난탈 = this.검사();',
    'packages/doc',
  ],
  [
    'hp:case 에 절반이 아니라 온값을 쓴다 (옛 MCP 가 그랬다)',
    'packages/doc/src/머리글.ts',
    'return Math.floor(v / 2);',
    'return v;',
    'packages/doc',
  ],
  [
    '지문을 안 보고 늘 새로 만든다 (header 가 부푼다)',
    'packages/doc/src/머리글.ts',
    'if (이미있는것 !== undefined) return 됨({ id: 이미있는것, 새로만듦: false });',
    'if (false) return 됨({ id: 이미있는것 ?? "0", 새로만듦: false });',
    'packages/doc',
  ],
  [
    'itemCnt 를 안 올린다 (한글이 목록을 잘라 읽는다)',
    'packages/doc/src/머리글.ts',
    "setAttr(목, 'itemCnt', String(이미.length + 1));",
    '// itemCnt 안 올림',
    'packages/doc',
  ],
  [
    '글꼴을 HANGUL 에만 넣는다',
    'packages/doc/src/머리글.ts',
    'for (const 언어 of 언어들) {\n      let 무리 = childrenNamed(목',
    "for (const 언어 of ['HANGUL'] as const) {\n      let 무리 = childrenNamed(목",
    'packages/doc',
  ],
  [
    '굵게를 자식이 아니라 속성으로 쓴다',
    'packages/doc/src/머리글.ts',
    "if (패치.굵게 !== undefined) 자식있고없고('hh:bold', 패치.굵게);",
    "if (패치.굵게 !== undefined) 속성('bold', String(패치.굵게));",
    'packages/doc',
  ],
  [
    '못 하는 것을 조용히 넘긴다 (무동작)',
    'packages/doc/src/머리글.ts',
    '      return 안됨(\n        `${목록이름} 에 id=${바탕id} 이 없다`,',
    '      return 됨({ id: 바탕id, 새로만듦: false });\n      return 안됨(\n        `${목록이름} 에 id=${바탕id} 이 없다`,',
    'packages/doc',
  ],
  [
    // 늘 새로 짜는 것 자체는 고장이 아니다 — 손으로 다시 써도 바이트가 같음을 2단계에서 확인했다.
    // 진짜 고장은 **원본 공백을 안 지키는 것**이다.
    '속성 앞 공백을 원본대로 안 지킨다 (왕복 무손실이 깨진다)',
    'packages/owpml/src/xml/serialize.ts',
    'return `${a.beforeName}${a.name}${a.aroundEq[0]}=',
    'return ` ${a.name}${a.aroundEq[0]}=',
    'packages/owpml',
  ],
  [
    '셀 여백을 주면서 hasMargin 을 안 켠다 (써 놓고도 표 여백이 쓰인다)',
    'packages/doc/src/표.ts',
    "    setAttr(this.el, 'hasMargin', '1');",
    "    // hasMargin 안 켬",
    'packages/doc',
  ],
  [
    '합친 셀 폭을 열 폭의 합으로 안 맞춘다 (표 밖으로 삐져나온다)',
    'packages/doc/src/표.ts',
    "      for (let i = a.col; i < a.col + a.colSpan; i++) 합 += 폭들[i] ?? 0;",
    "      합 = 폭들[a.col] ?? 0;",
    'packages/doc',
  ],
  [
    '세로 정렬을 subList 가 아니라 hp:tc 에 쓴다',
    'packages/doc/src/표.ts',
    "    setAttr(this.subList, 'vertAlign', 값);",
    "    setAttr(this.el, 'vertAlign', 값);",
    'packages/doc',
  ],
  [
    '캡션을 규격 자리가 아니라 맨 뒤에 붙인다 (한글이 못 읽는다)',
    'packages/doc/src/표.ts',
    "  if (내자리 === -1) { appendChild(표el, 새것); return; }",
    "  if (true) { appendChild(표el, 새것); return; }",
    'packages/doc',
  ],
  [
    // 이 고장이 실제로 있었다. 단위 시험이 못 잡고 한글 수용 시험에서 들통났다.
    '글을 바꾸면서 글 아닌 런까지 지운다 (표·그림이 사라진다)',
    'packages/doc/src/본문.ts',
    "    for (const r of 글든런들) {",
    "    for (const r of 런들.slice(1)) { removeNode(r); continue; }\n    for (const r of 글든런들) {",
    'packages/doc',
  ],
  [
    '강조할 때 표가 든 런도 쪼갠다 (표가 복제된다)',
    'packages/doc/src/본문.ts',
    "      if (아이들.length !== 1) continue;",
    "      // 섞인 런도 쪼갬",
    'packages/doc',
  ],
  [
    '읽기만 해도 고쳤다고 한다 (안 고쳤는데 파일이 바뀐다)',
    'packages/doc/src/문서.ts',
    "    for (const doc of this.구역doc.values()) if (doc.root.dirty) return true;",
    "    if (this.구역doc.size > 0) return true;",
    'packages/doc',
  ],
  [
    // 이 고장이 실제로 있었다. 시험도 검사도 다 통과했고 **렌더를 보고서야** 알았다.
    '표 셀이 조각이 들고 온 테두리 번호를 그대로 쓴다 (딴 문서에선 딴 것을 가리킨다)',
    'packages/compose/src/조판.ts',
    "        cell.테두리주기(머리칸 && 머리테두리 ? 머리테두리 : 몸테두리.value.id);",
    "        if (머리칸 && 머리테두리) cell.테두리주기(머리테두리);",
    'packages/compose',
  ],
  [
    '상자를 줄마다 네 면 다 두른다 (상자가 아니라 표처럼 보인다)',
    'packages/compose/src/조판.ts',
    "      const 쓸것 = 첫줄 ? 테두리.첫줄 : 끝줄 ? 테두리.끝줄 : 테두리.가운데;",
    "      const 쓸것 = 테두리.첫줄;",
    'packages/compose',
  ],
  [
    '조판이 중간에 실패해도 그냥 이어 간다 (반쯤 쓰고 됐다고 한다)',
    'packages/compose/src/조판.ts',
    '      if (!r.ok) {\n        return 안됨(',
    '      if (!r.ok) { continue; }\n      if (false) {\n        return 안됨(',
    'packages/compose',
  ],
  [
    '띠에 테두리를 그린다 (배경만 깔아야 한다)',
    'packages/compose/src/조판.ts',
    "    const bf = this.d.머리.borderFill확보(바탕.value, { 채움: 배경, 종류: 'NONE' });",
    "    const bf = this.d.머리.borderFill확보(바탕.value, { 채움: 배경, 종류: 'SOLID' });",
    'packages/compose',
  ],
  [
    '안 닫힌 표시를 조용히 넘긴다 (문서가 통째로 굵어진다)',
    'packages/compose/src/꾸밈.ts',
    "  if (굵게) {",
    "  if (false) {",
    'packages/compose',
  ],
  [
    '[[…]] 가 색만이 아니라 굵기까지 건다 (실측: 파란 글자의 3분의 2는 안 굵다)',
    'packages/compose/src/꾸밈.ts',
    "    조각들.push(색깊이 > 0 ? { 글: 담을것, 굵게, 색: 강조색 } : { 글: 담을것, 굵게 });",
    "    조각들.push(색깊이 > 0 ? { 글: 담을것, 굵게: true, 색: 강조색 } : { 글: 담을것, 굵게 });",
    'packages/compose',
  ],
  [
    '자간을 한 언어에만 건다 (그 언어 글자만 좁아진다)',
    'packages/doc/src/머리글.ts',
    "        for (const 언어 of 언어들) {",
    "        for (const 언어 of ['HANGUL'] as const) {",
    'packages/doc',
  ],
  [
    '표 폭을 구역에서 안 재고 못 박은 값을 쓴다 (여백이 다른 문서에서 삐져나온다)',
    'packages/compose/src/조판.ts',
    "        : (s.본문너비 ?? 기본본문너비);",
    "        : 기본본문너비;",
    'packages/compose',
  ],
  [
    '쪽 번호를 두 번 넣는다',
    'packages/compose/src/조판.ts',
    "    if (s.쪽번호있나) return 됨(false);",
    "    // 이미 있어도 또 넣음",
    'packages/compose',
  ],
  [
    '그림을 BinData 에만 넣고 manifest 에는 안 적는다 (한글이 파일을 거부한다)',
    'packages/doc/src/그림.ts',
    "  통.writeText(부품.manifest, 적기.value);",
    "  // manifest 안 적음",
    'packages/doc',
  ],
  [
    '그림 크기를 한 곳에만 맞춘다 (한글이 잘라 그리거나 비율이 뭉개진다)',
    'packages/compose/src/조판.ts',
    "  손대기('hp:imgClip', { left: '0', right: w, top: '0', bottom: h });",
    "  // imgClip 안 맞춤",
    'packages/compose',
  ],
  [
    '같은 그림을 넣을 때마다 파일을 새로 넣는다 (문서가 부푼다)',
    'packages/doc/src/그림.ts',
    "    if (통.read(n).equals(바이트)) {",
    "    if (false) {",
    'packages/doc',
  ],
  [
    '그림 크기를 못 읽으면 짐작해서 넣는다',
    'packages/doc/src/그림.ts',
    "export function 그림크기(바이트: Buffer): 결과<그림잰것> {",
    "export function 그림크기(바이트: Buffer): 결과<그림잰것> { return 됨({ 너비px: 100, 높이px: 100 });",
    'packages/compose',
  ],
  [
    '빈 값 속성을 값 없는 속성으로 쓴다 (한글이 파일을 거부한다)',
    'packages/owpml/src/xml/serialize.ts',
    '  if (!a.hasValue) {',
    "  if (a.raw === '') {",
    'packages/owpml',
  ],
  [
    '묶음이 반쯤 됐을 때 몇 개가 됐는지 안 알려 준다 (부르는 쪽이 두 번 쓴다)',
    'packages/server/src/도구.ts',
    "            { done: i, failed_at: i, failed_op: e.op, results: 낸것 },",
    "            {},",
    'packages/server',
  ],
  [
    'replace 길목이 제어문자를 그냥 받는다 (딴 길로 새어 들어간다)',
    'packages/doc/src/본문.ts',
    "    const 나쁜것 = 못쓰는제어문자(새글);",
    "    const 나쁜것 = undefined; const _쓴다 = 못쓰는제어문자;",
    'packages/server',
  ],
  [
    'compose 가 제어문자를 앞에서 안 막는다 (어느 블록인지 모른다)',
    'packages/compose/src/조판.ts',
    "  const 나쁜것 = 블록속나쁜글자(블록들)",
    "  const 나쁜것 = undefined && 블록속나쁜글자(블록들)",
    'packages/server',
  ],
  [
    'XML 이 못 쓰는 제어문자를 그냥 받는다 (한글이 그 파일을 못 연다)',
    'packages/doc/src/본문.ts',
    "    const 나쁜것 = 못쓰는제어문자(새글);",
    "    const 나쁜것 = undefined;",
    'packages/server',
  ],
  [
    '줄바꿈·탭까지 못 쓰는 글자로 잡는다 (멀쩡한 글이 막힌다)',
    'packages/owpml/src/xml/edit.ts',
    "    if (n < 0x20 && n !== 0x09 && n !== 0x0a && n !== 0x0d) {",
    "    if (n < 0x20) {",
    'packages/server',
  ],
  [
    '덮인 자리를 딴 칸처럼 돌려준다 (같은 글이 두 번 나오고 쓰면 알 수 없는 말이 난다)',
    'packages/doc/src/문서.ts',
    "      if (자리.row !== 셀주소.row || 자리.col !== 셀주소.col) {",
    "      if (false) {",
    'packages/server',
  ],
  [
    'get_content 가 합침을 안 드러낸다 (모델이 두 칸인 줄 안다)',
    'packages/server/src/도구.ts',
    "            ...(자리.rowSpan > 1 ? { rowspan: 자리.rowSpan } : {}),",
    "            ...({}),",
    'packages/server',
  ],
  [
    'find 가 덮인 자리도 칸으로 낸다 (같은 칸이 두 번 나온다)',
    'packages/server/src/도구.ts',
    "                  const 시작 = tt.시작셀(y, x);",
    "                  const 시작 = tt.셀(y, x);",
    'packages/server',
  ],
  [
    'delete_row 가 글 든 줄도 그냥 지운다 (내용이 말없이 날아간다)',
    'packages/server/src/도구.ts',
    "      const 지우기 = t.줄지우기(e.at, e.count ?? 1, e.force !== true);",
    "      const 지우기 = t.줄지우기(e.at, e.count ?? 1, false);",
    'packages/server',
  ],
  [
    'delete_row 가 at 없이도 지운다 (엉뚱한 줄이 날아간다)',
    'packages/server/src/도구.ts',
    "      if (e.at === undefined) {",
    "      if (false) {",
    'packages/server',
  ],
  [
    '마지막 줄까지 지운다 (줄 없는 표는 한글이 안 연다)',
    'packages/doc/src/표.ts',
    "    if (끝 - 자리 >= this.줄수) {",
    "    if (false) {",
    'packages/server',
  ],
  [
    '굽는 자리를 .gitignore 에서 뺀다 (dirty 가 늘 켜져 쓸모없어진다)',
    '.gitignore',
    "dist.굽는중.*/",
    "# (뺐다)",
    'packages/server/test/굽는동안.test.ts',
  ],
  [
    '굽고도 자국을 안 남긴다 (어느 소스에서 구웠는지 모른다)',
    '검증/빌드.mjs',
    "  fs.writeFileSync(path.join(굽는곳, '구운것.json'), `${JSON.stringify({",
    "  if (false) fs.writeFileSync(path.join(굽는곳, '구운것.json'), `${JSON.stringify({",
    'packages/server/test/굽는동안.test.ts',
  ],
  [
    '안 올린 변경이 있어도 dirty 를 안 켠다 (자국이 거짓말한다)',
    '검증/빌드.mjs',
    "    ...(안올린것 !== undefined ? { dirty: 안올린것.length > 0 } : {}),",
    "    ...({}),",
    'packages/server/test/굽는동안.test.ts',
  ],
  [
    '옛 방식대로 dist 를 지우고 그 자리에 굽는다 (굽는 내내 밖에서 못 읽는다)',
    '검증/빌드.mjs',
    "const 굽는곳 = `${낼곳}.굽는중.${process.pid}`;",
    "const 굽는곳 = 낼곳;",
    'packages/server/test/굽는동안.test.ts',
  ],
  [
    'CJS 로 묶였을 때 자리를 못 찾게 한다 (번들에서 판이 0.0.0 이 된다)',
    'packages/server/src/서버.ts',
    "  if (typeof __dirname === 'string' && __dirname) return __dirname;",
    "  if (false) return '';",
    'packages/server',
  ],
  [
    '이름이 다른 package.json 도 읽는다 (남의 판을 제 판이라 말한다)',
    'packages/server/src/서버.ts',
    "        if (j.name === 서버이름 && typeof j.version === 'string') return j.version;",
    "        if (typeof j.version === 'string') return j.version;",
    'packages/server',
  ],
  [
    '못 찾았을 때 그럴듯한 수를 지어낸다 (갈라진 것을 못 알아본다)',
    'packages/server/src/서버.ts',
    "  if (시작 === undefined) return '0.0.0';",
    "  if (시작 === undefined) return '0.4.1';",
    'packages/server',
  ],
  [
    '서버 판을 package.json 이 아니라 못 박은 수로 말한다 (판이 갈라진다)',
    'packages/server/src/서버.ts',
    "      if (j.name === 서버이름 && typeof j.version === 'string') return j.version;",
    "      if (j.name === 서버이름 && typeof j.version === 'string') return '0.1.0';",
    'packages/server',
  ],
  [
    'get_content 가 필수라 적어 놓은 id 를 안 낸다 (엄격한 클라이언트가 답을 거절한다)',
    'packages/server/src/도구.ts',
    "          { ok: true, id: 인자.doc_id, kind: 'document', text: 온글 });",
    "          { ok: true, kind: 'document', text: 온글 });",
    'packages/server',
  ],
  [
    'set_text 가 칸의 첫 문단만 간다 (둘째 줄에 옛 글이 남는다)',
    'packages/server/src/도구.ts',
    "      const r = e.id.startsWith('cell_') ? d.칸글바꾸기(e.id, e.text) : d.글바꾸기(e.id, e.text);",
    "      const r = d.글바꾸기(e.id, e.text);",
    'packages/server',
  ],
  [
    '칸 글을 문단마다 안 가르고 이어 붙인다 (두 줄인 줄 모른다)',
    'packages/server/src/도구.ts',
    "        const 글 = 줄들.map((x) => x.text).join('\\n');",
    "        const 글 = 줄들.map((x) => x.text).join('');",
    'packages/server',
  ],
  [
    '칸에 넣을 때 남는 문단을 안 비운다 (옛 글이 뒤에 붙는다)',
    'packages/doc/src/문서.ts',
    "      const 넣을것 = 줄들[i] ?? '';",
    "      const 넣을것 = 줄들[i] ?? p.글;",
    'packages/doc',
  ],
  [
    '문단보다 줄이 많아도 받아 준다 (줄이 말없이 사라진다)',
    'packages/doc/src/문서.ts',
    "    if (줄들.length > 것들.value.length) {",
    "    if (false) {",
    'packages/doc',
  ],
  [
    '훑기 기본 한도를 50으로 되돌린다 (계획서 뒷절이 통째로 안 보인다)',
    'packages/server/src/도구.ts',
    "      const 한도 = 인자.limit ?? (인자.text === undefined ? 500 : 50);",
    "      const 한도 = 인자.limit ?? 50;",
    'packages/server',
  ],
  [
    '잘려 놓고 안 잘렸다고 한다 (못 본 줄도 모른다)',
    'packages/server/src/도구.ts',
    "      const 잘림 = 나온것.length > 자른것.length;",
    "      const 잘림 = false;",
    'packages/server',
  ],
  [
    'get_outline 이 잘려 놓고 안 잘렸다고 한다',
    'packages/server/src/도구.ts',
    "      const 잘림 = 것들.length > 자른것.length;",
    "      const 잘림 = false;",
    'packages/server',
  ],
  [
    'find 가 문단에 in_cell 을 안 붙인다 (빈 자리가 어느 칸인지 모른다)',
    'packages/server/src/도구.ts',
    "              ...(칸 !== undefined ? { in_cell: 칸 } : {}),",
    "              ...(false ? { in_cell: 칸 } : {}),",
    'packages/server',
  ],
  [
    'in_cell 이 안쪽 칸이 아니라 바깥 칸을 가리킨다 (회신서 안을 못 집는다)',
    'packages/server/src/도구.ts',
    "                for (const q of findAll(셀.subList, 'hp:p')) 칸속.set(q, 칸아이디);",
    "                for (const q of findAll(셀.subList, 'hp:p')) if (!칸속.has(q)) 칸속.set(q, 칸아이디);",
    'packages/server',
  ],
  [
    'get_content 가 칸 id 없이 글만 준다 (그 칸을 가리킬 길이 없어진다)',
    'packages/server/src/도구.ts',
    "            id: 아이디, text: 칸줄글(시작.el), row: y, col: x,",
    "            id: '', text: 칸줄글(시작.el), row: y, col: x,",
    'packages/server',
  ],
  [
    'get_content 가 id 없이 부르면 빈 글을 낸다 (전체 흐름을 못 읽는다)',
    'packages/server/src/도구.ts',
    "          .join('\\n');",
    "          .join('') && '';",
    'packages/server',
  ],
  [
    'find 가 안 빈 표도 비었다고 한다 (빈 표 고르기가 어긋난다)',
    'packages/server/src/도구.ts',
    "                  rows: tt.줄수, cols: tt.칸수, empty: 온글.trim() === '',",
    "                  rows: tt.줄수, cols: tt.칸수, empty: true,",
    'packages/server',
  ],
  [
    'get_content 가 안 빈 표도 비었다고 한다 (빈 표 고르기가 어긋난다)',
    'packages/server/src/도구.ts',
    "      const 다빔 = 칸들.every((c) => String(c['text'] ?? '').trim() === '');",
    '      const 다빔 = true;',
    'packages/server',
  ],
];

/** 찾을 글의 줄끝을 파일에 맞춘다. 파일마다 LF 이기도 CRLF 이기도 하다 */
function 줄끝맞추기(파일글, 찾을글) {
  const CRLF = String.fromCharCode(13, 10);
  const LF = String.fromCharCode(10);
  const 벗긴것 = 찾을글.split(CRLF).join(LF);
  return 파일글.includes(CRLF) ? 벗긴것.split(LF).join(CRLF) : 벗긴것;
}

const 되돌릴것 = new Map();   // 파일 → 원래 내용

function 되돌리기() {
  for (const [f, 글] of 되돌릴것) fs.writeFileSync(f, 글, 'utf8');
  되돌릴것.clear();
}
process.on('exit', 되돌리기);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { 되돌리기(); process.exit(130); });

let 잡음 = 0;
const 못잡음 = [];

for (const [이름, 파일, 원래글, 고장난글, 어디] of 고장들) {
  const 원본 = fs.readFileSync(파일, 'utf8');
  const 찾을글 = 줄끝맞추기(원본, 원래글);
  const 넣을글 = 줄끝맞추기(원본, 고장난글);
  if (!원본.includes(찾을글)) {
    못잡음.push([이름, '고장 낼 자리를 못 찾았다 — 소스가 바뀌었나']);
    continue;
  }
  되돌릴것.set(파일, 원본);
  fs.writeFileSync(파일, 원본.replace(찾을글, 넣을글), 'utf8');

  const r = spawnSync(process.execPath, [
    path.join('node_modules', 'vitest', 'vitest.mjs'), 'run', 어디, '--reporter=dot',
  ], { encoding: 'utf8' });

  fs.writeFileSync(파일, 원본, 'utf8');
  되돌릴것.delete(파일);

  if (r.status === 0) {
    못잡음.push([이름, '고장 냈는데 시험이 **통과**했다']);
    console.log(`  ✗ ${이름}`);
  } else {
    잡음++;
    const 몇개 = /(\d+) failed/.exec((r.stdout ?? '') + (r.stderr ?? ''));
    console.log(`  ○ ${이름}  → ${몇개 ? 몇개[1] + '개 실패' : '실패'}`);
  }
}

console.log();
console.log(`고장 ${고장들.length}가지 — 시험이 잡은 것 ${잡음} / 못 잡은 것 ${못잡음.length}`);
for (const [이름, 왜] of 못잡음) console.log(`  ✗ ${이름}: ${왜}`);
process.exit(못잡음.length ? 1 : 0);
