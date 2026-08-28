"""
PDF 두 개를 **픽셀로** 견준다.

왜 픽셀인가: XML 이 맞고 우리 검사도 통과했는데 눈으로 보니 틀린 적이
여러 번 있었다 (표 본문이 남색이 됨, 상자가 줄마다 갈라짐).
"안 건드린 곳은 한 픽셀도 안 달라야 한다" 는 것만큼 확실한 잣대가 없다.

    python 검증/픽셀대조.py <가.pdf> <나.pdf> <낼곳.json> [dpi]

내놓는 것 (JSON):
    쪽수      [가, 나]
    쪽[]      번호 / 다른픽셀 / 전체픽셀 / 비율 / 상자[x0,y0,x1,y1] (pt 단위)
    같나      쪽 수가 같고 다른 픽셀이 하나도 없나
"""
import sys, json
import pymupdf


def 그림들(pdf, dpi):
    d = pymupdf.open(pdf)
    나온것 = []
    for p in d:
        pm = p.get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
        나온것.append((pm.width, pm.height, pm.samples))
    return 나온것


def 견주기(a, b, dpi):
    aw, ah, ab = a
    bw, bh, bb = b
    if (aw, ah) != (bw, bh):
        return {"크기가다르다": [[aw, ah], [bw, bh]], "다른픽셀": aw * ah, "전체픽셀": aw * ah,
                "비율": 1.0, "상자": None}
    다름 = 0
    x0 = y0 = 10 ** 9
    x1 = y1 = -1
    for y in range(ah):
        줄가 = ab[y * aw:(y + 1) * aw]
        줄나 = bb[y * bw:(y + 1) * bw]
        if 줄가 == 줄나:
            continue
        for x in range(aw):
            # 렌더가 미세하게 흔들릴 수 있다. 8 단계까지는 같은 것으로 본다.
            if abs(줄가[x] - 줄나[x]) <= 8:
                continue
            다름 += 1
            if x < x0: x0 = x
            if x > x1: x1 = x
            if y < y0: y0 = y
            if y > y1: y1 = y
    상자 = None
    if x1 >= 0:
        k = 72.0 / dpi
        상자 = [round(x0 * k, 1), round(y0 * k, 1), round(x1 * k, 1), round(y1 * k, 1)]
    return {"다른픽셀": 다름, "전체픽셀": aw * ah, "비율": round(다름 / (aw * ah), 6), "상자": 상자}


def 하기(가, 나, dpi=100):
    A = 그림들(가, dpi)
    B = 그림들(나, dpi)
    쪽 = []
    for i in range(min(len(A), len(B))):
        r = 견주기(A[i], B[i], dpi)
        r["번호"] = i + 1
        쪽.append(r)
    return {"쪽수": [len(A), len(B)], "쪽": 쪽,
            "같나": len(A) == len(B) and all(p["다른픽셀"] == 0 for p in 쪽)}


def 한쪽씩(가, 가쪽, 나, 나쪽, dpi=100):
    """두 PDF 의 **한 쪽씩**을 견준다 (원본 5쪽 ↔ 재현 1쪽).

    재현이 얼마나 닮았나를 하나의 수로 내려면 이게 필요하다.
    글자만 맞는지 보는 것으로는 "디자인이 충실한가" 에 답할 수 없다 —
    글은 똑같은데 표 서식·글자 크기·색이 다 빠져 밋밋한 쪽이 나올 수 있다.
    실제로 그랬다.
    """
    A = 그림들(가, dpi)
    B = 그림들(나, dpi)
    if 가쪽 >= len(A) or 나쪽 >= len(B):
        return {"닮음": 0.0, "왜": "그런 쪽이 없다"}
    r = 견주기(A[가쪽], B[나쪽], dpi)
    # 글자가 있는 자리(검은 픽셀)를 기준으로 본다 — 흰 여백까지 세면 다 90%가 넘는다
    aw, ah, ab = A[가쪽]
    먹 = sum(1 for v in ab if v < 200) or 1
    return {"닮음": round(1 - min(1.0, r["다른픽셀"] / 먹), 4),
            "다른픽셀": r["다른픽셀"], "원본먹픽셀": 먹}


if __name__ == "__main__":
    가, 나, 낼곳 = sys.argv[1], sys.argv[2], sys.argv[3]
    dpi = int(sys.argv[4]) if len(sys.argv) > 4 else 100
    if len(sys.argv) > 6:
        # 한 쪽씩: 픽셀대조.py 가.pdf 나.pdf 낼곳 dpi 가쪽 나쪽
        나온것 = 한쪽씩(가, int(sys.argv[5]), 나, int(sys.argv[6]), dpi)
    else:
        나온것 = 하기(가, 나, dpi)
    with open(낼곳, "w", encoding="utf-8") as f:
        json.dump(나온것, f, ensure_ascii=False)
