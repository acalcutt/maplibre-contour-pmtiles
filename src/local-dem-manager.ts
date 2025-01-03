import AsyncCache from "./cache";
import defaultDecodeImage from "./decode-image";
import { HeightTile } from "./height-tile";
import generateIsolines from "./isolines";
import { encodeIndividualOptions, isAborted, withTimeout } from "./utils";
import type {
  ContourTile,
  DecodeImageFunction,
  DemManager,
  DemManagerInitizlizationParameters,
  DemTile,
  Encoding,
  FetchResponse,
  GetTileFunction,
  IndividualContourTileOptions,
} from "./types";
import encodeVectorTile, { GeomType } from "./vtpbf";
import { Timer } from "./performance";
import type { PMTiles } from "pmtiles";
import { openPMtiles, getPMtilesTile } from "./pmtiles-adapter-node";

const defaultGetTile: GetTileFunction = async (
  z: number,
  x: number,
  y: number,
  demUrlPattern: string,
  abortController: AbortController,
) => {
  const url = demUrlPattern
    .replace("{z}", z.toString())
    .replace("{x}", x.toString())
    .replace("{y}", y.toString());

  const options: RequestInit = {
    signal: abortController.signal,
  };
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Bad response: ${response.status} for ${url}`);
  }
  return {
    data: await response.blob(),
    expires: response.headers.get("expires") || undefined,
    cacheControl: response.headers.get("cache-control") || undefined,
  };
};

const defaultPMtilesGetTile: GetTileFunction = async (
  z: number,
  x: number,
  y: number,
  _demUrlPattern: string,
  parentAbortController: AbortController,
  pmtiles?: PMTiles | null,
) => {
  if (!pmtiles) {
    throw new Error("pmtiles is not initialized.");
  }
  if (parentAbortController.signal.aborted) {
    throw new Error("Request aborted by parent.");
  }
  try {
    const zxyTile = await getPMtilesTile(pmtiles, z, x, y);
    if (zxyTile && zxyTile.data) {
      const blob = new Blob([zxyTile.data]);
      return {
        data: blob,
        expires: undefined,
        cacheControl: undefined,
      };
    } else {
      throw new Error(`Tile data not found for z:${z} x:${x} y:${y}`);
    }
  } catch (error) {
    throw new Error(
      `Failed to fetch DEM tile for z:${z} x:${x} y:${y} from PMTiles: ${error}`,
    );
  }
};

/**
 * Caches, decodes, and processes raster tiles in the current thread.
 */
export class LocalDemManager implements DemManager {
  tileCache: AsyncCache<string, FetchResponse>;
  parsedCache: AsyncCache<string, DemTile>;
  contourCache: AsyncCache<string, ContourTile>;
  pmtiles: PMTiles | null = null;
  encoding: Encoding;
  maxzoom: number;
  timeoutMs: number;
  loaded = Promise.resolve();
  decodeImage: DecodeImageFunction;
  getTile: GetTileFunction;
  demUrlPattern: string;

  constructor(options: DemManagerInitizlizationParameters) {
    this.tileCache = new AsyncCache(options.cacheSize);
    this.parsedCache = new AsyncCache(options.cacheSize);
    this.contourCache = new AsyncCache(options.cacheSize);
    this.timeoutMs = options.timeoutMs;
    this.demUrlPattern = options.demUrlPattern;
    this.encoding = options.encoding;
    this.maxzoom = options.maxzoom;
    this.decodeImage = options.decodeImage || defaultDecodeImage;

    if (this.demUrlPattern.startsWith("pmtiles://")) {
      try {
        this.pmtiles = openPMtiles(
          this.demUrlPattern.replace("pmtiles://", ""),
        );
      } catch (e) {
        console.warn("Could not open pmtiles", e);
      }
    }

    this.getTile =
      options.getTile ||
      (this.demUrlPattern.startsWith("pmtiles://")
        ? defaultPMtilesGetTile
        : defaultGetTile);
  }

  fetchTile(
    z: number,
    x: number,
    y: number,
    parentAbortController: AbortController,
    timer?: Timer,
  ): Promise<FetchResponse> {
    const cacheKey = `${z}/${x}/${y}`;
    timer?.useTile(cacheKey);
    return this.tileCache.get(
      cacheKey,
      (_, childAbortController) => {
        timer?.fetchTile(cacheKey);
        const mark = timer?.marker("fetch");

        return withTimeout(
          this.timeoutMs,
          this.getTile(
            z,
            x,
            y,
            this.demUrlPattern,
            childAbortController,
            this.pmtiles,
          ).finally(() => mark?.()),
          childAbortController,
        );
      },
      parentAbortController,
    );
  }

  fetchAndParseTile = (
    z: number,
    x: number,
    y: number,
    abortController: AbortController,
    timer?: Timer,
  ): Promise<DemTile> => {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const cacheKey = `${z}/${x}/${y}`;
    timer?.useTile(cacheKey);

    return this.parsedCache.get(
      cacheKey,
      async (_, childAbortController) => {
        const response = await self.fetchTile(
          z,
          x,
          y,
          childAbortController,
          timer,
        );
        if (isAborted(childAbortController)) throw new Error("canceled");
        const promise = self.decodeImage(
          response.data,
          self.encoding,
          childAbortController,
        );
        const mark = timer?.marker("decode");
        const result = await promise;
        mark?.();
        return result;
      },
      abortController,
    );
  };

  async fetchDem(
    z: number,
    x: number,
    y: number,
    options: IndividualContourTileOptions,
    abortController: AbortController,
    timer?: Timer,
  ): Promise<HeightTile> {
    const zoom = Math.min(z - (options.overzoom || 0), this.maxzoom);
    const subZ = z - zoom;
    const div = 1 << subZ;
    const newX = Math.floor(x / div);
    const newY = Math.floor(y / div);

    const tile = await this.fetchAndParseTile(
      zoom,
      newX,
      newY,
      abortController,
      timer,
    );

    return HeightTile.fromRawDem(tile).split(subZ, x % div, y % div);
  }

  fetchContourTile(
    z: number,
    x: number,
    y: number,
    options: IndividualContourTileOptions,
    parentAbortController: AbortController,
    timer?: Timer,
  ): Promise<ContourTile> {
    const {
      levels,
      multiplier = 1,
      buffer = 1,
      extent = 4096,
      contourLayer = "contours",
      elevationKey = "ele",
      levelKey = "level",
      subsampleBelow = 100,
    } = options;

    // no levels means less than min zoom with levels specified
    if (!levels || levels.length === 0) {
      return Promise.resolve({ arrayBuffer: new ArrayBuffer(0) });
    }
    const key = [z, x, y, encodeIndividualOptions(options)].join("/");
    return this.contourCache.get(
      key,
      async (_, childAbortController) => {
        const max = 1 << z;
        const neighborPromises: (Promise<HeightTile> | undefined)[] = [];
        for (let iy = y - 1; iy <= y + 1; iy++) {
          for (let ix = x - 1; ix <= x + 1; ix++) {
            neighborPromises.push(
              iy < 0 || iy >= max
                ? undefined
                : this.fetchDem(
                    z,
                    (ix + max) % max,
                    iy,
                    options,
                    childAbortController,
                    timer,
                  ),
            );
          }
        }
        const neighbors = await Promise.all(neighborPromises);
        let virtualTile = HeightTile.combineNeighbors(neighbors);
        if (!virtualTile || isAborted(childAbortController)) {
          return { arrayBuffer: new Uint8Array().buffer };
        }
        const mark = timer?.marker("isoline");

        if (virtualTile.width >= subsampleBelow) {
          virtualTile = virtualTile.materialize(2);
        } else {
          while (virtualTile.width < subsampleBelow) {
            virtualTile = virtualTile.subsamplePixelCenters(2).materialize(2);
          }
        }

        virtualTile = virtualTile
          .averagePixelCentersToGrid()
          .scaleElevation(multiplier)
          .materialize(1);

        const isolines = generateIsolines(
          levels[0],
          virtualTile,
          extent,
          buffer,
        );

        mark?.();
        const result = encodeVectorTile({
          extent,
          layers: {
            [contourLayer]: {
              features: Object.entries(isolines).map(([eleString, geom]) => {
                const ele = Number(eleString);
                return {
                  type: GeomType.LINESTRING,
                  geometry: geom,
                  properties: {
                    [elevationKey]: ele,
                    [levelKey]: Math.max(
                      ...levels.map((l, i) => (ele % l === 0 ? i : 0)),
                    ),
                  },
                };
              }),
            },
          },
        });
        mark?.();

        return { arrayBuffer: result.buffer as ArrayBuffer };
      },
      parentAbortController,
    );
  }
}
