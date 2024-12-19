import generateIsolines from "./isolines";
import { DemSource } from "./dem-source";
import { decodeParsedImage } from "./decode-image";
import { LocalDemManager } from "./dem-manager";
import { HeightTile } from "./height-tile";
declare const exported: {
    generateIsolines: typeof generateIsolines;
    DemSource: typeof DemSource;
    HeightTile: typeof HeightTile;
    LocalDemManager: typeof LocalDemManager;
    decodeParsedImage: typeof decodeParsedImage;
    workerUrl: string;
};
export default exported;
