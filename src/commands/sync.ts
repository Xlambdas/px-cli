import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { loadData, saveData } from "../utils/storage";
import { AppData, Task, generateSubtaskId, generateTaskId } from "../models";
import { canComplete, fmtDeadline, fmtDuration, projectProgress } from "../utils/helpers";
import { spawnSync } from "child_process";

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
    * 1. git pull (get latest from any device)
    * 2. If markdown sync enabled:
    *    - Check if projects.md was edited
    *    - If yes, parse changes back into data.json
    *    - Backup data.json before overwriting
*/
export function pxStart(perso: boolean = false): void {
    const cwd = process.cwd();

    // Git pull
    if (perso) {
        console.log("\n  ⬇ Pulling latest changes (personal)...");
        const home = process.env.USERPROFILE || process.env.HOME || "";
        const keyPath = path.join(home, ".ssh", "id_ed25519_personal");
        const sshCmd = `ssh -vvv -i "${keyPath}" -o IdentitiesOnly=yes`;
        // console.log(`  DEBUG: key = ${keyPath}`);
        // console.log(`  DEBUG: cwd = ${cwd}`);
        // console.log(`  DEBUG: GIT_SSH_COMMAND = ${sshCmd}`);
        try {
            execSync(`git pull`, {
                cwd,
                stdio: "inherit",
                env: { ...process.env, GIT_SSH_COMMAND: sshCmd },
            });
        } catch (err: any) {
            console.error(`  ⚠ Git pull failed`);
            return;
        }
    } else {
        console.log("\n  ⬇ Pulling latest changes...");
        try {
            const output = execSync("git pull", {
                cwd,
                encoding: "utf-8",
                stdio: "pipe",
                env: { ...process.env },
            });
            console.log(`  ${output.trim()}`);
        } catch (err: any) {
            console.error(`  ⚠ Git pull failed: ${err.message}`);
            return;
        }
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
        console.log(`  Backup: ${path.basename(bakPath)}`);
        cleanOldBackups();
    }

    // Load data and apply ALL changes from markdown
    const data = loadData();
    const changes = parseMarkdown(mdContent, data);

    // Auto-reset recurring today tasks that are due
    if (data.todayTasks) {
        const today = new Date();
        for (const t of data.todayTasks) {
            if (t.recurrence && t.status === "done") {
                const days = parseRecurrenceDays(t.recurrence);
                if (days !== null && t.completedAt) {
                    const lastDone = new Date(t.completedAt);
                    const diff = Math.floor((today.getTime() - lastDone.getTime()) / (1000 * 60 * 60 * 24));
                    if (diff >= days) {
                        t.status = "todo";
                        t.completedAt = undefined;
                    }
                }
            }
        }
    }

    // Always save — even if parseMarkdown reports 0 "changes",
    // the git pull may have updated data.json itself
    saveData(data);

    if (changes.total > 0) {
        console.log(`  ✓ Imported from projects.md:`);
        if (changes.newProjects > 0) console.log(`      ${changes.newProjects} new project(s)`);
        if (changes.newTasks > 0) console.log(`      ${changes.newTasks} new task(s) added`);
        if (changes.statusChanges > 0) console.log(`      ${changes.statusChanges} status change(s)`);
        if (changes.titleChanges > 0) console.log(`      ${changes.titleChanges} title update(s)`);
        if (changes.durationChanges > 0) console.log(`      ${changes.durationChanges} duration update(s)`);
        if (changes.deadlineChanges > 0) console.log(`      ${changes.deadlineChanges} deadline update(s)`);
        if (changes.depChanges > 0) console.log(`      ${changes.depChanges} dependency update(s)`);
        if (changes.deletedProjects > 0) console.log(`      ${changes.deletedProjects} deleted project(s)`);
        if (changes.deletedTasks > 0) console.log(`      ${changes.deletedTasks} deleted task(s)`);
    } else {
        console.log("  No changes detected in projects.md.");
    }

    console.log("\n  ✓ Ready to work!\n");
}

/**
    * Keep only the last 5 import backups.
*/
function cleanOldBackups(): void {
    try {
        const files = fs.readdirSync(DATA_DIR)
            .filter((f) => f.match(/^data\..*\.import\.bak$/))
            .sort()
            .reverse();

        // Delete all but the last 5
        for (let i = 5; i < files.length; i++) {
            fs.unlinkSync(path.join(DATA_DIR, files[i]));
        }
    } catch {
        // Not critical — ignore errors
    }
}

/**
    * px end
    *
    * End of session:
    * 1. If markdown sync enabled, export data to projects.md
    * 2. git add, commit, push
*/
export function pxEnd(perso: boolean=false): void {
    const cwd = process.cwd();

    if (ENABLE_MARKDOWN_SYNC) {
        const data = loadData();

        // Clear completed non-recurring today tasks, keep the rest
        if (data.todayTasks) {
            data.todayTasks = data.todayTasks.filter((t) => {
                if (t.status !== "done") return true;       // keep undone
                if (t.recurrence) return true;             // keep recurring even if done
                return false;                             // remove done non-recurring
            });
            saveData(data);
        }

        exportMarkdown(data);
        console.log(" -- projects.md updated");
    }

    // Git add, commit, push
    if (perso) {
        console.log("\n  ⬆ Pushing changes (personal)...");
        const home = process.env.USERPROFILE || process.env.HOME || "";
        const keyPath = path.join(home, ".ssh", "id_ed25519_personal");
        const sshCmd = `ssh -vvv -i "${keyPath}" -o IdentitiesOnly=yes`;
        try {
            execSync(`git add -A`, {
                cwd,
                stdio: "inherit",
                env: { ...process.env, GIT_SSH_COMMAND: sshCmd },
            });
            try {
                execSync("git diff --cached --quiet", { cwd, stdio: "pipe" });
                console.log("  Nothing to commit.");
            } catch {
                const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
                execSync(`git commit -m "px update ${timestamp}"`, {
                    cwd,
                    stdio: "inherit",
                    env: { ...process.env, GIT_SSH_COMMAND: sshCmd },
                });
                console.log("  ✓ Committed");
            }
            execSync(`git push`, {
                cwd,
                stdio: "inherit",
                env: { ...process.env, GIT_SSH_COMMAND: sshCmd },
            });
        } catch (err: any) {
            console.error(`  ⚠ Git error: ${err.message}`);
            return;
        }
    } else {
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
    }

    console.log("\n  ✓ Session saved!\n");
}

/**
    * Export data.json → projects.md
    *
    * Format:
    *   # Project Name
    *   > Description here
    *   Deadline: 2026-05-01
    *
    *   - [x] 2.1 Task done (60min)
    *   - [ ] 2.2 Task todo (90min) [needs 2.1]
    *     - [x] 2.2.1 Subtask done
    *     - [ ] 2.2.2 Subtask todo
    *
    *   ## Inbox
    *   - [ ] 9 Unassigned task
*/
function exportMarkdown(data: AppData): void {
    let md = `<!-- PX PROJECTS — Edit tasks here, then run px start to import -->\n`;
    md += `<!-- Format: - [x] ID Title (duration) [needs ID, ID] -->\n`;
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

    // Today tasks section
    if (data.todayTasks && data.todayTasks.length > 0) {
        md += `---\n\n`;
        md += `# Todo Today\n\n`;
        for (const t of data.todayTasks) {
            const check = t.status === "done" ? "[x]" : "[ ]";
            const dur = t.duration ? ` (${t.duration}min)` : "";
            const rec = t.recurrence ? ` [every ${t.recurrence}]` : "";
            md += `- ${check} ${t.title}${dur}${rec}\n`;
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
        ? ` [needs ${task.conditionIds.join(", ")}]`
        : "";
    const dl = task.deadline ? ` {${task.deadline}}` : "";

    let line = `${prefix}- ${check} ${task.id} ${task.title}${dur}${deps}${dl}\n`;

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
    newProjects: number;
    deletedProjects: number;
    deletedTasks: number;
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
    * Creates new tasks if they don't have an explicit ID token.
    *
    * Task line format:
    *   - [x] 3.1 Task title (60min) [needs 2.1, 2.2] {2026-05-01}
    *   - [ ] New task without ID (45min)
    *
    * Detect:
    *   ID              → existing task (update it)
    *   no ID           → new task (create it)
    *   [x] vs [ ]      → status
    *   (NUMmin)        → duration
    *   [needs A, B]    → dependencies
    *   {YYYY-MM-DD}    → deadline
    *   everything else → title
*/
function parseMarkdown(md: string, data: AppData): ImportChanges {
    const changes: ImportChanges = {
        newProjects: 0,
        deletedProjects: 0,
        deletedTasks: 0,
        statusChanges: 0,
        titleChanges: 0,
        durationChanges: 0,
        deadlineChanges: 0,
        depChanges: 0,
        newTasks: 0,
        total: 0,
    };

    let currentProjectId: string | null = null;
    let lastTopLevelTaskId: string | undefined = undefined;

    // Track indent levels for nested subtasks
    // indent 0 = top-level, indent 2 = subtask of last top-level, indent 4 = sub-subtask, etc.
    const indentStack: { indent: number; taskId: string }[] = [];

    const lines = md.split("\n");

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];

        // Skip comments
        if (line.trim().startsWith("<!--")) continue;

        // Detect project headers: # Project Name  (50%)
        // Also handles: # Project Name (no percentage)
        const projectMatch = line.match(/^#\s+(.+?)(?:\s+\(\d+%\))?\s*$/);
        if (projectMatch) {
            const projectName = projectMatch[1].trim();
            lastTopLevelTaskId = undefined;
            indentStack.length = 0;

            if (projectName.toLowerCase() === "inbox") {
                currentProjectId = null; // null means inbox (no specific project)
                continue;
            }

            // Try to find existing project
            let project = data.projects.find(
                (p) => p.title.toLowerCase() === projectName.toLowerCase()
            );

            if (!project) {
                // NEW PROJECT — create it
                // Look ahead for description (> line) and metadata (Deadline:, Type:, etc.)
                let description: string | undefined;
                let deadline: string | undefined;

                for (let j = lineIdx + 1; j < lines.length && j < lineIdx + 10; j++) {
                    const next = lines[j].trim();
                    if (next.startsWith("> ")) {
                        description = next.slice(2).trim();
                    } else if (next.startsWith("Deadline:")) {
                        deadline = next.replace("Deadline:", "").trim();
                    } else if (next.startsWith("- [")) {
                        break; // reached tasks, stop looking
                    }
                }

                project = {
                    id: String(data.nextProjectId++),
                    title: projectName,
                    description,
                    status: "active" as const,
                    deadline,
                    createdAt: new Date().toISOString(),
                };
                data.projects.push(project);
                changes.newProjects++;
            }

            currentProjectId = project.id;
            continue;
        }

        // Skip metadata lines (>, Deadline:, Type:, Stage:, Goal:)
        const trimmed = line.trim();
        if (
            trimmed.startsWith("> ") ||
            trimmed.startsWith("Deadline:") ||
            trimmed.startsWith("Type:") ||
            trimmed.startsWith("Stage:") ||
            trimmed.startsWith("Goal:") ||
            trimmed === ""
        ) {
            continue;
        }

        // Detect task lines: - [x] 3.1 Title (60min) [needs 2.1] {2026-05-01}
        //                or: - [ ] New task title (30min)
        const taskMatch = line.match(/^(\s*)-\s+\[(x| )\]\s+(.*)/);
        if (!taskMatch) continue;

        const indent = taskMatch[1].length;
        const isDone = taskMatch[2] === "x";
        const rest = taskMatch[3].trim();

        // Parse components
        const idMatch = rest.match(/^(?:#)?([0-9]+(?:\.[0-9]+)*)\s+/);
        const durationMatch = rest.match(/\((\d+)min\)/);
        const depsMatch = rest.match(/\[needs\s+([^\]]+)\]/);
        const deadlineMatch = rest.match(/\{(\d{4}-\d{2}-\d{2})\}/);

        // Extract title: remove ID token, (duration), [needs], {deadline}
        let title = rest
            .replace(/^(?:#)?[0-9]+(?:\.[0-9]+)*\s+/, "")
            .replace(/\(\d+min\)/, "")
            .replace(/\[needs\s+[^\]]+\]/, "")
            .replace(/\{\d{4}-\d{2}-\d{2}\}/, "")
            .trim();

        const duration = durationMatch ? parseInt(durationMatch[1], 10) : undefined;
        const deadline = deadlineMatch ? deadlineMatch[1] : undefined;
        const depIds = depsMatch
            ? depsMatch[1].split(",").map((s) => s.trim().replace(/^#/, "")).filter((s) => s.length > 0)
            : [];

        // Determine parent based on indent level
        // Pop stack until we find indent < current
        while (indentStack.length > 0 && indentStack[indentStack.length - 1].indent >= indent) {
            indentStack.pop();
        }
        const parentId = indentStack.length > 0 ? indentStack[indentStack.length - 1].taskId : undefined;

        if (idMatch) {
            // -- Existing task: update fields --
            const taskId = idMatch[1];
            let task = data.tasks.find((t) => t.id === taskId);

            // If task doesn't exist yet but ID is explicit in markdown, create it with that ID.
            if (!task) {
                const projectIds: string[] = [];
                if (currentProjectId !== null) {
                    projectIds.push(currentProjectId);
                }

                task = {
                    id: taskId,
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
                data.tasks.push(task);
                changes.newTasks++;

                if (parentId !== undefined) {
                    const parentTask = data.tasks.find((t) => t.id === parentId);
                    if (parentTask && !parentTask.subtaskIds.includes(task.id)) {
                        parentTask.subtaskIds.push(task.id);
                    }
                }
            }

            // Keep parent relationship aligned with indentation edits.
            if (task.parentId !== parentId) {
                if (task.parentId !== undefined) {
                    const oldParent = data.tasks.find((t) => t.id === task!.parentId);
                    if (oldParent) {
                        oldParent.subtaskIds = oldParent.subtaskIds.filter((sid) => sid !== task!.id);
                    }
                }
                task.parentId = parentId;
                if (parentId !== undefined) {
                    const newParent = data.tasks.find((t) => t.id === parentId);
                    if (newParent && !newParent.subtaskIds.includes(task.id)) {
                        newParent.subtaskIds.push(task.id);
                    }
                }
            }

            // Keep top-level tasks attached to current project section.
            if (task.parentId === undefined && currentProjectId !== null && !task.projectIds.includes(currentProjectId)) {
                task.projectIds = [currentProjectId];
            }

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
            const currentDeps = JSON.stringify([...task.conditionIds].sort());
            const newDeps = JSON.stringify([...depIds].sort());
            if (currentDeps !== newDeps) {
                task.conditionIds = depIds;
                changes.depChanges++;
            }

            // Push onto indent stack
            indentStack.push({ indent, taskId });

        } else {
            // -- New task: no explicit ID found --
            if (!title) continue;

            const projectIds: string[] = [];
            if (currentProjectId !== null) {
                projectIds.push(currentProjectId);
            }

            const newTask: Task = {
                id: parentId !== undefined
                    ? generateSubtaskId(data, parentId)
                    : generateTaskId(data, currentProjectId ?? undefined),
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
                const parentTask = data.tasks.find((t) => t.id === parentId);
                if (parentTask) {
                    parentTask.subtaskIds.push(newTask.id);
                }
            }

            // Push onto indent stack
            indentStack.push({ indent, taskId: newTask.id });

            changes.newTasks++;
        }
    }

    // Parse "Todo Today" section
    let inTodaySection = false;
    const parsedTodayTasks: any[] = [];

    for (const line of lines) {
        if (line.match(/^#\s+Todo Today\s*$/i)) {
            inTodaySection = true;
            continue;
        }
        if (inTodaySection && line.match(/^#\s+/)) {
            break; // hit next section
        }
        if (!inTodaySection) continue;

        const tm = line.match(/^\s*-\s+\[(x| )\]\s+(.*)/);
        if (!tm) continue;

        const isDone = tm[1] === "x";
        const rest = tm[2].trim();
        const durMatch = rest.match(/\((\d+)min\)/);
        const recMatch = rest.match(/\[every\s+([^\]]+)\]/);
        const title = rest
            .replace(/\(\d+min\)/, "")
            .replace(/\[every\s+[^\]]+\]/, "")
            .trim();

        if (!title) continue;

        parsedTodayTasks.push({
            id: `today-${Date.now()}-${parsedTodayTasks.length}`,
            title,
            projectIds: [],
            subtaskIds: [],
            conditionIds: [],
            status: isDone ? "done" : "todo",
            duration: durMatch ? parseInt(durMatch[1], 10) : undefined,
            recurrence: recMatch ? recMatch[1].trim() : undefined,
            createdAt: new Date().toISOString(),
            completedAt: isDone ? new Date().toISOString() : undefined,
        });
    }

    if (parsedTodayTasks.length > 0) {
        data.todayTasks = parsedTodayTasks;
    }

    // Delete projects that exist in JSON but not in markdown
    const mdProjectNames = new Set<string>();
    for (const line of lines) {
        const pm = line.match(/^#\s+(.+?)(?:\s+\(\d+%\))?\s*$/);
        if (pm) {
            const name = pm[1].trim().toLowerCase();
            if (name !== "inbox" && name !== "todo today") mdProjectNames.add(name);
        }
    }

    const projectsToDelete = data.projects.filter(
        (p) => !mdProjectNames.has(p.title.toLowerCase())
    );

    for (const p of projectsToDelete) {
        // Remove all tasks belonging to this project
        const tasksToRemove = data.tasks.filter((t) => t.projectIds.includes(p.id));
        for (const t of tasksToRemove) {
            // Clean up references from other tasks
            for (const other of data.tasks) {
                other.subtaskIds = other.subtaskIds.filter((sid) => sid !== t.id);
                other.conditionIds = other.conditionIds.filter((cid) => cid !== t.id);
            }
        }
        data.tasks = data.tasks.filter((t) => !t.projectIds.includes(p.id));
        changes.deletedTasks += tasksToRemove.length;

        // Remove project profile
        delete data.projectProfiles[p.id];

        // Remove from focus
        data.focus = data.focus.filter((fid) => fid !== p.id);

        changes.deletedProjects++;
    }

    data.projects = data.projects.filter(
        (p) => mdProjectNames.has(p.title.toLowerCase())
    );

    changes.total = changes.newProjects + changes.deletedProjects + changes.deletedTasks + changes.statusChanges + changes.titleChanges
        + changes.durationChanges + changes.deadlineChanges + changes.depChanges + changes.newTasks;

    return changes;
}

function parseRecurrenceDays(rec: string): number | null {
    if (rec === "daily") return 1;
    if (rec === "weekly") return 7;
    if (rec === "monthly") return 30;
    const match = rec.match(/^(\d+)(d|w|m)$/);
    if (!match) return null;
    const num = parseInt(match[1], 10);
    switch (match[2]) {
        case "d": return num;
        case "w": return num * 7;
        case "m": return num * 30;
        default: return null;
    }
}