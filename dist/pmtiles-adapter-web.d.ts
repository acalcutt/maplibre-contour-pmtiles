import { PMTiles } from "pmtiles";
import type { Encoding } from "./types";
export declare function openPMtiles(FilePath: string): PMTiles;
export declare function getPMtilesTile(pmtiles: PMTiles, z: number, x: number, y: number): Promise<{
    data: ArrayBuffer | undefined;
}>;
export declare function GetImageData(blob: Blob, encoding: Encoding): Promise<undefined>;
