import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { execSync } from "child_process";
import { loadData, saveData, loadConfig, saveConfig } from "../utils/storage";

const ROOT = path.join(__dirname, "../../");

function ask(rl: readline.Interface, question: string): Promise<string> {
    return new Promise((resolve) => rl.question(question, resolve));
}

function askWithDefault(rl: readline.Interface, question: string, defaultValue: string): Promise<string> {
    return new Promise((resolve) =>
        rl.question(`${question} [${defaultValue}]: `, (ans) => resolve(ans.trim() || defaultValue))
    );
}

async function setupDataDir(rl: readline.Interface, config: any): Promise<string> {
    console.log("\n--- 📁 Data Directory ---\n");
    console.log("  Where should px store your tasks and config?");
    console.log("  Options:");
    console.log("    1) Inside the install folder (default, portable)");
    console.log("    2) Home directory  (~/.px-data)");
    console.log("    3) Custom path");

    const choice = (await ask(rl, "\n  Choose [1/2/3]: ")).trim();

    let dataDir: string;

    if (choice === "2") {
        const home = process.env.USERPROFILE || process.env.HOME || "~";
        dataDir = path.join(home, ".px-data");
    } else if (choice === "3") {
        const custom = (await ask(rl, "  Enter full path: ")).trim();
        if (!custom) {
            console.log("  ⚠ No path entered, using default.");
            dataDir = path.join(ROOT, "data");
        } else {
            dataDir = path.resolve(custom);
        }
    } else {
        dataDir = path.join(ROOT, "data");
    }

    // Create directory if it doesn't exist
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log(`  ✔ Created data directory: ${dataDir}`);
    } else {
        console.log(`  ✔ Using existing directory: ${dataDir}`);
    }

    // Save the data dir path to config so all other commands can find it
    config.dataDir = dataDir;
    saveConfig(config);

    // Initialize data.json if missing
    const dataPath = path.join(dataDir, "data.json");
    if (!fs.existsSync(dataPath)) {
        saveData(loadData());
        console.log("  ✔ Created data.json.");
    } else {
        console.log("  ✔ data.json already exists.");
    }

    return dataDir;
}

async function setupGit(rl: readline.Interface, config: any, dataDir: string): Promise<boolean> {
    console.log("\n--- 🔗 Git Repository ---\n");
    console.log("  Git is used by px start / px end to sync your data.");
    console.log("  Options:");
    console.log("    1) Use existing repo in current directory");
    console.log("    2) Create a new repo in a custom folder");
    console.log("    3) Use a remote URL (clone or link)");
    console.log("    4) Skip git setup");

    const choice = (await ask(rl, "\n  Choose [1/2/3/4]: ")).trim();

    if (choice === "4") {
        console.log("  Skipped. px start/end won't sync until you configure git.");
        return false;
    }

    let gitDir: string = ROOT;
    let hasGit = false;

    // ── Option 1: current directory ──────────────────────────────────────
    if (choice === "1") {
        try {
            execSync("git rev-parse --is-inside-work-tree", { stdio: "pipe" });
            const remote = execSync("git remote get-url origin", { encoding: "utf-8", stdio: "pipe" }).trim();
            console.log(`  ✔ Git repo found. Remote: ${remote}`);
            hasGit = true;
            config.gitDir = process.cwd();
        } catch {
            console.log("  ⚠ No git repo found in current directory.");
            const init = (await ask(rl, "  Initialize one here? (y/N): ")).trim().toLowerCase();
            if (init === "y") {
                execSync("git init", { stdio: "inherit" });
                const remote = (await ask(rl, "  Remote URL (Enter to skip): ")).trim();
                if (remote) {
                    execSync(`git remote add origin ${remote}`, { stdio: "inherit" });
                    console.log("  ✔ Remote set.");
                }
                config.gitDir = process.cwd();
                hasGit = true;
            }
        }
    }

    // ── Option 2: create repo in custom folder ────────────────────────────
    else if (choice === "2") {
        const home = process.env.USERPROFILE || process.env.HOME || "~";
        const defaultPath = path.join(home, "px-sync");
        const customPath = await askWithDefault(rl, "  Folder path", defaultPath);
        gitDir = path.resolve(customPath);

        if (!fs.existsSync(gitDir)) {
            fs.mkdirSync(gitDir, { recursive: true });
            console.log(`  ✔ Created folder: ${gitDir}`);
        }

        execSync("git init", { cwd: gitDir, stdio: "inherit" });
        console.log(`  ✔ Git repo initialized in: ${gitDir}`);

        const remote = (await ask(rl, "  Remote URL (Enter to skip): ")).trim();
        if (remote) {
            execSync(`git remote add origin ${remote}`, { cwd: gitDir, stdio: "inherit" });
            console.log("  ✔ Remote set.");
        }

        config.gitDir = gitDir;
        hasGit = true;

        // Ask if data dir should be moved inside the git repo
        const moveData = (await ask(rl, "\n  Move data folder inside this git repo for auto-sync? (Y/n): "))
            .trim()
            .toLowerCase();
        if (moveData !== "n") {
            const newDataDir = path.join(gitDir, "data");
            if (!fs.existsSync(newDataDir)) {
                fs.mkdirSync(newDataDir, { recursive: true });
            }
            // Copy existing data files
            for (const file of fs.readdirSync(dataDir)) {
                fs.copyFileSync(path.join(dataDir, file), path.join(newDataDir, file));
            }
            config.dataDir = newDataDir;
            saveConfig(config);
            console.log(`  ✔ Data moved to: ${newDataDir}`);
        }
    }

    // ── Option 3: remote URL ──────────────────────────────────────────────
    else if (choice === "3") {
        const remote = (await ask(rl, "  Remote URL: ")).trim();
        if (!remote) {
            console.log("  ⚠ No URL provided, skipping.");
            return false;
        }

        // Check if already inside a git repo
        let alreadyGit = false;
        try {
            execSync("git rev-parse --is-inside-work-tree", { stdio: "pipe" });
            alreadyGit = true;
        } catch { }

        if (alreadyGit) {
            try {
                execSync(`git remote set-url origin ${remote}`, { stdio: "inherit" });
                console.log("  ✔ Updated remote URL.");
            } catch {
                execSync(`git remote add origin ${remote}`, { stdio: "inherit" });
                console.log("  ✔ Remote added.");
            }
            config.gitDir = process.cwd();
        } else {
            // Initialize and link
            execSync("git init", { stdio: "inherit" });
            execSync(`git remote add origin ${remote}`, { stdio: "inherit" });
            console.log("  ✔ Repo initialized and remote set.");
            config.gitDir = process.cwd();
        }
        hasGit = true;
    }

    saveConfig(config);
    return hasGit;
}

async function setupGitignore(gitDir: string, dataDir: string): Promise<void> {
    const gitignorePath = path.join(gitDir, ".gitignore");
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
}

export async function initCommand(): Promise<void> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log(`\n╔══════════════════════════════╗`);
    console.log(`║   px init — Setup Wizard     ║`);
    console.log(`╚══════════════════════════════╝`);

    const config = loadConfig();

    // ── 1. Data directory ─────────────────────────────────────────────────
    const dataDir = await setupDataDir(rl, config);

    // ── 2. Git setup ──────────────────────────────────────────────────────
    const hasGit = await setupGit(rl, config, dataDir);

    // ── 3. Gemini API key ─────────────────────────────────────────────────
    console.log("\n--- 🤖 Gemini API Key ---\n");
    let geminiKey = config.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";

    if (geminiKey) {
        console.log(`  ✔ Gemini API key already set.`);
        const change = (await ask(rl, "  Replace it? (y/N): ")).trim().toLowerCase();
        if (change === "y") geminiKey = "";
    } else {
        console.log(`  Needed for px ai commands.`);
        console.log(`  Get one free at: https://aistudio.google.com/app/apikey`);
    }

    if (!geminiKey) {
        const key = (await ask(rl, "  Paste Gemini API key (Enter to skip): ")).trim();
        if (key) {
            config.GEMINI_API_KEY = key;
            saveConfig(config);
            console.log("  ✔ Key saved.");
        } else {
            console.log("  Skipped. Set GEMINI_API_KEY in your environment when ready.");
        }
    }

    // ── 4. Personal SSH key ───────────────────────────────────────────────
    console.log("\n--- 🔑 SSH Key (optional) ---\n");
    const usesPerso = (await ask(rl, "  Use a personal SSH key for git? (y/N): ")).trim().toLowerCase();
    if (usesPerso === "y") {
        const home = process.env.USERPROFILE || process.env.HOME || "~";
        const defaultKey = path.join(home, ".ssh", "id_ed25519_personal");
        const keyPath = await askWithDefault(rl, "  SSH key path", defaultKey);
        if (fs.existsSync(keyPath)) {
            config.personalSshKey = keyPath;
            saveConfig(config);
            console.log(`  ✔ SSH key saved: ${keyPath}`);
        } else {
            console.log(`  ⚠ Key not found at ${keyPath} — skipped.`);
        }
    }

    // ── 5. .gitignore ─────────────────────────────────────────────────────
    console.log("\n--- 📄 .gitignore ---\n");
    await setupGitignore(config.gitDir || ROOT, config.dataDir || dataDir);

    // ── 6. Summary ────────────────────────────────────────────────────────
    console.log(`\n╔══════════════════════════════╗`);
    console.log(`║      Setup complete! ✔       ║`);
    console.log(`╚══════════════════════════════╝\n`);
    console.log(`  📁 Data dir : ${config.dataDir || dataDir}`);
    console.log(`  🔗 Git dir  : ${config.gitDir || "not configured"}`);
    console.log(`  🤖 Gemini   : ${config.GEMINI_API_KEY ? "configured" : "not set"}\n`);

    if (!hasGit) {
        console.log(`  ⚠ Git not configured — px start/end won't sync.\n`);
    }

    console.log(`  Quick start:`);
    console.log(`    px project add "My first project"`);
    console.log(`    px add "First task" --project "My first project"`);
    console.log(`    px list\n`);

    rl.close();
}