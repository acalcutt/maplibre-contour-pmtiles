import { PMTiles, type Source } from "pmtiles";
import type { Encoding } from "./types";
export declare class PMTilesFileSource implements Source {
    private fd;
    constructor(fd: number);
    getKey(): string;
    getBytes(offset: number, length: number): Promise<{
        data: ArrayBuffer;
    }>;
}
export declare function openPMtiles(FilePath: string): PMTiles;
export declare function getPMtilesTile(pmtiles: PMTiles, z: number, x: number, y: number): Promise<{
    data: ArrayBuffer | undefined;
}>;
export declare function GetImageData(blob: Blob, encoding: Encoding): Promise<any>;
