import * as readline from "readline";
import { loadData, saveData } from "../utils/storage";
import { AppData, Task } from "../models";
import {
    canComplete,
    projectProgress,
    fmtDeadline,
    fmtDuration,
} from "../utils/helpers";

/**
    * px day
    *
    * This is the HEART of the system. Your morning ritual:
    * 1. Shows focused projects
    * 2. Displays today's checklist (ready + blocked)
    * 3. You mark tasks done interactively
    * 4. Progress updates live
    * 5. Type "q" to quit
    *
    * WHY interactive and not just a static list?
    * → Because execution is a LOOP. You do a task, check it off, see what unblocked,
    *   do the next one. A static list can't show you that task #5 just became ready
    *   because you finished #3.
*/
export async function daySession(): Promise<void> {
    let data = loadData();

    if (data.focus.length === 0) {
        console.log("No projects focused. Run: px focus 1 2");
        return;
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const ask = (q: string): Promise<string> =>
        new Promise((resolve) => rl.question(q, resolve));

    let running = true;

    while (running) {
        // Refresh data each loop (in case of external changes)
        data = loadData();

        // Gather tasks for focused projects (top-level only)
        const tasks = data.tasks.filter(
            (t) =>
                t.parentId === undefined &&
                t.status === "todo" &&
                t.projectIds.some((pid) => data.focus.includes(pid))
        );

        // Split into ready and blocked
        const ready: Task[] = [];
        const blocked: Task[] = [];

        for (const t of tasks) {
            const check = canComplete(data, t);
            if (check.ok) {
                // If it has subtasks, only show if there are remaining subtasks
                ready.push(t);
            } else {
                blocked.push(t);
            }
        }

        // Sort ready: deadline first, then by creation date
        ready.sort((a, b) => {
            if (a.deadline && !b.deadline) return -1;
            if (!a.deadline && b.deadline) return 1;
            if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
            return a.createdAt.localeCompare(b.createdAt);
        });

        // Print header
        console.log("\n═══════════════════════════════════════");
        console.log("  ★ TODAY'S SESSION");
        console.log("═══════════════════════════════════════\n");

        // Show focused projects with progress
        for (const pid of data.focus) {
            const p = data.projects.find((pr) => pr.id === pid);
            if (p) {
                const pct = projectProgress(data, p.id);
                console.log(`  📂 ${p.title}  [${pct}%]  ${fmtDeadline(p.deadline)}`);
            }
        }

        // Ready tasks
        console.log("\n── Ready ─────────────────────────────\n");
        if (ready.length === 0) {
            console.log("  🎉 All tasks done or blocked!\n");
        } else {
            let totalMin = 0;
            for (const t of ready) {
                const dur = fmtDuration(t.duration);
                const dl = fmtDeadline(t.deadline);
                const subs =
                    t.subtaskIds.length > 0
                        ? (() => {
                            const doneCount = t.subtaskIds.filter(
                                (id) => data.tasks.find((s) => s.id === id)?.status === "done"
                            ).length;
                            return `[${doneCount}/${t.subtaskIds.length}]`;
                        })()
                        : "";
                console.log(`  ○ #${t.id}  ${t.title}  ${dur}  ${subs}  ${dl}`);
                if (t.duration) totalMin += t.duration;

                // Show pending subtasks indented
                if (t.subtaskIds.length > 0) {
                    for (const sid of t.subtaskIds) {
                        const sub = data.tasks.find((s) => s.id === sid);
                        if (sub && sub.status === "todo") {
                            console.log(`       ○ #${sub.id}  ${sub.title}`);
                        }
                    }
                }
            }
            if (totalMin > 0) console.log(`\n  ⏱  Estimated: ${fmtDuration(totalMin)}`);
        }

        // Blocked tasks
        if (blocked.length > 0) {
            console.log("\n── Blocked ───────────────────────────\n");
            for (const t of blocked) {
                const check = canComplete(data, t);
                console.log(`  ⛔ #${t.id}  ${t.title}  → ${check.reason}`);
            }
        }

        console.log("\n───────────────────────────────────────");

        // Prompt
        const input = await ask("  done <id> / q to quit: ");
        const trimmed = input.trim().toLowerCase();

        if (trimmed === "q" || trimmed === "quit") {
            running = false;
            continue;
        }

        // Parse "done <id>" or just "<id>"
        const match = trimmed.match(/^(?:done\s+)?([\w.]+)$/);
        if (!match) {
            console.log("  ⚠ Type a task ID or 'q' to quit");
            continue;
        }

        const taskId = match[1];
        const task = data.tasks.find((t) => t.id === taskId);

        if (!task) {
            console.log(`  ⚠ Task #${taskId} not found`);
            continue;
        }

        if (task.status === "done") {
            console.log(`  Already done.`);
            continue;
        }

        const check = canComplete(data, task);
        if (!check.ok) {
            console.log(`  ⛔ ${check.reason}`);
            continue;
        }

        // Mark done
        task.status = "done";
        task.completedAt = new Date().toISOString();
        console.log(`  ✓ #${taskId} "${task.title}" done!`);

        // Auto-complete parent
        if (task.parentId !== undefined) {
            const parent = data.tasks.find((t) => t.id === task.parentId);
            if (parent) {
                const allDone = parent.subtaskIds.every((sid) => {
                    const s = data.tasks.find((t) => t.id === sid);
                    return s && s.status === "done";
                });
                if (allDone) {
                    parent.status = "done";
                    parent.completedAt = new Date().toISOString();
                    console.log(`  ✓ Parent #${parent.id} "${parent.title}" auto-completed!`);
                }
            }
        }

        saveData(data);
    }

    rl.close();
    console.log("\n  Session ended. Good work! 🚀\n");
}
