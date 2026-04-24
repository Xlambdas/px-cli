import { loadData } from "../utils/storage";
import { canComplete, fmtDeadline, fmtDuration } from "../utils/helpers";
import { Task, AppData } from "../models";

/**
    * px next              → single best next task
    * px next --top 3      → top 3 tasks
*/
export function nextCommand(args: string[]): void {
    const data = loadData();

    const topIdx = args.indexOf("--top") !== -1 ? args.indexOf("--top") : args.indexOf("-t");
    const count = topIdx !== -1 ? parseInt(args[topIdx + 1], 10) || 1 : 1;

    // Get all unblocked, incomplete, top-level tasks from focused projects
    let candidates = data.tasks.filter((t) =>
        t.status === "todo" &&
        t.parentId === undefined &&
        canComplete(data, t).ok
    );

    // If projects are focused, prefer those
    if (data.focus.length > 0) {
        const focused = candidates.filter((t) =>
            t.projectIds.some((pid) => data.focus.includes(pid))
        );
        if (focused.length > 0) candidates = focused;
    }

    // Prefer tasks ≤ 2h
    const short = candidates.filter((t) => !t.duration || t.duration <= 120);
    if (short.length > 0) candidates = short;

    // Score and sort
    const scored = candidates.map((t) => ({
        task: t,
        score: scoreTask(data, t),
        reason: buildReason(data, t),
    }));

    scored.sort((a, b) => b.score - a.score);

    const results = scored.slice(0, count);

    if (results.length === 0) {
        console.log("\n  Nothing to do — all tasks are done or blocked!\n");
        return;
    }

    console.log();
    if (count === 1) {
        const r = results[0];
        const dur = fmtDuration(r.task.duration);
        const dl = fmtDeadline(r.task.deadline);
        console.log(` -> #${r.task.id}  ${r.task.title}  ${dur}  ${dl}`);
        console.log(`     ${r.reason}`);
    } else {
        console.log(` -> Top ${results.length} tasks\n`);
        results.forEach((r, i) => {
            const dur = fmtDuration(r.task.duration);
            const dl = fmtDeadline(r.task.deadline);
            console.log(`  ${i + 1}. #${r.task.id}  ${r.task.title}  ${dur}  ${dl}`);
            console.log(`     ${r.reason}`);
        });
    }
    console.log();
}

/**
    * Score a task — higher = should do first.
    *
    * Scoring:
    *   +1000  has deadline
    *   +500   deadline within 3 days
    *   +200   deadline within 7 days
    *   +(days until deadline inverted)  closer deadline = higher
    *   +100 per task it unblocks
    *   +10    older task (tiebreaker)
    *   +50    short duration (≤ 60min)
*/
function scoreTask(data: AppData, task: Task): number {
    let score = 0;

    // Deadline urgency
    if (task.deadline) {
        const daysLeft = Math.ceil(
            (new Date(task.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        score += 1000;
        if (daysLeft <= 0) score += 2000;      // overdue
        else if (daysLeft <= 3) score += 500;
        else if (daysLeft <= 7) score += 200;
        score += Math.max(0, 365 - daysLeft);  // closer = higher
    }

    // Unlocks other tasks
    const unblocks = data.tasks.filter(
        (t) => t.status === "todo" && t.conditionIds.includes(task.id)
    ).length;
    score += unblocks * 100;

    // Short tasks get a bonus
    if (task.duration && task.duration <= 60) score += 50;

    // Older tasks as tiebreaker
    const age = Date.now() - new Date(task.createdAt).getTime();
    score += Math.min(age / (1000 * 60 * 60 * 24), 10); // max 10 points for age

    return score;
}

function buildReason(data: AppData, task: Task): string {
    const reasons: string[] = [];

    if (task.deadline) {
        const daysLeft = Math.ceil(
            (new Date(task.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        if (daysLeft <= 0) reasons.push("⚠ OVERDUE");
        else if (daysLeft <= 3) reasons.push(`⚠ ${daysLeft}d left`);
        else reasons.push(`deadline in ${daysLeft}d`);
    }

    const unblocks = data.tasks.filter(
        (t) => t.status === "todo" && t.conditionIds.includes(task.id)
    );
    if (unblocks.length > 0) {
        reasons.push(`unlocks ${unblocks.length} task(s)`);
    }

    if (task.duration && task.duration <= 60) {
        reasons.push("quick win");
    }

    if (reasons.length === 0) reasons.push("oldest unblocked task");

    return reasons.join(" · ");
}