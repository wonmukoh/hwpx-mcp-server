/**
 * 조판이 쓰는 **XML 조각.**
 *
 * 이 파일은 손으로 고치지 않는다. `node 검증/조각굽기.mjs` 가 굽는다.
 * 조각은 전부 **한글이 저장한 문서에서 오려 낸 것**이다 —
 * 손으로 짜면 빠진 자식이 생기고, 한글은 그걸 알려 주지 않고 그 뒤를 무시한다.
 *
 * 줄 배치(`hp:linesegarray`)는 뺐다. 한글이 열 때 다시 계산한다.
 */

/** 글 한 줄. 런 하나 · 글자 칸 하나 · 줄 배치 없음 */
export const 문단 = "<hp:p id=\"0\" paraPrIDRef=\"0\" styleIDRef=\"0\" pageBreak=\"0\" columnBreak=\"0\" merged=\"0\"><hp:run charPrIDRef=\"0\"><hp:t></hp:t></hp:run></hp:p>";

/** 표. sz·pos·outMargin·inMargin 만 있고 줄은 없다 */
export const 표뼈대 = "<hp:tbl id=\"0\" zOrder=\"0\" numberingType=\"TABLE\" textWrap=\"TOP_AND_BOTTOM\" textFlow=\"BOTH_SIDES\" lock=\"0\" dropcapstyle=\"None\" pageBreak=\"CELL\" repeatHeader=\"1\" rowCnt=\"0\" colCnt=\"0\" cellSpacing=\"0\" borderFillIDRef=\"3\" noAdjust=\"0\"><hp:sz width=\"41952\" widthRelTo=\"ABSOLUTE\" height=\"3846\" heightRelTo=\"ABSOLUTE\" protect=\"0\"/><hp:pos treatAsChar=\"0\" affectLSpacing=\"0\" flowWithText=\"1\" allowOverlap=\"0\" holdAnchorAndSO=\"0\" vertRelTo=\"PARA\" horzRelTo=\"COLUMN\" vertAlign=\"TOP\" horzAlign=\"LEFT\" vertOffset=\"0\" horzOffset=\"0\"/><hp:outMargin left=\"283\" right=\"283\" top=\"283\" bottom=\"283\"/><hp:inMargin left=\"510\" right=\"510\" top=\"141\" bottom=\"141\"/></hp:tbl>";

/** 셀 하나. subList·cellAddr·cellSpan·cellSz·cellMargin 다 있다 */
export const 셀 = "<hp:tc name=\"\" header=\"0\" hasMargin=\"0\" protect=\"0\" editable=\"0\" dirty=\"0\" borderFillIDRef=\"3\"><hp:subList id=\"\" textDirection=\"HORIZONTAL\" lineWrap=\"BREAK\" vertAlign=\"CENTER\" linkListIDRef=\"0\" linkListNextIDRef=\"0\" textWidth=\"0\" textHeight=\"0\" hasTextRef=\"0\" hasNumRef=\"0\"><hp:p id=\"0\" paraPrIDRef=\"0\" styleIDRef=\"0\" pageBreak=\"0\" columnBreak=\"0\" merged=\"0\"><hp:run charPrIDRef=\"0\"><hp:t></hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr=\"0\" rowAddr=\"0\"/><hp:cellSpan colSpan=\"1\" rowSpan=\"1\"/><hp:cellSz width=\"13984\" height=\"282\"/><hp:cellMargin left=\"510\" right=\"510\" top=\"141\" bottom=\"141\"/></hp:tc>";

/** 표를 담는 런 */
export const 표런 = "<hp:run charPrIDRef=\"0\"></hp:run>";

/** 쪽 번호 조각. 문단 안 런에 넣으면 한글이 쪽마다 그린다 */
export const 쪽번호 = "<hp:ctrl><hp:pageNum pos=\"BOTTOM_RIGHT\" formatType=\"DIGIT\" sideChar=\"-\"/></hp:ctrl>";

/** 그림 하나. 크기가 일곱 군데에 적혀 있으니 넣을 때 다 맞춰야 한다 */
export const 그림 = "<hp:pic id=\"1177246718\" zOrder=\"0\" numberingType=\"PICTURE\" textWrap=\"TOP_AND_BOTTOM\" textFlow=\"BOTH_SIDES\" lock=\"0\" dropcapstyle=\"None\" href=\"\" groupLevel=\"0\" instid=\"103504895\" reverse=\"0\"><hp:offset x=\"0\" y=\"0\"/><hp:orgSz width=\"9000\" height=\"6000\"/><hp:curSz width=\"0\" height=\"0\"/><hp:flip horizontal=\"0\" vertical=\"0\"/><hp:rotationInfo angle=\"0\" centerX=\"4500\" centerY=\"3000\" rotateimage=\"1\"/><hp:renderingInfo><hc:transMatrix e1=\"1\" e2=\"0\" e3=\"0\" e4=\"0\" e5=\"1\" e6=\"0\"/><hc:scaMatrix e1=\"1\" e2=\"0\" e3=\"0\" e4=\"0\" e5=\"1\" e6=\"0\"/><hc:rotMatrix e1=\"1\" e2=\"0\" e3=\"0\" e4=\"0\" e5=\"1\" e6=\"0\"/></hp:renderingInfo><hc:img binaryItemIDRef=\"image1\" bright=\"0\" contrast=\"0\" effect=\"REAL_PIC\" alpha=\"0\"/><hp:imgRect><hc:pt0 x=\"0\" y=\"0\"/><hc:pt1 x=\"9000\" y=\"0\"/><hc:pt2 x=\"9000\" y=\"6000\"/><hc:pt3 x=\"0\" y=\"6000\"/></hp:imgRect><hp:imgClip left=\"0\" right=\"9000\" top=\"0\" bottom=\"6000\"/><hp:inMargin left=\"0\" right=\"0\" top=\"0\" bottom=\"0\"/><hp:imgDim dimwidth=\"9000\" dimheight=\"6000\"/><hp:effects/><hp:sz width=\"9000\" widthRelTo=\"ABSOLUTE\" height=\"6000\" heightRelTo=\"ABSOLUTE\" protect=\"0\"/><hp:pos treatAsChar=\"1\" affectLSpacing=\"0\" flowWithText=\"1\" allowOverlap=\"0\" holdAnchorAndSO=\"0\" vertRelTo=\"PARA\" horzRelTo=\"COLUMN\" vertAlign=\"TOP\" horzAlign=\"LEFT\" vertOffset=\"0\" horzOffset=\"0\"/><hp:outMargin left=\"0\" right=\"0\" top=\"0\" bottom=\"0\"/><hp:shapeComment>그림입니다.\r\n원본 그림의 이름: ref.png\r\n원본 그림의 크기: 가로 120pixel, 세로 80pixel</hp:shapeComment></hp:pic>";

/** 사각형 도형. 실측 도형 34편 중 33편이 이것이다 (254개) */
export const 사각형 = "<hp:rect id=\"1177263143\" zOrder=\"0\" numberingType=\"PICTURE\" textWrap=\"IN_FRONT_OF_TEXT\" textFlow=\"BOTH_SIDES\" lock=\"0\" dropcapstyle=\"None\" href=\"\" groupLevel=\"0\" instid=\"103521320\" ratio=\"0\"><hp:offset x=\"0\" y=\"0\"/><hp:orgSz width=\"23909\" height=\"11955\"/><hp:curSz width=\"0\" height=\"0\"/><hp:flip horizontal=\"0\" vertical=\"0\"/><hp:rotationInfo angle=\"0\" centerX=\"11954\" centerY=\"5977\" rotateimage=\"1\"/><hp:renderingInfo><hc:transMatrix e1=\"1\" e2=\"0\" e3=\"0\" e4=\"0\" e5=\"1\" e6=\"0\"/><hc:scaMatrix e1=\"1\" e2=\"0\" e3=\"0\" e4=\"0\" e5=\"1\" e6=\"0\"/><hc:rotMatrix e1=\"1\" e2=\"0\" e3=\"0\" e4=\"0\" e5=\"1\" e6=\"0\"/></hp:renderingInfo><hp:lineShape color=\"#000000\" width=\"33\" style=\"SOLID\" endCap=\"FLAT\" headStyle=\"NORMAL\" tailStyle=\"NORMAL\" headfill=\"1\" tailfill=\"1\" headSz=\"MEDIUM_MEDIUM\" tailSz=\"MEDIUM_MEDIUM\" outlineStyle=\"NORMAL\" alpha=\"0\"/><hc:fillBrush><hc:winBrush faceColor=\"#FFFFFF\" hatchColor=\"#000000\" alpha=\"0\"/></hc:fillBrush><hp:shadow type=\"NONE\" color=\"#B2B2B2\" offsetX=\"0\" offsetY=\"0\" alpha=\"0\"/><hc:pt0 x=\"0\" y=\"0\"/><hc:pt1 x=\"23909\" y=\"0\"/><hc:pt2 x=\"23909\" y=\"11955\"/><hc:pt3 x=\"0\" y=\"11955\"/><hp:sz width=\"23909\" widthRelTo=\"ABSOLUTE\" height=\"11955\" heightRelTo=\"ABSOLUTE\" protect=\"0\"/><hp:pos treatAsChar=\"0\" affectLSpacing=\"0\" flowWithText=\"0\" allowOverlap=\"1\" holdAnchorAndSO=\"0\" vertRelTo=\"PAPER\" horzRelTo=\"PAPER\" vertAlign=\"TOP\" horzAlign=\"LEFT\" vertOffset=\"20428\" horzOffset=\"15059\"/><hp:outMargin left=\"0\" right=\"0\" top=\"0\" bottom=\"0\"/><hp:shapeComment>사각형입니다.</hp:shapeComment></hp:rect>";

/** 도형 안 글 자리(hp:drawText). 사각형 조각에 붙여 쓴다 (글은 비워 뒀다) */
export const 글자리 = "<hp:drawText lastWidth=\"14082\" name=\"\" editable=\"0\"><hp:subList id=\"\" textDirection=\"HORIZONTAL\" lineWrap=\"BREAK\" vertAlign=\"CENTER\" linkListIDRef=\"0\" linkListNextIDRef=\"0\" textWidth=\"0\" textHeight=\"0\" hasTextRef=\"0\" hasNumRef=\"0\"><hp:p id=\"2147483648\" paraPrIDRef=\"11\" styleIDRef=\"0\" pageBreak=\"0\" columnBreak=\"0\" merged=\"0\"><hp:run charPrIDRef=\"154\"><hp:ctrl><hp:pageHiding hideHeader=\"0\" hideFooter=\"0\" hideMasterPage=\"0\" hideBorder=\"0\" hideFill=\"0\" hidePageNum=\"1\"/></hp:ctrl><hp:t></hp:t></hp:run><hp:run charPrIDRef=\"160\"><hp:t></hp:t></hp:run><hp:run charPrIDRef=\"161\"><hp:t/></hp:run></hp:p></hp:subList><hp:textMargin left=\"283\" right=\"283\" top=\"283\" bottom=\"283\"/></hp:drawText>";

/** 머리말 ctrl. 구역 첫 문단의 런에 넣는다 (글은 비워 뒀다) */
export const 머리말 = "<hp:ctrl><hp:header id=\"1\" applyPageType=\"BOTH\"><hp:subList id=\"\" textDirection=\"HORIZONTAL\" lineWrap=\"BREAK\" vertAlign=\"TOP\" linkListIDRef=\"0\" linkListNextIDRef=\"0\" textWidth=\"42520\" textHeight=\"4252\" hasTextRef=\"0\" hasNumRef=\"0\"><hp:p id=\"0\" paraPrIDRef=\"9\" styleIDRef=\"14\" pageBreak=\"0\" columnBreak=\"0\" merged=\"0\"><hp:run charPrIDRef=\"2\"><hp:t></hp:t></hp:run></hp:p></hp:subList></hp:header></hp:ctrl>";

/** 꼬리말 ctrl. 머리말과 같은 꼴이다 (글은 비워 뒀다) */
export const 꼬리말 = "<hp:ctrl><hp:footer id=\"1\" applyPageType=\"BOTH\"><hp:subList id=\"\" textDirection=\"HORIZONTAL\" lineWrap=\"BREAK\" vertAlign=\"BOTTOM\" linkListIDRef=\"0\" linkListNextIDRef=\"0\" textWidth=\"42520\" textHeight=\"4252\" hasTextRef=\"0\" hasNumRef=\"0\"><hp:p id=\"0\" paraPrIDRef=\"9\" styleIDRef=\"14\" pageBreak=\"0\" columnBreak=\"0\" merged=\"0\"><hp:run charPrIDRef=\"2\"><hp:t></hp:t></hp:run></hp:p></hp:subList></hp:footer></hp:ctrl>";

/** 표 캡션. hp:tbl 안에 넣는다. side 로 위·아래를 고른다 (글은 비워 뒀다) */
export const 표캡션 = "<hp:caption side=\"TOP\" fullSz=\"0\" width=\"8504\" gap=\"566\" lastWidth=\"44989\"><hp:subList id=\"\" textDirection=\"HORIZONTAL\" lineWrap=\"BREAK\" vertAlign=\"TOP\" linkListIDRef=\"0\" linkListNextIDRef=\"0\" textWidth=\"0\" textHeight=\"0\" hasTextRef=\"0\" hasNumRef=\"0\"><hp:p id=\"2147483648\" paraPrIDRef=\"6\" styleIDRef=\"0\" pageBreak=\"0\" columnBreak=\"0\" merged=\"0\"><hp:run charPrIDRef=\"167\"><hp:t></hp:t></hp:run></hp:p></hp:subList></hp:caption>";
