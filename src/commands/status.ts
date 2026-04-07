import { loadData } from "../utils/storage";
import {
    getTaskOrDie,
    projectProgress,
    taskProgress,
    canComplete,
    fmtDeadline,
    fmtDuration,
} from "../utils/helpers";

/**
    * px status        → all projects with progress
    * px status 3      → detail of task #3 (subtasks, conditions, etc)
*/
export function showStatus(args: string[]): void {
    const data = loadData();

    if (args.length === 0) {
        // Project overview
        if (data.projects.length === 0) {
            console.log("No projects. Create one: px project add \"Name\"");
            return;
        }
        console.log("\n📊 Project Status\n");
        for (const p of data.projects) {
            const pct = projectProgress(data, p.id);
            const total = data.tasks.filter(
                (t) => t.projectIds.includes(p.id) && t.parentId === undefined
            ).length;
            const done = data.tasks.filter(
                (t) =>
                    t.projectIds.includes(p.id) &&
                    t.parentId === undefined &&
                    t.status === "done"
            ).length;
            const dl = fmtDeadline(p.deadline);
            const focus = data.focus.includes(p.id) ? " ★" : "";
            console.log(`  #${p.id}  ${p.title}${focus}  ${done}/${total} tasks  ${pct}%  ${dl}`);
        }
        console.log();
        return;
    }

    // Try as project first (by ID or name)
    const id = parseInt(args[0], 10);
    const project = !isNaN(id)
        ? data.projects.find((p) => p.id === id)
        : data.projects.find((p) => p.title.toLowerCase() === args[0].toLowerCase());

    // If it matches a project → show project detail
    if (project) {
        const pct = projectProgress(data, project.id);
        const topTasks = data.tasks.filter(
            (t) => t.projectIds.includes(project.id) && t.parentId === undefined
        );
        const done = topTasks.filter((t) => t.status === "done").length;
        const dl = fmtDeadline(project.deadline);
        const focus = data.focus.includes(project.id) ? " ★" : "";
        const profile = (data as any).projectProfiles?.[project.id];

        console.log(`\n📂 ${project.title}${focus}`);
        if (project.description) console.log(`   ${project.description}`);
        if (dl) console.log(`   Deadline: ${dl}`);
        if (profile?.type) console.log(`   Type: ${profile.type}`);
        if (profile?.stage) console.log(`   Stage: ${profile.stage}`);
        if (profile?.goal) console.log(`   Goal: ${profile.goal}`);
        console.log(`   Progress: ${done}/${topTasks.length} tasks  ${pct}%`);

        if (topTasks.length > 0) {
            console.log();
            for (let i = 0; i < topTasks.length; i++) {
                const t = topTasks[i];
                const isLast = i === topTasks.length - 1;
                const mark = t.status === "done" ? "✓" : canComplete(data, t).ok ? "○" : "⛔";
                const prefix = isLast ? "└─" : "├─";
                const dur = fmtDuration(t.duration);
                const tdl = fmtDeadline(t.deadline);
                console.log(`   ${prefix} ${mark} #${t.id}  ${t.title}  ${dur}  ${tdl}`);

                for (let j = 0; j < t.subtaskIds.length; j++) {
                    const sub = data.tasks.find((s) => s.id === t.subtaskIds[j]);
                    if (!sub) continue;
                    const subMark = sub.status === "done" ? "✓" : "○";
                    const indent = isLast ? "   " : "│  ";
                    const subPrefix = j === t.subtaskIds.length - 1 ? "└─" : "├─";
                    console.log(`   ${indent}${subPrefix} ${subMark} #${sub.id}  ${sub.title}`);
                }
            }
        }

        console.log();
        return;
    }

    // Otherwise treat as task ID
    if (isNaN(id)) {
        console.error(`Project or task "${args[0]}" not found.`);
        process.exit(1);
    }

    const task = getTaskOrDie(data, id);
    const check = canComplete(data, task);
    const pct = taskProgress(data, task);

    console.log(`\n📋 Task #${task.id}: ${task.title}`);
    console.log(`   Status: ${task.status}  ${check.ok ? "✅ ready" : `⛔ ${check.reason}`}`);
    console.log(`   Progress: ${pct}%`);
    if (task.duration) console.log(`   Duration: ${fmtDuration(task.duration)}`);
    if (task.deadline) console.log(`   Deadline: ${fmtDeadline(task.deadline)}`);

    if (task.projectIds.length > 0) {
        const names = task.projectIds
            .map((pid) => data.projects.find((p) => p.id === pid)?.title ?? `#${pid}`)
            .join(", ");
        console.log(`   Projects: ${names}`);
    }

    if (task.subtaskIds.length > 0) {
        console.log(`   Subtasks:`);
        for (const sid of task.subtaskIds) {
            const sub = data.tasks.find((t) => t.id === sid);
            if (sub) {
                const mark = sub.status === "done" ? "✓" : "○";
                console.log(`     ${mark} #${sub.id} ${sub.title}`);
            }
        }
    }

    if (task.conditionIds.length > 0) {
        console.log(`   Depends on:`);
        for (const cid of task.conditionIds) {
            const dep = data.tasks.find((t) => t.id === cid);
            if (dep) {
                const mark = dep.status === "done" ? "✓" : "○";
                console.log(`     ${mark} #${dep.id} ${dep.title}`);
            }
        }
    }

    console.log();
}