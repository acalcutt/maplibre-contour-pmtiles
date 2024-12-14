import { writeFileSync, mkdir} from "fs";
import { LocalDemManager } from "./dem-manager";
import { getChildren } from '@mapbox/tilebelt';

let manager = new LocalDemManager(
    "C:\\Users\\Andrew\\Desktop\\Junk\\tile_data\\pmtiles\\gebco_terrarium0-8.pmtiles",
    100,
    "terrarium",
    8,
    10000
);
manager.initializePMTiles();

function getAllChildren(tile, maxZoom) {
    if (tile[2] >= maxZoom) return [tile];
    var zoomDiff = maxZoom - tile[2];
    var allChildren = [];
    theChildren(tile);
    return allChildren;

    function theChildren(tile) {
        var children = getChildren(tile);
        allChildren = allChildren.concat(children);
        if (children[0][2] === maxZoom) return;
        children.forEach(theChildren);
    }
}

var children = getAllChildren([17, 12, 5], 11);

children.sort((a, b) => {
    //Sort by Z first
    if (a[2] !== b[2]) return a[2] - b[2];
    //If Z is equal, sort by X
    if (a[0] !== b[0]) return a[0] - b[0];
    //If Z and X are equal, sort by Y
    return a[1] - b[1];
});


async function processTile(v) {
  const reordered = [v[2], v[0], v[1]];
  const z = v[2]
  const x = v[0]
  const y = v[1]
  const dirPath = `./output/${z}/${x}`;
  const filePath = `${dirPath}/${y}.mvt`;
    console.log(filePath)
  return manager.fetchContourTile(z, x, y, { levels: [10] }, new AbortController()).then((tile) => {
        return new Promise((resolve, reject) => {
        mkdir(dirPath, { recursive: true }, (err) => {
            if (err) {
                reject(err)
                return
            };
            writeFileSync(filePath, Buffer.from(tile.arrayBuffer));
            resolve();
        })
      
      })
    });
}


async function processQueue(queue, batchSize = 25) {
    for (let i = 0; i < queue.length; i += batchSize) {
      const batch = queue.slice(i, i + batchSize);
      await Promise.all(batch.map(processTile));
      console.log(`Processed batch ${i / batchSize + 1} of ${Math.ceil(queue.length / batchSize)}`);
    }
}


processQueue(children).then(() => {
    console.log('All files written!');
})