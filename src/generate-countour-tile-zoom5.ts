import { writeFileSync, mkdir } from "fs";
import { LocalDemManager } from "./dem-manager";
import { getChildren } from '@mapbox/tilebelt';

interface Tile {
    x: number;
    y: number;
    z: number;
}

function generateTilesAtZoom(zoom: number, tileSize: 256 | 512 = 256): Tile[] {
    if (zoom < 0) {
        throw new Error("Zoom level must be non-negative.");
    }

    let numTiles: number;

    if (tileSize === 256) {
        numTiles = Math.pow(2, zoom); // Calculate number of 256px tiles across a side
    } else if (tileSize === 512) {
        numTiles = Math.pow(2, zoom - 1); // Calculate number of 512px tiles across a side
    } else {
        throw new Error("Invalid tile size. Must be 256 or 512.");
    }

    const tiles: Tile[] = [];

    for (let x = 0; x < numTiles; x++) {
        for (let y = 0; y < numTiles; y++) {
            tiles.push({
                x,
                y,
                z: zoom,
            });
        }
    }
    return tiles;
}

function getAllChildren(tile: [number, number, number], maxZoom: number) {
    if (tile[2] >= maxZoom) return [tile];
    let allChildren: [number, number, number][] = [];
    theChildren(tile);
    return allChildren;

    function theChildren(tile: [number, number, number]) {
        const children = getChildren(tile);
        allChildren = allChildren.concat(children);

        // Check if children exist first
        if (children.length > 0 && children[0][2] < maxZoom) {
            children.forEach((child) => theChildren(child));
        }
    }
}

async function processTile(v: [number, number, number]) {
    const z = v[2];
    const x = v[0];
    const y = v[1];

    // Correctly format the paths using template literals
    const dirPath = `./output/${z}/${x}/`;
    const filePath = `${dirPath}${y}.pbf`;
    try {
        const tile = await manager.fetchContourTile(z, x, y, { levels: [10] }, new AbortController());
        if (tile && tile.arrayBuffer) {
            return await new Promise<void>(async (resolve, reject) => {
                try {
                    //console.log(`creating directory: ${dirPath}`);
                    mkdir(dirPath, { recursive: true }, (err) => {
                        if (err) {
                            reject(err)
                            return
                        };
                        //console.log(`writing file: ${filePath}`);
                        writeFileSync(filePath, Buffer.from(tile.arrayBuffer));
                        resolve();
                    })
                } catch (err) {
                    console.error("Error saving buffer to file:", err);
                    reject(err);
                    return
                }
            });
        } else {
            console.error("No tile data fetched for: ", z, x, y);
        }
    } catch (error) {
        console.error("Error in processTile", error);
        //throw error; // Re-throw so Promise.all fails and shows errors.
    }
}

async function processQueue(queue, batchSize = 25) {
    for (let i = 0; i < queue.length; i += batchSize) {
        const batch = queue.slice(i, i + batchSize);
        //console.log(`Batch: ${JSON.stringify(batch)}`);
        await Promise.all(batch.map(processTile));
        console.log(`Processed batch ${i / batchSize + 1} of ${Math.ceil(queue.length / batchSize)}`);
    }
}

const manager = new LocalDemManager(
    "/opt/pmtiles_converted/jaxa_terrainrgb0-12.pmtiles",
    500,
    "terrarium",
    12,
    10000
);
manager.initializePMTiles();

const zoomLevel = 5;
const maxzoomLevel = 12;
const tilesAtZoom5 = generateTilesAtZoom(zoomLevel, 512);
console.log(`Number of tiles at zoom ${zoomLevel}: ${tilesAtZoom5.length}`);


async function main() {
	const length = tilesAtZoom5.length
	let count = 0
    for (const tile of tilesAtZoom5) { // Changed to for...of loop
        count++
        console.log(`Starting Parent Tile: ${JSON.stringify(tile)} (${count} of ${length})`);

        const children = getAllChildren([tile.x, tile.y, tile.z], maxzoomLevel);

        children.sort((a, b) => {
            //Sort by Z first
            if (a[2] !== b[2]) return a[2] - b[2];
            //If Z is equal, sort by X
            if (a[0] !== b[0]) return a[0] - b[0];
            //If Z and X are equal, sort by Y
            return a[1] - b[1];
        });
        //console.log(`Children Tiles: ${JSON.stringify(children)}`);

        await processQueue(children, 150); 
        console.log('All files processed from Parent Tile: ${JSON.stringify(tile)} (${count} of ${length})!');
    }
}

main();
