/**
 * **문서 계층이 고친 문서를 한글이 받아들이는가.**
 *
 * 3단계의 관문이다. 시험이 다 통과해도 한글이 안 받으면 아무 뜻이 없다.
 *
 * 기준 파일마다:
 *   1. 글을 바꾸고
 *   2. 글자 서식을 주고 (charPr 복제·지문)
 *   3. 문단 여백·정렬을 주고 (hp:case / hp:default)
 *   4. 어구를 강조하고 (런 쪼개기)
 *   5. 표가 있으면 열 폭·셀 여백·머리행 반복을 주고
 *   6. 저장한 뒤 한글에 먹인다
 *
 * 그리고 한글이 뱉은 것에서 **우리가 준 값이 살아 있는지** 확인한다.
 * 여는 것만 보면 모자라다 — 한글이 열고도 우리 것을 버릴 수 있다.
 *
 * 한글은 한 번만 띄운다. 경로에 한글(글자)을 넣지 않는다.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 뿌리 = path.dirname(여기);
const B = (p) => pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', p, 'src', 'index.js')).href;

const { 문서, 표, 곁글인가 } = await import(B('doc'));
const { parseXml, findAll, findFirst, firstChildNamed, getAttr, childrenNamed, textOf }
  = await import(B('owpml'));
const { HwpxContainer, 부품 } = await import(B('hwpx'));

const 무대 = path.join(os.tmpdir(), 'hwpx-doclayer');
const 앞마당 = path.join(무대, 'ours');
const 뒷마당 = path.join(무대, 'hwp');
for (const d of [앞마당, 뒷마당]) {
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
}

const 표시 = 'DOC3단계표시';
const 강조할것 = '표시';           // 위 글 안의 조각
const 왼쪽여백 = 2000;
const 셀여백 = 1700;

const 기준파일 = path.join(뿌리, '자료', '기준파일');
const 목록 = fs.readdirSync(기준파일).filter((f) => f.toLowerCase().endsWith('.hwpx')).sort();

const 한것 = new Map();
const 준비실패 = [];

// ── 1. 문서 계층으로 고쳐 내놓는다 ────────────────────────────────────────
for (const 이름 of 목록) {
  try {
    const d = 문서.열기(fs.readFileSync(path.join(기준파일, 이름)));
    d.ID매기기();

    const s = d.구역들[0];
    const 문단들 = s.문단들.filter((p) => !p.비었나);
    const 쓸문단 = 문단들[0] ?? s.문단들[0];
    if (!쓸문단) { 준비실패.push([이름, '문단이 없다']); continue; }
    const pid = d.이름표.아이디(쓸문단.el);

    const 한일 = { 글: false, 글자서식: false, 문단서식: false, 강조: false, 표: false,
      꾸밈: false, 링크: false, 책갈피: false,
      각주: false, 미주: false, 메모: false, 수식: false, 다단: false, 개요: false,
      바탕쪽: false };

    const r1 = d.글바꾸기(pid, 표시);
    한일.글 = r1.ok;

    const r2 = d.글자서식주기(pid, { 크기: 13, 굵게: true });
    한일.글자서식 = r2.ok;

    // **취소선·첨자·강조점이 한글을 넘는가.**
    // 셋 다 이름을 짐작하면 틀리는 자리고, 강조점(`@symMark`)은 표본 2564개가
    // 전부 NONE 이라 **실물을 한 번도 못 봤다.** 한글이 심판을 본다.
    const r2b = d.글자서식주기(pid, { 취소선: true, 첨자: 'super', 강조점: 'DOT_ABOVE' });
    한일.꾸밈 = r2b.ok;

    // **하이퍼링크와 책갈피가 한글을 넘는가.**
    // 링크는 fieldBegin~fieldEnd 쌍이라 id 가 어긋나면 한글이 짝을 못 맺는다.
    // 한글이 다시 저장하면서 짝이 살아 있는지가 심판이다.
    const r2c = d.링크걸기(pid, 표시, 'https://www.moe.go.kr');
    한일.링크 = r2c.ok;
    const r2d = d.책갈피달기(pid, '수용시험-책갈피');
    한일.책갈피 = r2d.ok;

    const r3 = d.문단서식주기(pid, { 왼쪽여백, 정렬: 'CENTER' });
    한일.문단서식 = r3.ok;
    const paraPrId = r3.ok ? r3.value.paraPrId : null;

    const r4 = d.강조하기(pid, 강조할것, { 색: '#C00000' });
    한일.강조 = r4.ok;
    // **거절은 실패가 아니다.** 표·그림과 같은 런에 든 글은 쪼개면 안 되니 거절한다.
    // 그 까닭을 모아 두고 끝에 보여 준다 — 안 보여 주면 거절이 조용해진다.
    const 거절 = r4.ok ? null : r4.이유;

    // **남은 일곱이 한글을 넘는가.**
    //
    // 여섯은 다 한글이 저장한 것을 오려 왔으니 「같은 것」인지만 보면 된다.
    // (바탕쪽은 **여기가 물리라고 말해 줬다** — 규격만 보고 `hp:secPr` 안에
    //  넣었더니 기준 파일 27편이 다 안 열렸다. 한글에 직접 만들게 해 보니
    //  딴 부품이었다. 자료/실측.md 32항.)
    //
    // 강조하기 뒤에 둔다. 앞에 두면 런이 조각나 강조가 거절되고,
    // 그러면 원래 재던 것을 조용히 덜 재게 된다.
    한일.각주 = d.주달기(pid, '수용시험 각주다.', '각주').ok;
    한일.미주 = d.주달기(pid, '수용시험 미주다.', '미주').ok;
    한일.메모 = d.메모달기(pid, 강조할것, '수용시험 메모다').ok;
    한일.수식 = d.수식넣기(pid, '{a} over {b}').ok;
    한일.다단 = d.단주기(2).ok;
    한일.개요 = d.개요수준주기(pid, 1).ok;
    한일.바탕쪽 = d.바탕쪽주기('수용시험 바탕쪽').ok;

    // 표가 있으면 만져 본다
    let 표잰것 = null;
    const 표들 = s.표들;
    if (표들.length) {
      const t = new 표(표들[0]);
      const 폭들 = new Array(t.칸수).fill(0).map(() => Math.floor(40000 / t.칸수));
      const w = t.열폭주기(폭들);
      const c = t.셀(0, 0);
      if (c) c.안여백주기({ left: 셀여백, right: 셀여백 });
      t.머리행반복주기(true);
      한일.표 = w.ok;
      표잰것 = { 폭: 폭들[0], 셀여백 };
    }

    const 탈 = d.검사();
    if (탈.length) { 준비실패.push([이름, `저장 전 검사에 걸림: ${탈.slice(0, 2).join(' / ')}`]); continue; }

    fs.writeFileSync(path.join(앞마당, 이름), d.저장());
    한것.set(이름, { 한일, paraPrId, 표잰것, 거절, 꼭돼야하는것: { 글: r1.ok, 글자서식: r2.ok, 문단서식: r3.ok } });
  } catch (e) {
    준비실패.push([이름, e.message.split('\n')[0]]);
  }
}

// ── 2. 한글 한 번 띄워 전부 열어 본다 ─────────────────────────────────────
const ps = `
$ErrorActionPreference = 'Continue'
$hwp = New-Object -ComObject HWPFrame.HwpObject
# **창을 숨긴다.** 안 숨기면 Open·SaveAs 마다 한글 창이 앞으로 튀어나와
# 사용자가 다른 프로그램에 하는 클릭을 먹는다. 검증 한 바퀴에 수십 번이다.
try { $hwp.XHwpWindows.Item(0).Visible = $false } catch {}
try { $hwp.SetMessageBoxMode(0x20000) | Out-Null } catch {}
try { $hwp.RegisterModule("FilePathCheckDLL","FilePathCheckerModule") | Out-Null } catch {}
try {
  foreach ($f in Get-ChildItem -Path '${앞마당}' -Filter *.hwpx) {
    $out = Join-Path '${뒷마당}' $f.Name
    try {
      if ($hwp.Open($f.FullName, "", "forceopen:true")) {
        if ($hwp.SaveAs($out, "HWPX", "")) { Write-Output ("OK ||| " + $f.Name) }
        else { Write-Output ("SAVEFAIL ||| " + $f.Name) }
      } else { Write-Output ("OPENFAIL ||| " + $f.Name) }
    } catch { Write-Output ("THROW ||| " + $f.Name + " ||| " + $_.Exception.Message) }
    try { $hwp.Clear(1) | Out-Null } catch {}
  }
} finally { try { $hwp.Quit() | Out-Null } catch {} }
`;
// **powershell 이 0 이 아닌 값으로 끝나도 판정은 이미 나와 있다.**
//
// 마지막 명령 하나가 실패하면(예: Quit) 종료 코드가 1 이 되는데, `execFileSync` 는
// 그때 터진다. 그러면 **한글이 이미 뱉어 놓은 판정 스물여섯 개를 통째로 버린다** —
// 무엇이 열리고 무엇이 안 열렸는지 한 줄도 안 보여 주고 갈래가 죽는다.
// 실제로 겪었다: 한글은 다 열었는데 갈래만 빨갰다.
//
// 그러니 **뱉은 것을 먼저 챙기고** 종료 코드는 곁들여 알린다. 판정이 안 온 파일은
// 아래에서 「한글이 아무 말도 안 했다」로 잡히니, 조용히 넘어가지 않는다.
let 결과 = '';
try {
  결과 = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    encoding: 'buffer', timeout: 900_000, maxBuffer: 1 << 24,
  }).toString('utf8');
} catch (e) {
  결과 = Buffer.isBuffer(e.stdout) ? e.stdout.toString('utf8') : String(e.stdout ?? '');
  console.log(`※ powershell 이 ${e.status} 로 끝났다 — 뱉어 놓은 판정은 그대로 읽는다`);
  if (결과.trim().length === 0) {
    console.log('  (뱉은 것도 없다. 한글이 아예 안 떴을 수 있다)');
  }
}

const 한글판정 = new Map();
for (const 줄 of 결과.split(/\r?\n/)) {
  const [상태, 이름, 덧] = 줄.split(' ||| ');
  if (이름) 한글판정.set(이름.trim(), { 상태, 덧 });
}

// ── 3. 한글이 뱉은 것에서 우리 값이 살아 있나 ─────────────────────────────
let 통과 = 0;
const 실패 = [...준비실패];
const 확인한것 = { 글: 0, 굵게: 0, 취소선: 0, 첨자: 0, 강조점: 0,
  링크: 0, 책갈피: 0, 여백: 0, 정렬: 0, 강조: 0, 셀여백: 0, 머리행: 0,
  각주: 0, 미주: 0, 메모: 0, 수식: 0, 다단: 0, 개요: 0, 바탕쪽: 0 };

for (const 이름 of 목록) {
  const 낸것 = 한것.get(이름);
  if (!낸것) continue;
  const 판정 = 한글판정.get(이름);
  if (!판정) { 실패.push([이름, '한글이 아무 말도 안 했다']); continue; }
  if (판정.상태 !== 'OK') { 실패.push([이름, `한글: ${판정.상태}${판정.덧 ? ' — ' + 판정.덧 : ''}`]); continue; }

  try {
    const c = HwpxContainer.open(fs.readFileSync(path.join(뒷마당, 이름)));
    const 구역 = parseXml(c.readText(c.sectionNames()[0]));
    const 머리 = parseXml(c.readText(부품.header));
    const 문제 = [];

    // 글
    // **곁글을 빼고 잇는다.**
    //
    // 각주·메모 글도 `hp:t` 라, 통째로 이어 붙이면 **본문 글 사이에 끼어든다.**
    //
    //     넣은 글    DOC3단계표시
    //     이어 붙이면  DOC3단계 · 수용시험 메모다 · 표시   ← 「글이 사라졌다」가 된다
    //
    // 메모는 고른 어구를 감싸므로 몸통이 딱 그 가운데에 들어간다. 그래서
    // 스물다섯 편이 한꺼번에 「한글이 글을 버렸다」로 보였다 — **버린 것은
    // 한글이 아니라 우리 눈이었다.** `get_content` 에서 겪은 것과 같은 자리다.
    const 온글 = findAll(구역.root, 'hp:t')
      .filter((t) => !곁글인가(t))
      .map((t) => (t.children[0]?.raw ?? '')).join('');
    if (낸것.한일.글) {
      if (!온글.includes(표시)) 문제.push('우리가 넣은 글이 사라졌다');
      else 확인한것.글++;
    }

    // 굵게 — 우리가 준 문단의 런이 가리키는 charPr 에 hh:bold 가 있나
    if (낸것.한일.글자서식) {
      const 굵은게있나 = findAll(머리.root, 'hh:charPr')
        .some((cp) => firstChildNamed(cp, 'hh:bold') && getAttr(cp, 'height') === '1300');
      if (!굵은게있나) 문제.push('13pt 굵은 글자모양이 사라졌다');
      else 확인한것.굵게++;
    }

    // 하이퍼링크 — **짝이 맞아 있어야 한다.** id 가 어긋나면 한글이 링크를 버리거나
    // 문서 끝까지 이어 버린다. 시작·끝이 다 있고 서로를 가리키는지 본다.
    if (낸것.한일.링크) {
      const 시작들 = findAll(구역.root, 'hp:fieldBegin')
        .filter((e) => getAttr(e, 'type') === 'HYPERLINK');
      const 끝들 = findAll(구역.root, 'hp:fieldEnd');
      const 짝맞음 = 시작들.some((b) =>
        끝들.some((e) => getAttr(e, 'beginIDRef') === getAttr(b, 'id')));
      const 주소살음 = 시작들.some((b) => {
        const 값들 = firstChildNamed(b, 'hp:parameters');
        if (!값들) return false;
        return childrenNamed(값들, 'hp:stringParam')
          .some((x) => getAttr(x, 'name') === 'Command' && textOf(x).includes('moe.go.kr'));
      });
      if (!시작들.length) 문제.push('하이퍼링크가 한글을 넘으며 통째로 사라졌다');
      else if (!짝맞음) 문제.push('하이퍼링크의 fieldEnd 짝이 끊겼다');
      else if (!주소살음) 문제.push('하이퍼링크는 남았는데 주소가 사라졌다');
      else 확인한것.링크++;
    }

    if (낸것.한일.책갈피) {
      const 것들 = findAll(구역.root, 'hp:bookmark').map((e) => getAttr(e, 'name'));
      if (!것들.includes('수용시험-책갈피')) 문제.push('책갈피가 한글을 넘으며 사라졌다');
      else 확인한것.책갈피++;
    }

    // 취소선·첨자·강조점 — 셋을 따로 센다. 한꺼번에 세면 하나만 살아도 통과한다.
    if (낸것.한일.꾸밈) {
      const 모든charPr = findAll(머리.root, 'hh:charPr');
      const 볼것 = [
        ['취소선', (cp) => getAttr(firstChildNamed(cp, 'hh:strikeout') ?? cp, 'shape') === 'SOLID'],
        ['첨자', (cp) => firstChildNamed(cp, 'hh:supscript') !== undefined],
        ['강조점', (cp) => getAttr(cp, 'symMark') === 'DOT_ABOVE'],
      ];
      for (const [이름, 보나] of 볼것) {
        if (모든charPr.some(보나)) 확인한것[이름]++;
        else 문제.push(`${이름}이 한글을 넘으며 사라졌다`);
      }
    }

    // 문단 여백·정렬
    if (낸것.한일.문단서식) {
      const 여백맞는게있나 = findAll(머리.root, 'hh:paraPr').some((pp) => {
        const sw = firstChildNamed(pp, 'hp:switch');
        if (!sw) return false;
        const kase = firstChildNamed(sw, 'hp:case');
        const m = kase && firstChildNamed(kase, 'hh:margin');
        const left = m && firstChildNamed(m, 'hc:left');
        return left && Number(getAttr(left, 'value')) === Math.floor(왼쪽여백 / 2);
      });
      if (!여백맞는게있나) 문제.push(`왼쪽 여백 ${왼쪽여백} 이 안 살아남았다`);
      else 확인한것.여백++;

      const 가운데정렬있나 = findAll(머리.root, 'hh:paraPr')
        .some((pp) => {
          // 여기도 `?? {}` 를 쓰고 있었다. `hh:align` 은 늘 있어 안 걸렸을 뿐이다.
          const a = firstChildNamed(pp, 'hh:align');
          return a !== undefined && getAttr(a, 'horizontal') === 'CENTER';
        });
      if (!가운데정렬있나) 문제.push('가운데 정렬이 사라졌다');
      else 확인한것.정렬++;
    }

    // 강조 — 빨간 글자모양
    if (낸것.한일.강조) {
      const 빨간게있나 = findAll(머리.root, 'hh:charPr').some((cp) => getAttr(cp, 'textColor') === '#C00000');
      if (!빨간게있나) 문제.push('강조한 빨간 글자모양이 사라졌다');
      else 확인한것.강조++;
    }

    // ── 남은 일곱 ─────────────────────────────────────────────────────
    //
    // **갈래마다 따로 센다.** 한꺼번에 세면 하나만 살아도 통과한다.
    if (낸것.한일.각주 || 낸것.한일.미주) {
      for (const [무엇, 태그, 번호종류] of [
        ['각주', 'hp:footNote', 'FOOTNOTE'], ['미주', 'hp:endNote', 'ENDNOTE'],
      ]) {
        if (!낸것.한일[무엇]) continue;
        const 것들 = findAll(구역.root, 태그);
        if (!것들.length) { 문제.push(`${무엇}가 한글을 넘으며 사라졌다`); continue; }
        // **번호가 살아 있나.** 주는 남았는데 hp:autoNum 이 없으면
        // 본문에도 주석 칸에도 숫자가 없어 무엇이 어느 주인지 못 읽는다.
        const 번호살음 = 것들.some((e) => findAll(e, 'hp:autoNum')
          .some((n) => getAttr(n, 'numType') === 번호종류));
        const 글살음 = 것들.some((e) => textOf(e).includes(`수용시험 ${무엇}다.`));
        if (!번호살음) 문제.push(`${무엇}는 남았는데 번호(hp:autoNum)가 사라졌다`);
        else if (!글살음) 문제.push(`${무엇}는 남았는데 안에 든 글이 사라졌다`);
        else 확인한것[무엇]++;
      }
    }

    if (낸것.한일.메모) {
      const 시작 = findAll(구역.root, 'hp:fieldBegin')
        .filter((e) => getAttr(e, 'type') === 'MEMO');
      const 끝들 = findAll(구역.root, 'hp:fieldEnd');
      if (!시작.length) 문제.push('메모가 한글을 넘으며 사라졌다');
      else if (!시작.some((b2) => 끝들.some((e) => getAttr(e, 'beginIDRef') === getAttr(b2, 'id')))) {
        문제.push('메모의 fieldEnd 짝이 끊겼다');
      } else if (!시작.some((b2) => textOf(firstChildNamed(b2, 'hp:subList') ?? b2)
        .includes('수용시험 메모다'))) {
        문제.push('메모는 남았는데 몸통 글이 사라졌다');
      } else 확인한것.메모++;
    }

    if (낸것.한일.수식) {
      const 식들 = findAll(구역.root, 'hp:equation');
      if (!식들.length) 문제.push('수식이 한글을 넘으며 사라졌다');
      else if (!식들.some((e) => textOf(firstChildNamed(e, 'hp:script') ?? e).includes('over'))) {
        문제.push('수식은 남았는데 hp:script 가 사라졌다');
      } else 확인한것.수식++;
    }

    if (낸것.한일.다단) {
      const c2 = findAll(구역.root, 'hp:colPr')[0];
      if (!c2 || getAttr(c2, 'colCount') !== '2') 문제.push('다단이 한 단으로 돌아갔다');
      else 확인한것.다단++;
    }

    if (낸것.한일.개요) {
      // **`?? {}` 를 getAttr 에 넘기면 터진다.** 빈 객체엔 `attrs` 가 없다.
      // `hh:align` 은 문단모양마다 늘 있어 그 버릇이 여태 안 걸렸는데,
      // `hh:heading` 은 없는 것이 있다 — 스물다섯 편이 한꺼번에 터졌다.
      const 개요인가 = (pp) => {
        const h = firstChildNamed(pp, 'hh:heading');
        return h !== undefined && getAttr(h, 'type') === 'OUTLINE';
      };
      const 개요있나 = findAll(머리.root, 'hh:paraPr').some(개요인가);
      // 요소는 한글 기본틀에도 열 벌이 있다. **문단이 실제로 그것을 가리키나**까지 본다.
      const 쓰는문단있나 = (() => {
        const 개요id = new Set(findAll(머리.root, 'hh:paraPr')
          .filter(개요인가).map((pp) => getAttr(pp, 'id')));
        return findAll(구역.root, 'hp:p').some((x) => 개요id.has(getAttr(x, 'paraPrIDRef')));
      })();
      if (!개요있나) 문제.push('개요 문단모양이 사라졌다');
      else if (!쓰는문단있나) 문제.push('개요 문단모양은 남았는데 그것을 쓰는 문단이 없다');
      else 확인한것.개요++;
    }

    if (낸것.한일.바탕쪽) {
      // **부품으로 남아 있나.** secPr 안에서 찾으면 늘 없다 — 거기 있는 것은
      // 가리키는 표 하나뿐이다.
      const 부품들 = c.바탕쪽이름들();
      const sp = findFirst(구역.root, 'hp:secPr');
      const 가리킴 = sp === undefined ? [] : childrenNamed(sp, 'hp:masterPage');
      if (!부품들.length) 문제.push('바탕쪽 부품이 한글을 넘으며 사라졌다');
      else if (!가리킴.length) 문제.push('바탕쪽 부품은 남았는데 구역이 안 가리킨다');
      else if (getAttr(sp, 'masterPageCnt') !== '1') 문제.push('masterPageCnt 가 안 맞는다');
      else {
        const 안글 = parseXml(c.readText(부품들[0])).root;
        if (!findAll(안글, 'hp:t').map((t) => textOf(t)).join('').includes('수용시험 바탕쪽')) {
          문제.push('바탕쪽은 남았는데 글이 사라졌다');
        } else 확인한것.바탕쪽++;
      }
    }

    // 표
    if (낸것.한일.표) {
      const t = findFirst(구역.root, 'hp:tbl');
      if (t) {
        const 첫셀 = findAll(t, 'hp:tc')[0];
        const cm = 첫셀 && firstChildNamed(첫셀, 'hp:cellMargin');
        if (getAttr(첫셀, 'hasMargin') !== '1') 문제.push('셀 여백 표시(hasMargin)가 꺼졌다');
        else if (Number(getAttr(cm, 'left')) !== 셀여백) 문제.push('셀 여백 값이 안 살아남았다');
        else 확인한것.셀여백++;

        if (getAttr(t, 'repeatHeader') !== '1') 문제.push('머리행 반복이 꺼졌다');
        else 확인한것.머리행++;
      }
    }

    // 꼭 돼야 하는 것: 글 바꾸기·글자 서식·문단 서식.
    // 강조는 거절해도 된다 (표·그림과 같은 런이면 쪼개면 안 된다).
    for (const [무엇, 됐나] of Object.entries(낸것.꼭돼야하는것)) {
      if (!됐나) 문제.push(`${무엇} 가 안 됐다`);
    }

    if (문제.length) 실패.push([이름, 문제.join(' / ')]);
    else 통과++;
  } catch (e) {
    실패.push([이름, `한글이 뱉은 걸 우리가 못 읽는다: ${e.message.split('\n')[0]}`]);
  }
}

console.log(`기준 파일 ${목록.length}편을 **문서 계층으로 고쳐** 한글에 먹였다`);
console.log('  한글이 뱉은 것에서 확인한 것:');
for (const [k, v] of Object.entries(확인한것)) console.log(`    ${k.padEnd(8)} ${v}편`);
const 거절들 = [...한것].filter(([, v]) => v.거절);
if (거절들.length) {
  console.log(`  강조를 거절한 문서 ${거절들.length}편 (거절은 실패가 아니다):`);
  const 까닭 = new Map();
  for (const [, v] of 거절들) 까닭.set(v.거절, (까닭.get(v.거절) ?? 0) + 1);
  for (const [k, n] of 까닭) console.log(`    ${n}편 — ${k}`);
}
console.log(`통과 ${통과} / 실패 ${실패.length}`);
for (const [이름, 왜] of 실패) console.log(`  ✗ ${이름}: ${왜}`);
process.exit(실패.length ? 1 : 0);
