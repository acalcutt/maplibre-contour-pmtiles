export declare const enum GeomType {
    UNKNOWN = 0,
    POINT = 1,
    LINESTRING = 2,
    POLYGON = 3
}
export type PropertyValue = string | boolean | number;
export interface Feature {
    type: GeomType;
    properties: {
        [key: string]: PropertyValue;
    };
    geometry: number[][];
}
export interface Layer {
    features: Feature[];
    extent?: number;
}
export interface Tile {
    extent?: number;
    layers: {
        [id: string]: Layer;
    };
}
/**
 * Enodes and serializes a mapbox vector tile as an array of bytes.
 */
export default function encodeVectorTile(tile: Tile): Uint8Array;
