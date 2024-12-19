import type { DemTile } from "./types";
/** A tile containing elevation values aligned to a grid. */
export declare class HeightTile {
    get: (x: number, y: number) => number;
    width: number;
    height: number;
    constructor(width: number, height: number, get: (x: number, y: number) => number);
    /** Construct a height tile from raw DEM pixel values */
    static fromRawDem(demTile: DemTile): HeightTile;
    /**
     * Construct a height tile from a DEM tile plus it's 8 neighbors, so that
     * you can request `x` or `y` outside the bounds of the original tile.
     *
     * @param neighbors An array containing tiles: `[nw, n, ne, w, c, e, sw, s, se]`
     */
    static combineNeighbors(neighbors: (HeightTile | undefined)[]): HeightTile | undefined;
    /**
     * Splits this tile into a `1<<subz` x `1<<subz` grid and returns the tile at coordinates `subx, suby`.
     */
    split: (subz: number, subx: number, suby: number) => HeightTile;
    /**
     * Returns a new tile scaled up by `factor` with pixel values that are subsampled using
     * bilinear interpolation between the original height tile values.
     *
     * The original and result tile are assumed to represent values taken at the center of each pixel.
     */
    subsamplePixelCenters: (factor: number) => HeightTile;
    /**
     * Assumes the input tile represented measurements taken at the center of each pixel, and
     * returns a new tile where values are the height at the top-left of each pixel by averaging
     * the 4 adjacent pixel values.
     */
    averagePixelCentersToGrid: (radius?: number) => HeightTile;
    /** Returns a new tile with elevation values scaled by `multiplier`. */
    scaleElevation: (multiplier: number) => HeightTile;
    /**
     * Precompute every value from `-bufer, -buffer` to `width + buffer, height + buffer` and serve them
     * out of a `Float32Array`. Until this method is called, all `get` requests are lazy and call all previous
     * methods in the chain up to the root DEM tile.
     */
    materialize: (buffer?: number) => HeightTile;
}
