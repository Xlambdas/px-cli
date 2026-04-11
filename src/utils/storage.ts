import * as fs from "fs";
import * as path from "path";
import { AppData, createEmptyData } from "../models";

// WHERE the data lives — a single JSON file next to your CLI
// WHY one file? Simpler than two files. Atomic writes. Easy to sync via Git.
const DATA_PATH = path.join(__dirname, "../../data/data.json");

/**
    * Load all data from disk.
    * If the file doesn't exist yet, returns empty defaults.
    *
    * WHY a function and not a global variable?
    * → Because data can change between commands. Always read fresh.
*/
export function loadData(): AppData {
    try {
        const raw = fs.readFileSync(DATA_PATH, "utf-8");
        const data = JSON.parse(raw) as AppData;
        if (!data.projectProfiles) {
            data.projectProfiles = {};
        }
        if (!data.todayTasks) {
            data.todayTasks = [];
        }
        return data;
    } catch {
        // File doesn't exist yet — first run
        return createEmptyData();
    }
}

/**
    * Save all data to disk.
    *
    * WHY write the whole file every time?
    * → With JSON, you can't update a single field. You read all, modify, write all.
    * → This is fine for personal use (your file will be <1MB for years).
*/
export function saveData(data: AppData): void {
    // Ensure the data directory exists
    const dir = path.dirname(DATA_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    // Backup current state before overwriting (for px undo)
    if (fs.existsSync(DATA_PATH)) {
        fs.copyFileSync(DATA_PATH, DATA_PATH + ".bak");
    }
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
}
