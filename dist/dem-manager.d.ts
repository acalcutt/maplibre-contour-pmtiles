import AsyncCache from "./cache";
import { HeightTile } from "./height-tile";
import type { ContourTile, DemTile, Encoding, FetchResponse, IndividualContourTileOptions } from "./types";
import { Timer } from "./performance";
import type { PMTiles } from "pmtiles";
/**
 * Holds cached tile state, and exposes `fetchContourTile` which fetches the necessary
 * tiles and returns an encoded contour vector tiles.
 */
export interface DemManager {
    initializePMTiles(): unknown;
    loaded: Promise<any>;
    fetchTile(z: number, x: number, y: number, abortController: AbortController, timer?: Timer): Promise<FetchResponse>;
    fetchAndParseTile(z: number, x: number, y: number, abortController: AbortController, timer?: Timer): Promise<DemTile>;
    fetchContourTile(z: number, x: number, y: number, options: IndividualContourTileOptions, abortController: AbortController, timer?: Timer): Promise<ContourTile>;
}
/**
 * Caches, decodes, and processes raster tiles in the current thread.
 */
export declare class LocalDemManager implements DemManager {
    tileCache: AsyncCache<string, FetchResponse>;
    parsedCache: AsyncCache<string, DemTile>;
    contourCache: AsyncCache<string, ContourTile>;
    encoding: Encoding;
    maxzoom: number;
    pmtiles: PMTiles | null;
    fileUrl: string;
    timeoutMs: number;
    loaded: Promise<void>;
    decodeImage: (blob: Blob, encoding: Encoding, abortController: AbortController) => Promise<DemTile>;
    constructor(fileUrl: string, cacheSize: number, encoding: Encoding, maxzoom: number, timeoutMs: number);
    initializePMTiles(): Promise<void>;
    fetchTile(z: number, x: number, y: number, parentAbortController: AbortController, timer?: Timer): Promise<FetchResponse>;
    fetchAndParseTile: (z: number, x: number, y: number, abortController: AbortController, timer?: Timer) => Promise<DemTile>;
    fetchDem(z: number, x: number, y: number, options: IndividualContourTileOptions, abortController: AbortController, timer?: Timer): Promise<HeightTile>;
    fetchContourTile(z: number, x: number, y: number, options: IndividualContourTileOptions, parentAbortController: AbortController, timer?: Timer): Promise<ContourTile>;
}
