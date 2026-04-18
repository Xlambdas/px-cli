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
        console.log("\n-- Project Status --\n");
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
            const focus = data.focus.includes(p.id) ? "*" : "";
            console.log(`  #${p.id}  ${p.title}${focus}  ${done}/${total} tasks  ${pct}%  ${dl}`);
        }
        console.log();
        return;
    }

    // Try as project first (by ID or name)
    const id = args[0];
    const project = data.projects.find((p) => p.id === id)
        || data.projects.find((p) => p.title.toLowerCase() === args[0].toLowerCase());

    // If it matches a project → show project detail
    if (project) {
        const pct = projectProgress(data, project.id);
        const topTasks = data.tasks.filter(
            (t) => t.projectIds.includes(project.id) && t.parentId === undefined
        );
        const done = topTasks.filter((t) => t.status === "done").length;
        const dl = fmtDeadline(project.deadline);
        const focus = data.focus.includes(project.id) ? "*" : "";
        const profile = (data as any).projectProfiles?.[project.id];

        console.log(`\n ${project.title}${focus}`);
        if (project.description) console.log(`   ${project.description}`);
        if (dl) console.log(`   Deadline: ${dl}`);
        if (profile?.type) console.log(`   Type: ${profile.type}`);
        if (profile?.stage) console.log(`   Stage: ${profile.stage}`);
        if (profile?.goal) console.log(`   Goal: ${profile.goal}`);
        console.log(`   Progress: ${done}/${topTasks.length} tasks  ${pct}%`);

        if (topTasks.length > 0) {
            console.log();
            function printSubtasks(parentSubIds: string[], parentIndent: string): void {
                for (let j = 0; j < parentSubIds.length; j++) {
                    const sub = data.tasks.find((s) => s.id === parentSubIds[j]);
                    if (!sub) continue;
                    const subMark = sub.status === "done" ? "✓" : "○";
                    const subIsLast = j === parentSubIds.length - 1;
                    const subPrefix = subIsLast ? "└─" : "├─";
                    console.log(`   ${parentIndent}${subPrefix} ${subMark} #${sub.id}  ${sub.title}`);
                    if (sub.subtaskIds.length > 0) {
                        const deeper = parentIndent + (subIsLast ? "   " : "│  ");
                        printSubtasks(sub.subtaskIds, deeper);
                    }
                }
            }
            for (let i = 0; i < topTasks.length; i++) {
                const t = topTasks[i];
                const isLast = i === topTasks.length - 1;
                const indent = isLast ? "   " : "│  ";
                const mark = t.status === "done" ? "✓" : canComplete(data, t).ok ? "○" : "⛔";
                const prefix = isLast ? "└─" : "├─";
                const dur = fmtDuration(t.duration);
                const tdl = fmtDeadline(t.deadline);
                console.log(`   ${prefix} ${mark} #${t.id}  ${t.title}  ${dur}  ${tdl}`);
                if (t.subtaskIds.length > 0) {
                    printSubtasks(t.subtaskIds, indent);
                }
            }
        }

        console.log();
        return;
    }

    // Otherwise treat as task ID
    if (!id || id.length === 0) {
        console.error(`Project or task "${args[0]}" not found.`);
        process.exit(1);
    }

    const task = getTaskOrDie(data, id);
    const check = canComplete(data, task);
    const pct = taskProgress(data, task);

    console.log(`\n Task #${task.id}: ${task.title}`);
    console.log(`   Status: ${task.status}  ${check.ok ? "Ready" : `⛔ ${check.reason}`}`);
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
        function printSubs(ids: string[], indent: string): void {
            for (let j = 0; j < ids.length; j++) {
                const sub = data.tasks.find((t) => t.id === ids[j]);
                if (!sub) continue;
                const mark = sub.status === "done" ? "✓" : "○";
                const isLast = j === ids.length - 1;
                const prefix = isLast ? "└─" : "├─";
                const dur = fmtDuration(sub.duration);
                const tdl = fmtDeadline(sub.deadline);
                console.log(`   ${indent}${prefix} ${mark} #${sub.id} ${sub.title}  ${dur}  ${tdl}`);
                if (sub.subtaskIds.length > 0) {
                    printSubs(sub.subtaskIds, indent + (isLast ? "   " : "│  "));
                }
            }
        }
        printSubs(task.subtaskIds, "  ");
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