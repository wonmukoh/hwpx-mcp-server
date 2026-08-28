# -*- coding: utf-8 -*-
"""
두 PDF 쪽을 **자로 대 본다.**

"비슷해 보인다" 는 검사가 아니다. 숫자로 말한다:

  - 글자가 놓인 자리(왼쪽 끝·오른쪽 끝·글 상자 너비)
  - 줄 수와 줄 사이 간격
  - 낱말이 같은가 (순서까지)
  - 줄마다 시작 x 가 얼마나 어긋나나

    python 검증/대조하기.py <원본.pdf> <원본쪽> <재현.pdf> <재현쪽>
"""
import sys
import os

import pymupdf

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def 쪽재기(pdf, 쪽번호):
    문서 = pymupdf.open(pdf)
    쪽 = 문서[쪽번호 - 1]
    낱말들 = 쪽.get_text("words")

    # 줄로 묶는다 (y 가 비슷하면 같은 줄)
    줄들 = {}
    for x0, y0, x1, y1, 말, *_ in 낱말들:
        열쇠 = round(y0, 0)
        줄들.setdefault(열쇠, []).append((x0, x1, 말))

    정리 = []
    for y in sorted(줄들):
        칸 = sorted(줄들[y], key=lambda w: w[0])
        정리.append({
            "y": y,
            "왼쪽": round(min(w[0] for w in 칸), 1),
            "오른쪽": round(max(w[1] for w in 칸), 1),
            "글": " ".join(w[2] for w in 칸),
        })

    결과 = {
        "쪽크기": (round(쪽.rect.width, 1), round(쪽.rect.height, 1)),
        "줄수": len(정리),
        "낱말수": len(낱말들),
        "줄": 정리,
        "글": "".join(w[4] for w in 낱말들),
    }
    문서.close()
    return 결과


def 대조(a, b):
    말 = []
    말.append(f"쪽 크기   원본 {a['쪽크기']}  재현 {b['쪽크기']}"
              + ("  ○" if a["쪽크기"] == b["쪽크기"] else "  ✗ 다르다"))
    말.append(f"줄 수     원본 {a['줄수']}  재현 {b['줄수']}")
    말.append(f"낱말 수   원본 {a['낱말수']}  재현 {b['낱말수']}")

    # 글 상자 — 모든 줄의 왼쪽 끝 가운데 가장 왼쪽, 오른쪽 끝 가운데 가장 오른쪽
    def 상자(x):
        return (min(l["왼쪽"] for l in x["줄"]), max(l["오른쪽"] for l in x["줄"]))
    ax, bx = 상자(a), 상자(b)
    말.append(f"글 왼쪽   원본 {ax[0]}  재현 {bx[0]}   차이 {round(bx[0] - ax[0], 1)}pt")
    말.append(f"글 오른쪽 원본 {ax[1]}  재현 {bx[1]}   차이 {round(bx[1] - ax[1], 1)}pt")
    말.append(f"글 너비   원본 {round(ax[1] - ax[0], 1)}  재현 {round(bx[1] - bx[0], 1)}"
              f"   차이 {round((bx[1] - bx[0]) - (ax[1] - ax[0]), 1)}pt")

    # 줄 간격 — **가장 흔한 틈**을 쓴다.
    #
    # 처음엔 중간값을 썼는데 무뎠다. 한 쪽에는 갈래가 다른 틈이 섞여 있다:
    # 한 문단 안 줄 사이(16pt), 문단과 문단 사이(24pt), 표 줄 사이…
    # 어느 갈래가 많으냐에 따라 중간값이 이 무리에서 저 무리로 건너뛴다.
    # 그래서 "16 / 24" 같은 값이 나왔는데, 줄 간격이 틀린 게 아니라
    # **내가 다른 것을 잰 것**이었다.
    #
    # 줄 간격이라 하면 한 문단 안 줄 사이를 말한다 — 가장 자주 나오는 틈이다.
    def 간격(x):
        ys = [l["y"] for l in x["줄"]]
        틈 = [round((ys[i + 1] - ys[i]) * 2) / 2 for i in range(len(ys) - 1)]
        # 5pt 아래는 줄 사이 틈이 아니다 — 위첨자·같은 줄 안의 조각이 만든 것이다.
        # 안 거르면 그런 잔틈이 최빈값을 먹어 "원본 줄 간격 2pt" 같은 헛것이 나온다.
        틈 = [t for t in 틈 if t >= 5]
        if not 틈:
            return 0
        셈 = {}
        for t in 틈:
            셈[t] = 셈.get(t, 0) + 1
        # 같은 수면 좁은 쪽 — 문단 사이 틈이 아니라 줄 사이 틈을 고른다
        return min(셈, key=lambda t: (-셈[t], t))
    말.append(f"줄 간격   원본 {간격(a)}pt  재현 {간격(b)}pt")

    # 글자가 같나 (공백 빼고)
    a글 = a["글"].replace(" ", "")
    b글 = b["글"].replace(" ", "")
    if a글 == b글:
        말.append("글자      ○ 똑같다")
    else:
        # 어디서 갈리나
        i = 0
        while i < min(len(a글), len(b글)) and a글[i] == b글[i]:
            i += 1
        말.append(f"글자      ✗ {i}번째부터 다르다 (원본 {len(a글)}자 / 재현 {len(b글)}자)")
        말.append(f"            원본: «{a글[i:i + 40]}»")
        말.append(f"            재현: «{b글[i:i + 40]}»")

    return "\n".join(말)


def main():
    if len(sys.argv) < 5:
        print(__doc__)
        return 2
    a = 쪽재기(sys.argv[1], int(sys.argv[2]))
    b = 쪽재기(sys.argv[3], int(sys.argv[4]))
    print(f"원본 {os.path.basename(sys.argv[1])} {sys.argv[2]}쪽  ↔  "
          f"재현 {os.path.basename(sys.argv[3])} {sys.argv[4]}쪽\n")
    print(대조(a, b))
    return 0


if __name__ == "__main__":
    sys.exit(main())
