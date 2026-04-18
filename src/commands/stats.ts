import { loadData } from "../utils/storage";
import { projectProgress } from "../utils/helpers";

export function showStats(): void {
    const data = loadData();

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const allDone = data.tasks.filter((t) => t.status === "done" && t.completedAt);
    const doneToday = allDone.filter((t) => t.completedAt!.slice(0, 10) === todayStr);
    const doneThisWeek = allDone.filter((t) => new Date(t.completedAt!) >= monday);
    const totalTodo = data.tasks.filter((t) => t.status === "todo" && t.parentId === undefined).length;
    const totalDone = data.tasks.filter((t) => t.status === "done" && t.parentId === undefined).length;

    const streak = computeStreak(allDone.map((t) => t.completedAt!));

    console.log("\n╔═══════════════════════════════════════╗");
    console.log("║               YOUR STATS              ║");
    console.log("╚═══════════════════════════════════════╝\n");

    console.log(`  Today:     ${doneToday.length} task${doneToday.length !== 1 ? "s" : ""} done`);
    console.log(`  This week: ${doneThisWeek.length} task${doneThisWeek.length !== 1 ? "s" : ""} done`);
    console.log();

    const total = totalDone + totalTodo;
    const pct = total > 0 ? Math.round((totalDone / total) * 100) : 0;
    console.log(`  Total:     ${totalDone} done / ${totalTodo} remaining  (${pct}%)`);
    console.log(`             ${"█".repeat(Math.round(pct / 5))}${"░".repeat(20 - Math.round(pct / 5))}`);
    console.log();

    const fire = streak > 0 ? "🔥" : "💤";
    console.log(`  Streak:    ${fire} ${streak} day${streak !== 1 ? "s" : ""}`);
    console.log();

    if (data.projects.length > 0) {
        for (const p of data.projects) {
            const pp = projectProgress(data, p.id);
            const focus = data.focus.includes(p.id) ? "*" : "";
            console.log(`  -- ${p.title}${focus} (${pp}%) --\n`);

            // Get top-level tasks for this project
            const topTasks = data.tasks.filter(
                (t) => t.projectIds.includes(p.id) && t.parentId === undefined
            );

            for (let i = 0; i < topTasks.length; i++) {
                const t = topTasks[i];
                const isLast = i === topTasks.length - 1;
                const mark = t.status === "done" ? "✓" : "○";
                const prefix = isLast ? "└─" : "├─";
                console.log(`  ${prefix} ${mark} ${t.title}`);

                // Subtasks
                for (let j = 0; j < t.subtaskIds.length; j++) {
                    const sub = data.tasks.find((s) => s.id === t.subtaskIds[j]);
                    if (!sub) continue;
                    const subMark = sub.status === "done" ? "✓" : "○";
                    const subIsLast = j === t.subtaskIds.length - 1;
                    const indent = isLast ? "   " : "│  ";
                    const subPrefix = subIsLast ? "└─" : "├─";
                    console.log(`  ${indent}${subPrefix} ${subMark} ${sub.title}`);
                }
            }
            console.log();
        }
    }
}

function computeStreak(completedDates: string[]): number {
    if (completedDates.length === 0) return 0;
    const days = new Set(completedDates.map((d) => d.slice(0, 10)));
    const sortedDays = [...days].sort().reverse();
    if (sortedDays.length === 0) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (sortedDays[0] !== today && sortedDays[0] !== yesterday) return 0;
    let streak = 0;
    let checkDate = new Date(sortedDays[0]);
    while (true) {
        const dateStr = checkDate.toISOString().slice(0, 10);
        if (days.has(dateStr)) { streak++; checkDate.setDate(checkDate.getDate() - 1); }
        else break;
    }
    return streak;
}