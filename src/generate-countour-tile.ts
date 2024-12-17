import { writeFileSync, mkdir } from "fs";
import { LocalDemManager } from "./dem-manager";
import { getChildren } from "@mapbox/tilebelt";

type BBox = [number, number, number, number];

interface Tile {
  x: number;
  y: number;
  z: number;
}

let manager = new LocalDemManager(
  "C:\\Users\\Andrew\\Desktop\\Junk\\tile_data\\pmtiles\\gebco_terrarium0-8.pmtiles",
  100,
  "terrarium",
  8,
  10000,
);
manager.initializePMTiles();

/**
 * Calculates the tile coordinates given the bounding box.
 *
 * @param  bbox The bounding box [west, south, east, north]
 * @param  zoom The zoom level
 * @returns {Tile[]} Array of tile coordinates for the given zoom
 */
function bboxToTiles(bbox: BBox, zoom: number): Tile[] {
  const [west, south, east, north] = bbox;
  const numTiles = 1 << zoom; // Calculate the total number of tiles at this zoom level

  const xMin = Math.floor(((west + 180) / 360) * numTiles);
  const xMax = Math.floor(((east + 180) / 360) * numTiles);

  const yMin = Math.floor(
    ((1 -
      Math.log(
        Math.tan((north * Math.PI) / 180) +
          1 / Math.cos((north * Math.PI) / 180),
      ) /
        Math.PI) /
      2) *
      numTiles,
  );
  const yMax = Math.floor(
    ((1 -
      Math.log(
        Math.tan((south * Math.PI) / 180) +
          1 / Math.cos((south * Math.PI) / 180),
      ) /
        Math.PI) /
      2) *
      numTiles,
  );

  const tiles: Tile[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }

  return tiles;
}

/**
 * Fetches mapbox vector tiles for a given bounding box within a zoom range
 * @param  tileUrlTemplate The URL template of the mapbox tiles, needs to have , ,
 * @param  bbox The bounding box [west, south, east, north]
 * @param  minZoom The minimum zoom level
 * @param  maxZoom The maximum zoom level
 * @returns {Promise<Array<Uint8Array>>} An array of promises for each tile
 */
async function fetchTiles(
  tileUrlTemplate: string,
  bbox: BBox,
  minZoom: number,
  maxZoom: number,
): Promise<void> {
  const allTiles: Tile[] = [];
  for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
    const tiles = bboxToTiles(bbox, zoom);
    allTiles.push(...tiles);
  }

  const tilePromises = allTiles.map(async ({ x, y, z }) => {
    const dirPath = `./output/${z}/${x}`;
    const filePath = `./output/${z}/${x}/${y}.mvt`;

    try {
      return manager
        .fetchContourTile(z, x, y, { levels: [10] }, new AbortController())
        .then((tile) => {
          return new Promise<void>((resolve, reject) => {
            console.log(filePath);
            mkdir(dirPath, { recursive: true }, (err) => {
              if (err) {
                reject(err);
                return;
              }
              writeFileSync(filePath, Buffer.from(tile.arrayBuffer));
              resolve();
            });
          });
        });
    } catch (error) {
      console.error(
        `Error fetching contour tile for z:${z},x:${x},y:${y}`,
        error,
      );
      return Promise.reject(error);
      // throw error
    }
  });

  return await processQueue(tilePromises);
}

async function processQueue(queue: Promise<any>[], batchSize = 25) {
  for (let i = 0; i < queue.length; i += batchSize) {
    const batch = queue.slice(i, i + batchSize);
    //console.log(batch);
    await Promise.all(batch);
    console.log(
      `Processed batch ${i / batchSize + 1} of ${Math.ceil(queue.length / batchSize)}`,
    );
  }
}

async function main() {
  const tileUrlTemplate = "//";
  const bbox: BBox = [-122.5, 37.7, -122.3, 37.8]; // San Francisco example bounding box
  //const bbox: BBox = [-180,-90,180,90]; // San Francisco example bounding box
  const minZoom = 0;
  const maxZoom = 8;

  try {
    await fetchTiles(tileUrlTemplate, bbox, minZoom, maxZoom);
  } catch (error) {
    console.error("Error fetching tiles:", error);
  }
}

main();
