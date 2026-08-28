"""
**디자인이 얼마나 닮았나**를 잰다.

## 왜 픽셀 맞대기로는 안 되나

원본 쪽과 재현 쪽을 픽셀로 겹쳐 보면, 글이 세로로 한 줄만 밀려도
글자마다 어긋나 닮음이 0 이 된다. 실제로 그랬다 —
글자가 706/708 로 거의 같은 쪽인데 픽셀 닮음은 0.0 이 나왔다.
그건 **정렬을 잰 것이지 디자인을 잰 것이 아니다.**

## 그래서 무엇을 재나

디자인이 살아 있다는 것은 이런 뜻이다. 다섯 가지를 따로 재고 따로 적는다 —
하나로 뭉뚱그리면 무엇이 빠졌는지 알 수 없다.

  글자크기  큰 제목은 크게, 잔글씨는 작게 — 크기 갈래가 원본만큼 있나
  굵기      굵은 글자가 원본만큼 있나
  색        빨강·파랑 같은 강조색이 살아 있나
  가로자리  가운데맞춤·들여쓰기·표 열 자리 — 먹이 가로로 어디에 앉나
  선        표·상자 테두리가 그만큼 그어졌나

세로로 밀리는 것에는 무디고, **서식이 빠지는 것에는 예민하다.**

    python 검증/디자인닮음.py <원본.pdf> <원본쪽> <재현.pdf> <재현쪽> <낼곳.json>
"""
import sys, json
import pymupdf


def 훑기(pdf, 쪽번호):
    """한 쪽에서 서식 정보를 뽑는다."""
    d = pymupdf.open(pdf)
    if 쪽번호 >= d.page_count:
        return None
    p = d[쪽번호]
    W, H = p.rect.width, p.rect.height

    크기, 굵기, 색 = {}, {"굵음": 0, "보통": 0}, {}
    가로 = [0.0] * 64

    for 블록 in p.get_text("dict")["blocks"]:
        for 줄 in 블록.get("lines", []):
            for 조각 in 줄.get("spans", []):
                글 = 조각.get("text", "")
                n = len(글.strip())
                if n == 0:
                    continue
                # 크기는 0.5pt 로 뭉갠다 — 렌더가 미세하게 흔들린다
                s = round(조각["size"] * 2) / 2
                크기[s] = 크기.get(s, 0) + n
                이름 = 조각.get("font", "")
                굵기["굵음" if ("Bold" in 이름 or (조각.get("flags", 0) & 16)) else "보통"] += n
                색[조각.get("color", 0)] = 색.get(조각.get("color", 0), 0) + n
                # 가로 자리 — 글 조각이 걸친 칸에 글자 수를 나눠 담는다
                x0, x1 = 조각["bbox"][0], 조각["bbox"][2]
                가0 = max(0, min(63, int(x0 / W * 64)))
                가1 = max(0, min(63, int(x1 / W * 64)))
                몫 = n / (가1 - 가0 + 1)
                for i in range(가0, 가1 + 1):
                    가로[i] += 몫

    # 선 — 얇은 것만 (한글은 테두리를 칠해서 그리기도 한다)
    선 = 0
    for 그림 in p.get_drawings():
        r = 그림["rect"]
        if min(r.width, r.height) < 3 and max(r.width, r.height) > 8:
            선 += 1

    return {"크기": 크기, "굵기": 굵기, "색": 색, "가로": 가로, "선": 선,
            "글자수": sum(크기.values())}


def 겹침(가, 나):
    """두 분포가 얼마나 겹치나 (0~1). 총변이거리의 반대."""
    ga, gb = sum(가.values()), sum(나.values())
    if ga == 0 or gb == 0:
        return 0.0 if ga != gb else 1.0
    열쇠 = set(가) | set(나)
    return round(sum(min(가.get(k, 0) / ga, 나.get(k, 0) / gb) for k in 열쇠), 4)


def 재기(원본pdf, 원본쪽, 재현pdf, 재현쪽):
    a = 훑기(원본pdf, 원본쪽)
    b = 훑기(재현pdf, 재현쪽)
    if a is None or b is None:
        return {"왜": "그런 쪽이 없다"}

    잰것 = {
        "글자크기": 겹침(a["크기"], b["크기"]),
        "굵기": 겹침(a["굵기"], b["굵기"]),
        "색": 겹침(a["색"], b["색"]),
        "가로자리": 겹침({i: v for i, v in enumerate(a["가로"])},
                     {i: v for i, v in enumerate(b["가로"])}),
    }
    # 선은 갯수 비로 본다. 둘 다 0 이면 볼 것이 없으니 만점.
    if a["선"] == 0 and b["선"] == 0:
        잰것["선"] = 1.0
    else:
        잰것["선"] = round(min(a["선"], b["선"]) / max(a["선"], b["선"], 1), 4)

    잰것["닮음"] = round(sum(잰것.values()) / len(잰것), 4)
    잰것["원본"] = {"크기갈래": len(a["크기"]), "굵은글자": a["굵기"]["굵음"],
                  "색갈래": len(a["색"]), "선": a["선"], "글자수": a["글자수"]}
    잰것["재현"] = {"크기갈래": len(b["크기"]), "굵은글자": b["굵기"]["굵음"],
                  "색갈래": len(b["색"]), "선": b["선"], "글자수": b["글자수"]}
    return 잰것


if __name__ == "__main__":
    원본pdf, 원본쪽, 재현pdf, 재현쪽, 낼곳 = (
        sys.argv[1], int(sys.argv[2]), sys.argv[3], int(sys.argv[4]), sys.argv[5])
    with open(낼곳, "w", encoding="utf-8") as f:
        json.dump(재기(원본pdf, 원본쪽, 재현pdf, 재현쪽), f, ensure_ascii=False)
