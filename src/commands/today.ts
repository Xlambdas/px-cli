import { loadData, saveData } from "../utils/storage";
import { fmtDuration } from "../utils/helpers";

/**
 * px todo "Task title" [--duration MIN] [--every daily|2d|3d|weekly|biweekly|monthly]
 * px todo                → list today's tasks
 * px todo done <index>   → complete a today task
 * px todo clear          → remove completed non-recurring tasks
 * px todo clear --all    → remove ALL today tasks (asks confirmation)
 * px todo reset          → clear everything for a new day + re-add recurring tasks
 *
 * Recurrence shortcuts:
 *   daily      → every day
 *   2d         → every 2 days
 *   3d         → every 3 days
 *   weekly     → every 7 days
 *   biweekly   → every 14 days
 *   monthly    → every 30 days
 */
export function todayCommand(args: string[]): void {
    const data = loadData();

    // No args → show today's list
    if (args.length === 0) {
        if (data.todayTasks.length === 0) {
            console.log('\n  📋 No tasks for today. Add one: px todo "Task title"\n');
            return;
        }
        console.log("\n  📋 Today\n");
        data.todayTasks.forEach((t, i) => {
            const mark = t.status === "done" ? "✓" : "○";
            const dur = fmtDuration(t.duration);
            const rec = t.recurrence ? ` 🔁 ${t.recurrence}` : "";
            console.log(`  ${mark} ${i + 1}. ${t.title}  ${dur}${rec}`);
        });
        const done = data.todayTasks.filter((t) => t.status === "done").length;
        const total = data.todayTasks.length;
        console.log(`\n  ${done}/${total} done\n`);
        return;
    }

    // px todo done <index>
    if (args[0] === "done") {
        const idx = parseInt(args[1], 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= data.todayTasks.length) {
            console.error("  Usage: px todo done <number>");
            return;
        }
        data.todayTasks[idx].status = "done";
        data.todayTasks[idx].completedAt = new Date().toISOString();
        console.log(`  ✓ "${data.todayTasks[idx].title}" done!`);
        saveData(data);
        return;
    }

    // px todo clear → remove completed non-recurring tasks
    if (args[0] === "clear") {
        if (args.includes("--all")) {
            // Ask confirmation
            const readline = require("readline");
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            rl.question("  Are you sure? This removes ALL today tasks. (Y/N): ", (answer: string) => {
                if (answer.trim().toLowerCase() === "y") {
                    data.todayTasks = [];
                    saveData(data);
                    console.log("  ✓ All tasks cleared (in today's list)");
                } else {
                    console.log("  Cancelled.");
                }
                rl.close();
            });
            return;
        }
        const before = data.todayTasks.length;
        data.todayTasks = data.todayTasks.filter((t) => t.status !== "done" || t.recurrence);
        const removed = before - data.todayTasks.length;
        console.log(`  ✓ Cleared ${removed} completed task(s) (recurring tasks kept)`);
        saveData(data);
        return;
    }

    // px todo reset → clear done, reset recurring to todo, remove non-recurring done
    if (args[0] === "reset") {
        const keepIdx = args.indexOf("--keep");
        const keepIndices = keepIdx !== -1
            ? args.slice(keepIdx + 1).map((s) => parseInt(s, 10) - 1).filter((n) => !isNaN(n))
            : [];
        const recurring = data.todayTasks.filter((t) => t.recurrence);
        const today = new Date();
        const ready: typeof data.todayTasks = [];
        const waiting: { title: string; days: number; recurrence: string }[] = [];

        for (const t of recurring) {
            if (shouldRecur(t, today)) {
                ready.push({
                    ...t,
                    status: "todo",
                    completedAt: undefined,
                });
            } else {
                // Keep it but show remaining days
                ready.push(t);
                const days = parseRecurrence(t.recurrence!)!;
                const lastDone = new Date(t.completedAt!);
                const remaining = days - Math.floor((today.getTime() - lastDone.getTime()) / (1000 * 60 * 60 * 24));
                waiting.push({ title: t.title, days: remaining, recurrence: t.recurrence! });
            }
        }

        // Keep tasks specified by --keep (by their original index)
        for (const idx of keepIndices) {
            if (idx >= 0 && idx < data.todayTasks.length) {
                const kept = data.todayTasks[idx];
                if (!kept.recurrence && !ready.find((t) => t.id === kept.id)) {
                    ready.push({ ...kept, status: "todo", completedAt: undefined });
                }
            }
        }

        data.todayTasks = ready;
        saveData(data);

        const todoCount = ready.filter((t) => t.status === "todo").length;
        const keptCount = keepIndices.length > 0 ? keepIndices.filter((idx) => idx >= 0 && idx < data.todayTasks.length).length : 0;
        console.log(`  ✓ New day! ${todoCount} task(s) ready${keptCount > 0 ? ` (${keptCount} kept)` : ""}`);
        if (waiting.length > 0) {
            console.log(`  Recurring (not yet due):`);
            for (const w of waiting) {
                console.log(`     ${w.title} (🔁 ${w.recurrence}) — ${w.days}d remaining`);
            }
        }
        console.log();
        return;
    }

    // px todo "Title" [--duration MIN] [--every RECURRENCE]
    let title = "";
    let duration: number | undefined;
    let recurrence: string | undefined;

    let i = 0;
    while (i < args.length) {
        if (args[i] === "--duration") {
            duration = parseInt(args[++i], 10);
        } else if (args[i] === "--every") {
            const val = args[++i];
            if (parseRecurrence(val) !== null) {
                recurrence = val;
            } else {
                console.error(`  ⚠ Invalid recurrence: "${val}"`);
                console.error(`  Valid: daily, weekly, monthly, or <number><d|w|m> (e.g. 2d, 4w, 2m)`);
                return;
            }
        } else if (!args[i].startsWith("--")) {
            title = args[i];
        }
        i++;
    }

    if (!title) {
        console.error('  Usage: px todo "Task title" [--duration MIN] [--every daily|2d|3d|weekly|biweekly|monthly]');
        return;
    }

    data.todayTasks.push({
        id: `today-${Date.now()}`,
        title,
        projectIds: [],
        subtaskIds: [],
        conditionIds: [],
        status: "todo",
        duration,
        recurrence,
        createdAt: new Date().toISOString(),
    });

    saveData(data);
    const recLabel = recurrence ? ` (🔁 ${recurrence})` : "";
    console.log(`  ✓ "${title}" added to today${recLabel}`);
}

/**
 * Parse recurrence string into number of days.
 * "daily" → 1, "weekly" → 7, "monthly" → 30
 * "2d" → 2, "4w" → 28, "2m" → 60
 * Returns null if invalid.
 */
function parseRecurrence(rec: string): number | null {
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

function shouldRecur(task: any, today: Date): boolean {
    if (!task.recurrence) return false;
    if (!task.completedAt) return true;

    const days = parseRecurrence(task.recurrence);
    if (days === null) return true;

    const lastDone = new Date(task.completedAt);
    const diffDays = Math.floor((today.getTime() - lastDone.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= days;
}