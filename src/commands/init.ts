import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { execSync } from "child_process";
import { loadData, saveData, loadConfig, saveConfig } from "../utils/storage";

const ROOT = path.join(__dirname, "../../");
const DATA_DIR = path.join(ROOT, "data");

function ask(rl: readline.Interface, question: string): Promise<string> {
    return new Promise((resolve) => rl.question(question, resolve));
}

export async function initCommand(): Promise<void> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log(`\n--- px init — Setup Wizard ---\n`);

    // ── 1. Git remote ──────────────────────────────────────────────────────
    let hasGit = false;
    try {
        execSync("git rev-parse --is-inside-work-tree", { stdio: "pipe" });
        hasGit = true;
        try {
            const remote = execSync("git remote get-url origin", { encoding: "utf-8", stdio: "pipe" }).trim();
            console.log(`  ✔ Git remote: ${remote}`);
        } catch {
            console.log("  ✔ Git repo found (no remote set).");
        }
    } catch {
        console.log("  No git repo detected in current directory.");
        const gitUrl = await ask(rl, "  Git remote URL (Enter to skip): ");
        if (gitUrl.trim()) {
            try {
                try { execSync("git init", { stdio: "pipe" }); } catch { }
                execSync(`git remote add origin ${gitUrl.trim()}`, { stdio: "inherit" });
                console.log("  ✔ Git remote set.");
                hasGit = true;
            } catch {
                console.log("  ⚠ Could not set remote — do it manually: git remote add origin <url>");
            }
        } else {
            console.log("  Skipped. px start / px end won't work without git.");
        }
    }

    // ── 2. Gemini API key ──────────────────────────────────────────────────
    const config = loadConfig();
    let geminiKey = config.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";

    if (geminiKey) {
        console.log(`\n  ✔ Gemini API key already set.`);
        const change = (await ask(rl, "  Replace it? (y/N): ")).trim().toLowerCase();
        if (change === "y") geminiKey = "";
    } else {
        console.log(`\n  Gemini API key is needed for px ai commands.`);
        console.log(`  Get one free at: https://aistudio.google.com/app/apikey`);
    }

    if (!geminiKey) {
        const key = (await ask(rl, "  Paste Gemini API key (Enter to skip): ")).trim();
        if (key) {
            config.GEMINI_API_KEY = key;
            saveConfig(config);
            console.log("  ✔ Key saved to data/config.json.");
        } else {
            console.log("  Skipped. Set GEMINI_API_KEY in your environment when ready.");
        }
    }

    // ── 3. Personal SSH key (optional, for px start/end --perso) ──────────
    const usesPerso = (await ask(rl, "\n  Use a personal SSH key for git? (y/N): ")).trim().toLowerCase();
    if (usesPerso === "y") {
        const home = process.env.USERPROFILE || process.env.HOME || "~";
        const defaultKey = path.join(home, ".ssh", "id_ed25519_personal");
        const keyInput = (await ask(rl, `  SSH key path [${defaultKey}]: `)).trim();
        const keyPath = keyInput || defaultKey;
        if (fs.existsSync(keyPath)) {
            config.personalSshKey = keyPath;
            saveConfig(config);
            console.log(`  ✔ Personal SSH key saved: ${keyPath}`);
            console.log(`  Use: px start --perso / px end --perso`);
        } else {
            console.log(`  ⚠ Key not found at ${keyPath} — skipped.`);
        }
    }

    // ── 4. Data directory + initial data.json ─────────────────────────────
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log("\n  ✔ Created data/ directory.");
    }

    const dataPath = path.join(DATA_DIR, "data.json");
    if (!fs.existsSync(dataPath)) {
        saveData(loadData()); // loadData returns empty defaults on first run
        console.log("  ✔ Created data/data.json.");
    } else {
        console.log("\n  ✔ data/data.json already exists.");
    }

    // ── 5. .gitignore ─────────────────────────────────────────────────────
    const gitignorePath = path.join(ROOT, ".gitignore");
    const ignoreEntries = ["node_modules/", "dist/", "*.bak", "data/config.json"];
    if (!fs.existsSync(gitignorePath)) {
        fs.writeFileSync(gitignorePath, ignoreEntries.join("\n") + "\n", "utf-8");
        console.log("  ✔ Created .gitignore.");
    } else {
        const existing = fs.readFileSync(gitignorePath, "utf-8");
        const toAdd = ignoreEntries.filter((e) => !existing.includes(e));
        if (toAdd.length > 0) {
            fs.appendFileSync(gitignorePath, "\n" + toAdd.join("\n") + "\n");
            console.log(`  ✔ Added to .gitignore: ${toAdd.join(", ")}`);
        }
    }

    // ── 6. Summary ────────────────────────────────────────────────────────
    console.log(`\n--- Setup complete! ---`);
    if (!hasGit) {
        console.log(`\n  ⚠ Git not configured — px start/end won't sync until you do:`);
        console.log(`      git remote add origin <your-repo-url>`);
    }
    console.log(`\n  Quick start:`);
    console.log(`    px project add "My first project"`);
    console.log(`    px add "First task" --project "My first project"`);
    console.log(`    px list\n`);

    rl.close();
}