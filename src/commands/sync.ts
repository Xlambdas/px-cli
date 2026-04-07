import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { loadData, saveData } from "../utils/storage";
import { AppData, Task } from "../models";
import { canComplete, fmtDeadline, fmtDuration, projectProgress } from "../utils/helpers";

/**
    * FEATURE FLAG
    * Set to true to enable markdown export on px end / markdown import on px start.
    * Set to false to only do git pull/push.
*/
const ENABLE_MARKDOWN_SYNC = true;

const DATA_DIR = path.join(__dirname, "../../data");
const MD_PATH = path.join(DATA_DIR, "projects.md");

/**
    * px start
    *
    * Morning routine:
    * 1. git pull (get latest from any device)
    * 2. If markdown sync enabled:
    *    - Check if projects.md was edited
    *    - If yes, parse changes back into data.json
    *    - Backup data.json before overwriting
*/
export function pxStart(): void {
    const cwd = path.join(__dirname, "../..");

    // Git pull
    console.log("\n  ⬇ Pulling latest changes...");
    try {
        const output = execSync("git pull", { cwd, encoding: "utf-8", stdio: "pipe" });
        console.log(`  ${output.trim()}`);
    } catch (err: any) {
        console.error(`  ⚠ Git pull failed: ${err.message}`);
        console.error("  Make sure you're in a git repo and have a remote set up.");
        return;
    }

    if (!ENABLE_MARKDOWN_SYNC) {
        console.log("\n  ✓ Ready to work!\n");
        return;
    }

    // Check if projects.md exists and was modified
    if (!fs.existsSync(MD_PATH)) {
        console.log("  No projects.md found — skipping import.");
        console.log("\n  ✓ Ready to work!\n");
        return;
    }

    const data = loadData();
    const mdContent = fs.readFileSync(MD_PATH, "utf-8");

    // Check if md is empty or just whitespace
    if (!mdContent.trim()) {
        console.log("  projects.md is empty — skipping import.");
        console.log("\n  ✓ Ready to work!\n");
        return;
    }

    // Parse markdown back into data
    const changes = parseMarkdown(mdContent, data);

    if (changes > 0) {
        // Backup before applying
        const bakPath = path.join(DATA_DIR, "data.json.pre-import.bak");
        const dataPath = path.join(DATA_DIR, "data.json");
        if (fs.existsSync(dataPath)) {
            fs.copyFileSync(dataPath, bakPath);
            console.log(`  📦 Backup saved: data.json.pre-import.bak`);
        }

        saveData(data);
        console.log(`  ✓ Imported ${changes} change(s) from projects.md`);
    } else {
        console.log("  No changes detected in projects.md.");
    }

    console.log("\n  ✓ Ready to work!\n");
}

/**
    * px end
    *
    * End of session:
    * 1. If markdown sync enabled, export data to projects.md
    * 2. git add, commit, push
*/
export function pxEnd(): void {
    const cwd = path.join(__dirname, "../..");

    if (ENABLE_MARKDOWN_SYNC) {
        const data = loadData();
        exportMarkdown(data);
        console.log("  📄 projects.md updated");
    }

    // Git add, commit, push
    console.log("\n  ⬆ Pushing changes...");
    try {
        execSync("git add -A", { cwd, encoding: "utf-8", stdio: "pipe" });

        // Check if there's anything to commit
        try {
            execSync("git diff --cached --quiet", { cwd, encoding: "utf-8", stdio: "pipe" });
            console.log("  Nothing to commit.");
        } catch {
            // diff --quiet exits with 1 if there are changes
            const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
            execSync(`git commit -m "px update ${timestamp}"`, { cwd, encoding: "utf-8", stdio: "pipe" });
            console.log("  ✓ Committed");
        }

        execSync("git push", { cwd, encoding: "utf-8", stdio: "pipe" });
        console.log("  ✓ Pushed");
    } catch (err: any) {
        console.error(`  ⚠ Git error: ${err.message}`);
        return;
    }

    console.log("\n  ✓ Session saved! 🚀\n");
}

/**
    * Export data.json → projects.md
    * Human-readable, editable format.
    *
    * Format:
    *   # Project Name
    *   > Description here
    *   Deadline: 2026-05-01
    *
    *   - [x] #1 Task done (60min)
    *   - [ ] #2 Task todo (90min) [needs #1]
    *     - [x] #3 Subtask done
    *     - [ ] #4 Subtask todo
    *
    *   ## Inbox
    *   - [ ] #9 Unassigned task
*/
function exportMarkdown(data: AppData): void {
    let md = `<!-- PX PROJECTS — Edit tasks here, then run px start to import -->\n`;
    md += `<!-- Format: - [x] #ID Title (duration) [needs #ID, #ID] -->\n`;
    md += `<!-- Change [x] to [ ] or [ ] to [x] to toggle status -->\n\n`;

    for (const p of data.projects) {
        const pct = projectProgress(data, p.id);
        md += `# ${p.title}  (${pct}%)\n`;
        if (p.description) md += `> ${p.description}\n`;
        if (p.deadline) md += `Deadline: ${p.deadline}\n`;

        const profile = data.projectProfiles?.[p.id];
        if (profile?.type) md += `Type: ${profile.type}\n`;
        if (profile?.stage) md += `Stage: ${profile.stage}\n`;
        if (profile?.goal) md += `Goal: ${profile.goal}\n`;

        md += `\n`;

        // Top-level tasks for this project
        const topTasks = data.tasks.filter(
            (t) => t.projectIds.includes(p.id) && t.parentId === undefined
        );

        for (const t of topTasks) {
            md += formatTaskMd(t, data, 0);
        }

        md += `\n`;
    }

    // Inbox tasks (no project, no parent)
    const inbox = data.tasks.filter(
        (t) => t.projectIds.length === 0 && t.parentId === undefined
    );
    if (inbox.length > 0) {
        md += `# Inbox\n\n`;
        for (const t of inbox) {
            md += formatTaskMd(t, data, 0);
        }
        md += `\n`;
    }

    fs.writeFileSync(MD_PATH, md, "utf-8");
}

function formatTaskMd(task: Task, data: AppData, indent: number): string {
    const prefix = "  ".repeat(indent);
    const check = task.status === "done" ? "[x]" : "[ ]";
    const dur = task.duration ? ` (${task.duration}min)` : "";
    const deps = task.conditionIds.length > 0
        ? ` [needs ${task.conditionIds.map((id) => `#${id}`).join(", ")}]`
        : "";
    const dl = task.deadline ? ` {${task.deadline}}` : "";

    let line = `${prefix}- ${check} #${task.id} ${task.title}${dur}${deps}${dl}\n`;

    // Subtasks
    for (const sid of task.subtaskIds) {
        const sub = data.tasks.find((s) => s.id === sid);
        if (sub) {
            line += formatTaskMd(sub, data, indent + 1);
        }
    }

    return line;
}

/**
    * Parse projects.md back into data.
    * Only updates STATUS changes (checked/unchecked).
    * Returns number of changes made.
    *
    * WHY only status? → Keeping it simple. Renaming tasks or adding new ones
    * via markdown is fragile. Status toggle is safe and useful.
*/
function parseMarkdown(md: string, data: AppData): number {
    let changes = 0;

    // Match lines like: - [x] #3 Task title
    // or:               - [ ] #3 Task title
    const taskRegex = /^[\s]*-\s+\[(x| )\]\s+#(\d+)\s/gm;
    let match: RegExpExecArray | null;

    while ((match = taskRegex.exec(md)) !== null) {
        const isDone = match[1] === "x";
        const taskId = parseInt(match[2], 10);
        const task = data.tasks.find((t) => t.id === taskId);

        if (!task) continue;

        const newStatus = isDone ? "done" : "todo";
        if (task.status !== newStatus) {
            task.status = newStatus;
            if (isDone && !task.completedAt) {
                task.completedAt = new Date().toISOString();
            }
            if (!isDone) {
                task.completedAt = undefined;
            }
            changes++;
        }
    }

    return changes;
}