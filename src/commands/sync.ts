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

    // Check if projects.md exists
    if (!fs.existsSync(MD_PATH)) {
        console.log("  No projects.md found — skipping import.");
        console.log("\n  ✓ Ready to work!\n");
        return;
    }

    const mdContent = fs.readFileSync(MD_PATH, "utf-8");

    if (!mdContent.trim()) {
        console.log("  projects.md is empty — skipping import.");
        console.log("\n  ✓ Ready to work!\n");
        return;
    }

    // Create timestamped backup BEFORE any changes
    const dataPath = path.join(DATA_DIR, "data.json");
    if (fs.existsSync(dataPath)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const bakPath = path.join(DATA_DIR, `data.${timestamp}.import.bak`);
        fs.copyFileSync(dataPath, bakPath);
        console.log(`  📦 Backup: ${path.basename(bakPath)}`);
    }

    // Load data and apply ALL changes from markdown
    const data = loadData();
    const changes = parseMarkdown(mdContent, data);

    if (changes.total > 0) {
        saveData(data);
        console.log(`  ✓ Imported from projects.md:`);
        if (changes.statusChanges > 0) console.log(`      ${changes.statusChanges} status change(s)`);
        if (changes.titleChanges > 0) console.log(`      ${changes.titleChanges} title update(s)`);
        if (changes.durationChanges > 0) console.log(`      ${changes.durationChanges} duration update(s)`);
        if (changes.deadlineChanges > 0) console.log(`      ${changes.deadlineChanges} deadline update(s)`);
        if (changes.depChanges > 0) console.log(`      ${changes.depChanges} dependency update(s)`);
        if (changes.newTasks > 0) console.log(`      ${changes.newTasks} new task(s) added`);
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

interface ImportChanges {
    statusChanges: number;
    titleChanges: number;
    durationChanges: number;
    deadlineChanges: number;
    depChanges: number;
    newTasks: number;
    total: number;
}

/**
 * Parse projects.md back into data.
 * Updates: status, title, duration, deadline, dependencies.
 * Creates new tasks if they don't have a #ID.
 *
 * Task line format:
 *   - [x] #3 Task title (60min) [needs #1, #2] {2026-05-01}
 *   - [ ] New task without ID (45min)
 *
 * We detect:
 *   #ID             → existing task (update it)
 *   no #ID          → new task (create it)
 *   [x] vs [ ]      → status
 *   (NUMmin)        → duration
 *   [needs #N, #M]  → dependencies
 *   {YYYY-MM-DD}    → deadline
 *   everything else → title
 */
function parseMarkdown(md: string, data: AppData): ImportChanges {
    const changes: ImportChanges = {
        statusChanges: 0,
        titleChanges: 0,
        durationChanges: 0,
        deadlineChanges: 0,
        depChanges: 0,
        newTasks: 0,
        total: 0,
    };

    let currentProjectId: number | null = null;
    let currentParentId: number | undefined = undefined;
    let lastTopLevelTaskId: number | undefined = undefined;

    const lines = md.split("\n");

    for (const line of lines) {
        // Detect project headers: # Project Name  (50%)
        const projectMatch = line.match(/^#\s+(.+?)(?:\s+\(\d+%\))?$/);
        if (projectMatch) {
            const projectName = projectMatch[1].trim();
            if (projectName.toLowerCase() === "inbox") {
                currentProjectId = 0; // special: inbox
            } else {
                const project = data.projects.find(
                    (p) => p.title.toLowerCase() === projectName.toLowerCase()
                );
                currentProjectId = project ? project.id : null;
            }
            currentParentId = undefined;
            lastTopLevelTaskId = undefined;
            continue;
        }

        // Detect task lines: - [x] #3 Title (60min) [needs #1] {2026-05-01}
        //                or: - [ ] New task title (30min)
        const taskMatch = line.match(/^(\s*)-\s+\[(x| )\]\s+(.*)/);
        if (!taskMatch) continue;

        const indent = taskMatch[1].length;
        const isDone = taskMatch[2] === "x";
        const rest = taskMatch[3].trim();

        // Parse components from the rest of the line
        const idMatch = rest.match(/^#(\d+)\s+/);
        const durationMatch = rest.match(/\((\d+)min\)/);
        const depsMatch = rest.match(/\[needs\s+([^\]]+)\]/);
        const deadlineMatch = rest.match(/\{(\d{4}-\d{2}-\d{2})\}/);

        // Extract title: remove #ID, (duration), [needs], {deadline}
        let title = rest
            .replace(/^#\d+\s+/, "")
            .replace(/\(\d+min\)/, "")
            .replace(/\[needs\s+[^\]]+\]/, "")
            .replace(/\{\d{4}-\d{2}-\d{2}\}/, "")
            .trim();

        const duration = durationMatch ? parseInt(durationMatch[1], 10) : undefined;
        const deadline = deadlineMatch ? deadlineMatch[1] : undefined;
        const depIds = depsMatch
            ? depsMatch[1].split(",").map((s) => parseInt(s.trim().replace("#", ""), 10)).filter((n) => !isNaN(n))
            : [];

        const isSubtask = indent >= 2;

        if (idMatch) {
            // ── Existing task: update fields ──
            const taskId = parseInt(idMatch[1], 10);
            const task = data.tasks.find((t) => t.id === taskId);
            if (!task) continue;

            // Status
            const newStatus = isDone ? "done" : "todo";
            if (task.status !== newStatus) {
                task.status = newStatus;
                if (isDone && !task.completedAt) task.completedAt = new Date().toISOString();
                if (!isDone) task.completedAt = undefined;
                changes.statusChanges++;
            }

            // Title
            if (title && title !== task.title) {
                task.title = title;
                changes.titleChanges++;
            }

            // Duration
            if (duration !== undefined && duration !== task.duration) {
                task.duration = duration;
                changes.durationChanges++;
            }

            // Deadline
            if (deadline && deadline !== task.deadline) {
                task.deadline = deadline;
                changes.deadlineChanges++;
            } else if (!deadline && task.deadline) {
                task.deadline = undefined;
                changes.deadlineChanges++;
            }

            // Dependencies
            const currentDeps = JSON.stringify(task.conditionIds.sort());
            const newDeps = JSON.stringify(depIds.sort());
            if (currentDeps !== newDeps) {
                task.conditionIds = depIds;
                changes.depChanges++;
            }

            // Track for subtask parenting
            if (!isSubtask) {
                lastTopLevelTaskId = taskId;
            }

        } else {
            // ── New task: no #ID found ──
            if (!title) continue;

            const projectIds: number[] = [];
            if (currentProjectId && currentProjectId > 0) {
                projectIds.push(currentProjectId);
            }

            const parentId = isSubtask ? lastTopLevelTaskId : undefined;

            const newTask: Task = {
                id: data.nextTaskId++,
                title,
                projectIds,
                parentId,
                subtaskIds: [],
                conditionIds: depIds,
                status: isDone ? "done" : "todo",
                duration,
                deadline,
                createdAt: new Date().toISOString(),
                completedAt: isDone ? new Date().toISOString() : undefined,
            };

            data.tasks.push(newTask);

            // Register as subtask in parent
            if (parentId !== undefined) {
                const parent = data.tasks.find((t) => t.id === parentId);
                if (parent) {
                    parent.subtaskIds.push(newTask.id);
                }
            }

            // Track for subtask parenting
            if (!isSubtask) {
                lastTopLevelTaskId = newTask.id;
            }

            changes.newTasks++;
        }
    }

    changes.total = changes.statusChanges + changes.titleChanges + changes.durationChanges
        + changes.deadlineChanges + changes.depChanges + changes.newTasks;

    return changes;
}