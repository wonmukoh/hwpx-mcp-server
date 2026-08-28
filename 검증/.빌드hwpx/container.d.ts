/**
 * HWPX 컨테이너.
 *
 * zip 위에 얹은 얇은 층이다. 부품 이름을 알고, manifest 를 지키고,
 * 규격에 어긋나는 것을 잡는다.
 *
 * 부품 짜임 (실측):
 *   mimetype                 ← **언제나 첫 항목, STORE**
 *   version.xml
 *   settings.xml
 *   Contents/header.xml      글자·문단·테두리 모양, 글꼴
 *   Contents/section0.xml    본문 (구역마다 하나)
 *   Contents/content.hpf     manifest — 어떤 파일이 들어 있나
 *   META-INF/container.xml   .rdf  manifest.xml
 *   BinData/*                그림
 *   Preview/*                미리보기 (없어도 된다)
 */
export declare const 부품: {
    readonly mimetype: "mimetype";
    readonly version: "version.xml";
    readonly settings: "settings.xml";
    readonly header: "Contents/header.xml";
    readonly manifest: "Contents/content.hpf";
    readonly containerXml: "META-INF/container.xml";
    readonly containerRdf: "META-INF/container.rdf";
    readonly manifestXml: "META-INF/manifest.xml";
};
export declare const MIMETYPE = "application/hwp+zip";
export declare class HwpxError extends Error {
    readonly 어떻게?: string | undefined;
    constructor(message: string, 어떻게?: string | undefined);
}
export declare class HwpxContainer {
    private readonly zip;
    private constructor();
    static open(buf: Buffer): HwpxContainer;
    /** 들어 있는 부품 이름들 (zip 순서 그대로) */
    names(): string[];
    has(name: string): boolean;
    /** 부품의 바이트. 없으면 오류 */
    read(name: string): Buffer;
    /** 부품을 글자로 (UTF-8) */
    readText(name: string): string;
    /** 구역 파일 이름들. `section0.xml`, `section1.xml`, … 순서대로 */
    sectionNames(): string[];
    /** 그림 부품 이름들 */
    binDataNames(): string[];
    /**
     * 부품 내용을 갈아 끼운다. 없으면 새로 만든다.
     *
     * 압축 방식은 **원본을 따른다.** 새 부품이면 형식에 맞춰 정한다
     * (jpg·png 는 그냥 담고, bmp 는 압축 — 한글이 그렇게 한다).
     */
    write(name: string, data: Buffer, method?: number): void;
    writeText(name: string, text: string): void;
    /** 부품을 뺀다 */
    remove(name: string): boolean;
    /** 손댄 부품이 있나 */
    get dirty(): boolean;
    /** 손댄 부품 이름들 */
    dirtyNames(): string[];
    /**
     * 파일로 쓴다.
     *
     * **손대지 않은 부품은 원본 압축 바이트를 그대로 쓴다.**
     * 그래서 아무것도 안 고치고 저장하면 원본과 바이트가 같다.
     */
    save(): Buffer;
    /** 검사만 하고 저장은 안 한다 */
    검사(): string[];
    /**
     * manifest 에 적힌 파일과 실제 zip 안 파일이 맞는지 본다.
     *
     * 어긋나면 한글이 그림을 못 찾거나 파일을 통째로 거부한다.
     * 지금 쓰는 MCP 는 이 둘을 따로 관리해서 어긋난 적이 있다.
     */
    manifest검사(): string[];
}
/** 부품 하나의 압축 방식을 본다 (검사용) */
export declare function 부품압축방식(c: HwpxContainer, name: string): number | undefined;
export { STORE, DEFLATE, 압축방식정하기, ZipError } from './zip.js';
export type { ZipEntry } from './zip.js';
//# sourceMappingURL=container.d.ts.map