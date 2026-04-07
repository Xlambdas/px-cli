import { loadData, saveData } from "../utils/storage";
import { createProject } from "../models";
import { projectProgress, fmtDeadline } from "../utils/helpers";

/**
    * px project add "Title" --deadline 2026-05-01
    *
    * WHY separate from tasks? Projects are containers. They have no "done" checkbox —
    * they're done when all their tasks are done.
*/
export function projectAdd(args: string[]): void {
    const data = loadData();

    // Parse: first non-flag arg is title, --deadline is optional
    const title = args.find((a) => !a.startsWith("--"));
    if (!title) {
        console.error("Usage: px project add \"Project name\" [--descr \"Description\"] [--deadline YYYY-MM-DD]");
        process.exit(1);
    }

    const descrIdx = args.indexOf("--descr");
    const description = descrIdx !== -1 ? args[descrIdx + 1] : undefined;

    const deadlineIdx = args.indexOf("--deadline");
    const deadline = deadlineIdx !== -1 ? args[deadlineIdx + 1] : undefined;

    const project = createProject({
        id: data.nextProjectId++,
        title,
        description,
        deadline,
    });

    data.projects.push(project);
    saveData(data);
    console.log(`✓ Project #${project.id} "${project.title}" created`);
}

/**
    * px project list
    *
    * Shows all projects with completion %.
    * This is your high-level overview.
*/
export function projectList(): void {
    const data = loadData();

    if (data.projects.length === 0) {
        console.log("No projects yet. Create one with: px project add \"Name\"");
        return;
    }

    console.log("\n-- Projects --\n");
    for (const p of data.projects) {
        const pct = projectProgress(data, p.id);
        const dl = fmtDeadline(p.deadline);
        const bar = progressBar(pct);
        const focusTag = data.focus.includes(p.id) ? " ★" : "";
        const description = p.description ? ` - ${p.description}` : "";
        console.log(`  #${p.id}  ${bar} ${pct}%  ${p.title}${description}${focusTag}  ${dl}`);
    }
    console.log();
}

function progressBar(pct: number): string {
    const filled = Math.round(pct / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
}
