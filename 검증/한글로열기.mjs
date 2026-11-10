/**
 * **한글이 이 파일을 여나 — 한 파일씩, 한글도 하나씩, 시간을 정해 놓고 잰다.**
 *
 *   node 검증/한글로열기.mjs <파일…> [--그래도] [--제한 <초>] [--켜둔한글괜찮음]
 *
 * 그때그때 PowerShell 을 짜서 재지 말고 이것을 쓴다. 2026-11-06 에 그렇게 짠 스크립트가 표 칸이 겹친
 * 파일에서 멈춰, 사용자의 한글까지 한 시간 넘게 막았다 (`자료/실측.md` 40항).
 *
 *   - **표 칸이 겹친 파일은 안 연다.** 사고 때 멈춘 파일이 이 꼴이다. 겹침이 원인이라고 증명한 것은 아니다.
 *     또 열어 볼 값이 없어서 막는다. `--그래도` 로만 연다.
 *   - 파일마다 새 한글을 띄우므로 앞 파일의 상태가 다음 판정에 안 묻는다.
 *   - 제한을 넘기면 그 한글만 닫고 다음 파일로 간다 (`한글지키기.mjs`).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { 한글돌리기, 한글띄우기, 한글띄워도되나 } from './한글지키기.mjs';

const 뿌리 = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const 인자 = process.argv.slice(2);
const 그래도 = 인자.includes('--그래도');
const 강제없이 = 인자.includes('--강제없이'); // forceopen 없이 — 사람이 파일을 여는 쪽에 더 가깝다
const 제한자리 = 인자.indexOf('--제한');
const 제한초 = 제한자리 >= 0 ? Number(인자[제한자리 + 1]) : 60;
const 파일들 = 인자.filter((x, i) => !x.startsWith('--') && (제한자리 < 0 || i !== 제한자리 + 1));
if (파일들.length === 0 || !(제한초 > 0)) { console.error('쓰는 법: node 검증/한글로열기.mjs <파일…> [--그래도] [--제한 <초>] [--켜둔한글괜찮음]'); process.exit(2); }

const 막힘 = 한글띄워도되나({ 켜둔한글괜찮음: 인자.includes('--켜둔한글괜찮음') });
if (막힘) { console.error(`✗ ${막힘}`); process.exit(2); }

const B = pathToFileURL(path.join(뿌리, '검증', '.빌드전체', 'packages', 'server', 'src', 'index.js')).href;
const { 문서방, 도구부르기 } = await import(B);
const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), 'hwpx-열기-'));

/** 표 칸이 겹쳤나. 우리 저장 검사가 같은 것을 거절한다 — 원본은 임시 자리로만 낸다 */
async function 표가겹쳤나(파일) {
  const 방 = new 문서방();
  const o = await 도구부르기('open_document', { path: 파일 }, 방);
  if (o.isError) return undefined;
  const s = await 도구부르기('save_document', { doc_id: o.structuredContent.doc_id, path: path.join(임시, '검사.hwpx'), overwrite: true }, 방);
  return s.isError && /겹쳐/.test(s.content?.[0]?.text ?? '');
}

const ps = [
  "$ErrorActionPreference = 'Stop'",
  한글띄우기,
  'try { $hwp.XHwpWindows.Item(0).Visible = $false } catch {}',
  'try { $hwp.SetMessageBoxMode(0x20000) | Out-Null } catch {}',
  "$reg = $hwp.RegisterModule('FilePathCheckDLL','FilePathCheckerModule')",
  `$r = $hwp.Open($env:HWPX_OPEN_PATH, '', '${강제없이 ? '' : 'forceopen:true'}')`,
  "$chars = 0; if ($r) { try { $chars = ([string]$hwp.GetTextFile('UNICODE','')).Length } catch { $chars = -1 } }",
  "'open=' + $r + ' pages=' + $hwp.PageCount + ' chars=' + $chars + ' reg=' + $reg",
  'try { $hwp.Clear(1) | Out-Null } catch {}',
  '$hwp.Quit()',
].join('\n');

let 못연것 = 0;
for (const 파일 of 파일들) {
  const 이름 = path.basename(파일);
  if (!그래도 && await 표가겹쳤나(파일)) {
    console.log(`  건너뜀 ${이름} — 표 칸이 겹친다. 한글이 멈출 수 있다 (--그래도 로만 연다)`);
    못연것++;
    continue;
  }
  const 시작 = Date.now();
  try {
    const 말 = 한글돌리기('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
      encoding: 'utf8', timeout: 제한초 * 1000, env: { HWPX_OPEN_PATH: path.resolve(파일) }, stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    console.log(`  ${이름}: ${말} (${((Date.now() - 시작) / 1000).toFixed(1)}초)`);
    if (!/open=True/.test(말)) 못연것++;
  } catch (e) {
    console.log(`  ${이름}: **${제한초}초 안에 안 끝나거나 실패** — ${String(e.stderr ?? e.message).trim().slice(0, 120)}`);
    못연것++;
  }
}
fs.rmSync(임시, { recursive: true, force: true });
process.exit(못연것 ? 1 : 0);
