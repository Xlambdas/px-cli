import { loadData } from "../utils/storage";
import { canComplete, fmtDeadline, fmtDuration } from "../utils/helpers";

/**
    * px list              → todo tasks only (top-level)
    * px list --all        → include done tasks
    * px list --project "Name"  → filter by project
*/
export function listTasks(args: string[]): void {
    const data = loadData();

    const showAll = args.includes("--all") || args.includes("-a");
    const projIdx = args.indexOf("--project") !== -1 ? args.indexOf("--project") : args.indexOf("-p");
    // Support: px list --project "X", px list ProjectID, px list "ProjectTitle"
    let projName: string | undefined;
    if (projIdx !== -1) {
        projName = args[projIdx + 1];
    } else {
        const other = args.find((a) => a !== "--all");
        if (other) projName = other;
    }

    let tasks = data.tasks.filter((t) => t.parentId === undefined); // top-level only

    if (!showAll) {
        tasks = tasks.filter((t) => t.status === "todo");
    }

    if (projName) {
        const proj = data.projects.find(
            (p) => p.id === projName || p.title.toLowerCase() === projName!.toLowerCase()
        );
        if (!proj) {
            console.error(`Project "${projName}" not found.`);
            process.exit(1);
        }
        tasks = tasks.filter((t) => t.projectIds.includes(proj.id));
    }

    if (tasks.length === 0) {
        if (projName && !showAll) {
            const proj = data.projects.find(
                (p) => p.id === projName || p.title.toLowerCase() === projName!.toLowerCase()
            );
            const total = data.tasks.filter(
                (t) => proj && t.projectIds.includes(proj.id) && t.parentId === undefined
            ).length;
            if (total > 0) {
                console.log(`\n  🎉 All ${total} tasks done for "${proj!.title}"!\n`);
                return;
            }
        }
        console.log("No tasks found.");
        return;
    }

    console.log();
    for (const t of tasks) {
        const check = t.status === "done" ? "✓" : canComplete(data, t).ok ? "○" : "⛔";
        const dl = fmtDeadline(t.deadline);
        const dur = fmtDuration(t.duration);
        const subs =
            t.subtaskIds.length > 0
                ? `[${t.subtaskIds.filter((id) => data.tasks.find((s) => s.id === id)?.status === "done").length}/${t.subtaskIds.length}]`
                : "";
        console.log(`  ${check} #${t.id}  ${t.title}  ${dur}  ${subs}  ${dl}`);
    }
    console.log();
}
