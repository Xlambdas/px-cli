import * as fs from "fs";
import * as path from "path";
import { AppData, createEmptyData } from "../models";

const isPackaged = !!(process as any).pkg;
const ROOT_DIR = isPackaged
    ? path.dirname(process.execPath)
    : path.join(__dirname, "../..");

const DATA_PATH = path.join(ROOT_DIR, "data/data.json");
const CONFIG_PATH = path.join(ROOT_DIR, "data/config.json");

/**
    * Load all data from disk.
    * If the file doesn't exist yet, returns empty defaults.
*/
export function loadData(): AppData {
    // Inject config.json values into process.env if not already set
    try {
        const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
        if (cfg.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
            process.env.GEMINI_API_KEY = cfg.GEMINI_API_KEY;
        }
    } catch { }
    try {
        const raw = fs.readFileSync(DATA_PATH, "utf-8");
        const data = JSON.parse(raw) as AppData;
        if (!data.projectProfiles) {
            data.projectProfiles = {};
        }
        if (!data.todayTasks) {
            data.todayTasks = [];
        }
        if (!data.archivedTasks) data.archivedTasks = [];
        if (!data.archivedProjects) data.archivedProjects = [];
        return data;
    } catch {
        // File doesn't exist yet - first run
        return createEmptyData();
    }
}

/**
    * Save all data to disk.
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

export interface PxConfig {
    GEMINI_API_KEY?: string;
    personalSshKey?: string;
    lastVersionCheck?: { checkedAt: string; latestVersion: string };
    notifiedUpdateVersion?: string;
}

export function loadConfig(): PxConfig {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as PxConfig;
    } catch {
        return {};
    }
}

export function saveConfig(config: PxConfig): void {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}