/**
 * zip 컨테이너. **고치지 않은 부품은 원본 압축 바이트를 그대로 쓴다.**
 *
 * 왜 직접 쓰나:
 *   보통 zip 라이브러리로는 왕복 무손실이 안 된다. 다시 압축하면
 *   deflate 구현이 달라 바이트가 달라지고, 타임스탬프·플래그·순서도 바뀐다.
 *   XML 계층에서 쓴 것과 같은 수법을 쓴다 — 안 건드린 것은 원본 조각 그대로.
 *
 * 실측(문서 113편 / 항목 1396개)으로 알아낸 한글 zip 의 성질:
 *   - `mimetype` 이 **언제나 첫 항목이고 STORE** (113/113)
 *   - 여분 필드(extra field) 가 **하나도 없다**
 *   - 데이터 서술자를 **안 쓴다**
 *   - 지역 헤더와 중앙 디렉터리가 **어긋나지 않는다**
 *   - 그림은 형식에 따라 갈린다 — 아래 `압축방식정하기` 참고
 */
export declare function crc32(buf: Buffer): number;
export declare const STORE = 0;
export declare const DEFLATE = 8;
export interface ZipEntry {
    name: string;
    method: number;
    /** 일반 목적 플래그. 원본 그대로 보존한다 */
    flags: number;
    modTime: number;
    modDate: number;
    crc: number;
    compSize: number;
    uncompSize: number;
    versionMadeBy: number;
    versionNeeded: number;
    internalAttrs: number;
    externalAttrs: number;
    /** 지역 헤더의 여분 필드 (한글 문서엔 없지만 남의 것을 지키려면 보존해야 한다) */
    extraLocal: Buffer;
    extraCentral: Buffer;
    comment: Buffer;
    /** 원본의 **압축된** 바이트. 안 고쳤으면 이걸 그대로 쓴다 */
    compressed: Buffer;
    /** 압축을 푼 내용. 필요할 때 한 번만 푼다 */
    plainCache?: Buffer;
    dirty: boolean;
}
export interface ZipArchive {
    entries: ZipEntry[];
    /** 이름 → 항목 */
    byName: Map<string, ZipEntry>;
    /** zip 전체 주석 */
    comment: Buffer;
}
export declare class ZipError extends Error {
    constructor(message: string);
}
export declare function readZip(buf: Buffer): ZipArchive;
/** 항목의 내용을 푼다 (한 번 풀면 기억한다) */
export declare function entryData(e: ZipEntry): Buffer;
/**
 * 그림을 넣을 때 어떤 압축 방식을 쓸까.
 *
 * 실측(문서 113편)이 답을 줬다:
 *   jpg 57 STORE / 0 DEFLATE      png 41 STORE / 0 DEFLATE
 *   bmp  0 STORE / 26 DEFLATE     wmf  0 STORE / 1 DEFLATE
 *
 * 규칙은 '한글이 압축을 못 읽는다' 가 아니라
 * **이미 압축된 형식은 그냥 담고, 아닌 형식은 압축한다** 이다.
 * (bmp 는 다시 압축하면 74% 가 줄어든다. jpg 는 줄지 않는다)
 */
export declare function 압축방식정하기(name: string): number;
/** 항목 내용을 갈아 끼운다 */
export declare function setEntryData(e: ZipEntry, data: Buffer, method?: number): void;
/** 새 항목을 만든다 */
export declare function createEntry(name: string, data: Buffer, method?: number): ZipEntry;
export declare function writeZip(zip: ZipArchive): Buffer;
//# sourceMappingURL=zip.d.ts.map