/**
 * **굽는 동안 `dist` 가 비면 안 된다.**
 *
 * 예전에는 `dist` 를 먼저 지우고 그 자리에 구웠다. 재 보니 **굽는 시간의 95%**
 * 동안 빈 자리였다(1,639ms 가운데 1,558ms).
 *
 * 밖에서 읽는 쪽이 그 창에 걸린다 —
 *
 *   - 앱에 번들해 넣는 쪽이 「2분 넘게 여섯 번 내리」 걸렸다고 알려 왔다
 *     (검증 한 바퀴가 dist 를 여섯 번 굽는다)
 *   - **이 폴더를 가리키는 MCP 설정**도 그때 서버를 못 띄운다
 *   - `npx` 로 쓰는 쪽도 같다
 *
 * 이제 옆에 굽고 마지막에 이름만 바꾼다. 빈 창이 밀리초로 줄었다.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const 뿌리 = path.resolve(__dirname, '../../..');
const 볼것 = path.join(뿌리, 'dist', 'packages', 'server', 'src', 'index.js');

/** 지금 남아 있는 굽는 자리들 */
function 찌꺼기들(): Set<string> {
  return new Set(fs.readdirSync(뿌리)
    .filter((n) => n.startsWith('dist.굽는중.') || n.startsWith('dist.치움.')));
}

/** 굽는 내내 5ms 마다 들여다보며 몇 번이나 비어 있나 센다 */
function 굽는동안재기(): Promise<{
  빈횟수: number; 총횟수: number; 코드: number | null; 새찌꺼기: string[]; 말: string;
}> {
  return new Promise((풀기) => {
    const 앞 = 찌꺼기들();
    let 빈횟수 = 0;
    let 총횟수 = 0;
    const 재기 = setInterval(() => {
      총횟수++;
      if (!fs.existsSync(볼것)) 빈횟수++;
    }, 5);
    // **굽기가 실패하면 까닭을 보여야 한다.** stdio 를 버리면
    // 「실패했다」 만 알고 왜인지는 영영 모른다.
    let 말 = '';
    const p = spawn(process.execPath, [path.join(뿌리, '검증', '빌드.mjs'), '--배포'],
      { cwd: 뿌리, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => { 말 += d; });
    p.stderr.on('data', (d) => { 말 += d; });
    p.on('exit', (코드) => {
      clearInterval(재기);
      // **제 굽기가 새로 남긴 것만** 센다. 검증 한 바퀴에는 일부러 깨뜨린 굽기도
      // 있어서(고장 내보기) 폴더에 남의 찌꺼기가 있는 게 정상이다.
      풀기({
        빈횟수, 총횟수, 코드, 말: 말.slice(-600),
        새찌꺼기: [...찌꺼기들()].filter((n) => !앞.has(n)),
      });
    });
  });
}

describe('굽는 동안에도 dist 를 읽을 수 있다', () => {
  it('**한 번도 안 빈다**', async () => {
    const r = await 굽는동안재기();
    expect(r.코드, `굽기가 깨졌다:
${r.말}`).toBe(0);
    expect(r.총횟수, '너무 빨리 끝나 들여다볼 틈이 없었다면 못 재는 것이다')
      .toBeGreaterThan(20);
    expect(r.빈횟수,
      `굽는 동안 dist 가 ${r.빈횟수}/${r.총횟수}번 비었다 — `
      + '밖에서 읽는 쪽이 그때 걸린다. 옆에 굽고 이름만 바꿔라')
      .toBe(0);
  }, 180_000);

  it('**제 굽기가 찌꺼기를 안 남긴다**', async () => {
    const r = await 굽는동안재기();
    expect(r.코드, `굽기가 깨졌다:
${r.말}`).toBe(0);
    expect(r.새찌꺼기,
      `굽고 나서 ${r.새찌꺼기.join(', ')} 가 남았다 — 굽는 자리를 안 치웠다`)
      .toEqual([]);
  }, 180_000);
});
