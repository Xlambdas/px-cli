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
    console.log("\n--- Data Directory ---\n");
    console.log("  Where should px store your tasks and config?");
    console.log("  Options:");
    console.log("    1) Current folder (recommended — git + data in one place)");
    console.log("    2) Inside the install folder (portable)");
    console.log("    3) Home directory  (~/.px-data)");
    console.log("    4) Custom path");

    const choice = (await ask(rl, "\n  Choose [1/2/3/4]: ")).trim();

    let dataDir: string;

    if (choice === "2") {
        dataDir = path.join(ROOT, "data");
    } else if (choice === "3") {
        const home = process.env.USERPROFILE || process.env.HOME || "~";
        dataDir = path.join(home, ".px-data");
    } else if (choice === "4") {
        const custom = (await ask(rl, "  Enter full path: ")).trim();
        dataDir = custom ? path.resolve(custom) : path.join(process.cwd(), "data");
        if (!custom) console.log("  ⚠ No path entered, using current folder.");
    } else {
        dataDir = path.join(process.cwd(), "data");
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

    // Build GIT_SSH_COMMAND env from a key path
    const sshEnv = (keyPath: string) => ({
        ...process.env,
        GIT_SSH_COMMAND: `ssh -i "${keyPath}" -o IdentitiesOnly=yes`,
    });

    // Prompt for an SSH key whenever a remote URL is involved
    const askSshKey = async (): Promise<string | undefined> => {
        const home = process.env.USERPROFILE || process.env.HOME || "~";
        const use = (await ask(rl, "  Use a specific SSH key for this remote? (y/N): ")).trim().toLowerCase();
        if (use !== "y") return undefined;
        const defaultKey = config.personalSshKey || path.join(home, ".ssh", "id_ed25519");
        const keyPath = await askWithDefault(rl, "  SSH key path", defaultKey);
        if (!fs.existsSync(keyPath)) {
            console.log(`  ⚠ Key not found at ${keyPath} — using default SSH agent.`);
            return undefined;
        }
        config.personalSshKey = keyPath;
        return keyPath;
    };

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
            const sshKey = await askSshKey();
            const env = sshKey ? sshEnv(sshKey) : { ...process.env };
            execSync(`git remote add origin ${remote}`, { cwd: gitDir, stdio: "inherit", env });
            console.log("  ✔ Remote set.");
        }

        config.gitDir = gitDir;
        hasGit = true;
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

        const sshKey = await askSshKey();
        const env = sshKey ? sshEnv(sshKey) : { ...process.env };

        if (alreadyGit) {
            try {
                execSync(`git remote set-url origin ${remote}`, { stdio: "inherit", env });
                console.log("  ✔ Updated remote URL.");
            } catch {
                execSync(`git remote add origin ${remote}`, { stdio: "inherit", env });
                console.log("  ✔ Remote added.");
            }
            config.gitDir = process.cwd();
        } else {
            execSync("git init", { stdio: "inherit", env });
            execSync(`git remote add origin ${remote}`, { stdio: "inherit", env });
            console.log("  ✔ Repo initialized and remote set.");
            config.gitDir = process.cwd();
        }
        hasGit = true;
    }

    // Always keep data inside the git repo so px end commits it automatically
    if (hasGit && config.gitDir) {
        const syncedDataDir = path.join(config.gitDir, "data");
        if (path.resolve(config.dataDir || dataDir) !== path.resolve(syncedDataDir)) {
            if (!fs.existsSync(syncedDataDir)) fs.mkdirSync(syncedDataDir, { recursive: true });
            const sourceDir = config.dataDir || dataDir;
            if (fs.existsSync(sourceDir)) {
                for (const file of fs.readdirSync(sourceDir)) {
                    fs.copyFileSync(path.join(sourceDir, file), path.join(syncedDataDir, file));
                }
            }
            config.dataDir = syncedDataDir;
            console.log(`  ✔ Data linked inside git repo: ${syncedDataDir}`);
        }
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
    if (config.personalSshKey) {
        console.log(`  ✔ SSH key already configured: ${config.personalSshKey}`);
    } else {
        const usesPerso = (await ask(rl, "  Use a specific SSH key for git? (y/N): ")).trim().toLowerCase();
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