import * as fs from "fs";
import * as path from "path";

/**
    * px undo
    *
    * Restores data.json from the .bak file created before the last write.
    * Only one level of undo — simple and predictable.
*/
export function undo(): void {
    const dataPath = path.join(__dirname, "../../data/data.json");
    const bakPath = dataPath + ".bak";

    if (!fs.existsSync(bakPath)) {
        console.log("Nothing to undo.");
        return;
    }

    fs.copyFileSync(bakPath, dataPath);
    fs.unlinkSync(bakPath);
    console.log("✓ Undone. Last action reverted.");
}