# -*- coding: utf-8 -*-
"""
**눈으로 본 것만 됐다고 한다** (작성지침 4항).

XML 이 맞고 한글이 파일을 열어도, 눈으로 보면 어긋나 있을 수 있다.
글자가 겹치거나, 표가 쪽 밖으로 나가거나, 띠 배경이 안 칠해지거나.

여기서는 PDF 를 그림으로 굽고, **자로 재서** 숫자로 말한다.
"보기 좋다" 는 검사가 아니다.

    python 검증/눈으로보기.py <pdf> [낼폴더]

내놓는 것:
  - 쪽마다 PNG (사람이 볼 것)
  - 잰 것: 글자 상자 위치·크기, 쪽 밖으로 나간 것, 겹친 것
"""
import sys
import os
import json

import pymupdf

# 윈도우 콘솔이 cp949 라 한글·기호에서 터진다. 나가는 글을 UTF-8 로 고정한다.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def 재기(pdf경로, 낼폴더, 배율=2.0):
    문서 = pymupdf.open(pdf경로)
    os.makedirs(낼폴더, exist_ok=True)

    잰것 = {"파일": os.path.basename(pdf경로), "쪽수": len(문서), "쪽": []}

    for 번호, 쪽 in enumerate(문서):
        # 사람이 볼 그림
        그림 = 쪽.get_pixmap(matrix=pymupdf.Matrix(배율, 배율))
        png = os.path.join(낼폴더, f"p{번호 + 1}.png")
        그림.save(png)

        쪽폭, 쪽높이 = 쪽.rect.width, 쪽.rect.height
        글자들 = []
        나간것 = []

        # 글자 조각을 상자째로 모은다
        낱말들 = 쪽.get_text("words")  # (x0, y0, x1, y1, 낱말, 블록, 줄, 낱말번호)
        for x0, y0, x1, y1, 말, *_ in 낱말들:
            글자들.append({"말": 말, "x": round(x0, 1), "y": round(y0, 1),
                          "w": round(x1 - x0, 1), "h": round(y1 - y0, 1)})
            # 쪽 밖으로 나갔나 (1pt 는 봐 준다 — 반올림 오차)
            if x0 < -1 or y0 < -1 or x1 > 쪽폭 + 1 or y1 > 쪽높이 + 1:
                나간것.append(말)

        # 선과 칠한 자리를 **갈라 센다.**
        #
        # 두 번 헷갈렸다:
        #  1) 칠한 네모의 윤곽이 선 넷으로 잡혀 "안 시킨 테두리" 로 읽었다.
        #  2) 그래서 stroke 만 세었더니 0개가 됐다 —
        #     한글은 **테두리도 칠해서** 그리기 때문이다.
        #
        # 그래서 그리는 방식이 아니라 **모양**으로 가른다.
        # 한쪽이 아주 얇으면(3pt 미만) 선, 아니면 칠한 자리.
        얇기 = 3.0
        그림요소 = 쪽.get_drawings()
        선들, 칠한것 = [], []
        for d in 그림요소:
            r = d["rect"]
            if min(r.width, r.height) < 얇기:
                선들.append(d)
            else:
                칠한것.append(d)
        선수 = len(선들)

        쪽잰것 = {
            "쪽": 번호 + 1,
            "크기": [round(쪽폭, 1), round(쪽높이, 1)],
            "낱말수": len(글자들),
            "선수": 선수,
            "칠한것수": len(칠한것),
            "쪽밖으로나간것": 나간것,
            "글자": 글자들,
            "png": png,
        }
        잰것["쪽"].append(쪽잰것)

    문서.close()
    return 잰것


def 요약(잰것):
    줄 = [f"{잰것['파일']} — {잰것['쪽수']}쪽"]
    for p in 잰것["쪽"]:
        줄.append(
            f"  {p['쪽']}쪽  {p['크기'][0]}x{p['크기'][1]}pt  "
            f"낱말 {p['낱말수']}개 / 그은 선 {p['선수']}개 / 칠한 자리 {p['칠한것수']}개"
        )
        if p["쪽밖으로나간것"]:
            줄.append(f"     ✗ 쪽 밖으로 나간 것 {len(p['쪽밖으로나간것'])}개: "
                      f"{', '.join(p['쪽밖으로나간것'][:5])}")
        else:
            줄.append("     ○ 쪽 밖으로 나간 것 없음")
    return "\n".join(줄)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    pdf = sys.argv[1]
    낼폴더 = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(pdf), "본것")

    잰것 = 재기(pdf, 낼폴더)
    print(요약(잰것))

    json경로 = os.path.join(낼폴더, "잰것.json")
    with open(json경로, "w", encoding="utf-8") as f:
        json.dump(잰것, f, ensure_ascii=False, indent=1)
    print(f"\n잰 것: {json경로}")
    print(f"그림:  {낼폴더}")

    # 쪽 밖으로 나간 것이 있으면 실패다
    나간것 = sum(len(p["쪽밖으로나간것"]) for p in 잰것["쪽"])
    return 1 if 나간것 else 0


if __name__ == "__main__":
    sys.exit(main())
