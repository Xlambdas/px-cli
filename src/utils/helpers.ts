import { Task, AppData } from "../models";

/**
    * Find a task by ID. Throws if not found.
*/
export function getTaskOrDie(data: AppData, id: string): Task {
    const task = data.tasks.find((t) => t.id === id);
    if (!task) {
        console.error(`Task #${id} not found.`);
        process.exit(1);
    }
    return task;
}

/**
    * Can a task be completed :
    * Returns { ok: true } or { ok: false, reason: "..." }
    *
    * A task is blocked if:
    *   1. Any of its conditions (dependencies) are not done
    *   2. Any of its subtasks are not done
*/
export function canComplete(data: AppData, task: Task): { ok: boolean; reason?: string } {
    // Check dependencies
    for (const depId of task.conditionIds) {
        const dep = data.tasks.find((t) => t.id === depId);
        if (dep && dep.status !== "done") {
            return { ok: false, reason: `Blocked by #${depId} "${dep.title}"` };
        }
    }
    return { ok: true };
}

/**
    * Compute completion % for a task (based on subtasks)
    * If no subtasks → 0% or 100% based on status
*/
export function taskProgress(data: AppData, task: Task): number {
    if (task.subtaskIds.length === 0) {
        return task.status === "done" ? 100 : 0;
    }
    const subs = task.subtaskIds
        .map((id) => data.tasks.find((t) => t.id === id))
        .filter(Boolean) as Task[];
    if (subs.length === 0) return 0;
    const done = subs.filter((s) => s.status === "done").length;
    return Math.round((done / subs.length) * 100);
}

/**
    * Compute completion % for a project
    * = % of its TOP-LEVEL tasks that are done
    * (subtasks don't count separately — they contribute via their parent)
*/
export function projectProgress(data: AppData, projectId: string): number {
    const tasks = data.tasks.filter(
        (t) => t.projectIds.includes(projectId) && t.parentId === undefined
    );
    if (tasks.length === 0) return 0;
    const done = tasks.filter((t) => t.status === "done").length;
    return Math.round((done / tasks.length) * 100);
}

/** Format a deadline for display */
export function fmtDeadline(deadline?: string): string {
    if (!deadline) return "";
    const d = new Date(deadline);
    const now = new Date();
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (diffDays < 0) return `⚠ OVERDUE (${label})`;
    if (diffDays <= 3) return `⚠ ${label} (${diffDays}d)`;
    return label;
}

/** Format duration in minutes for display */
export function fmtDuration(minutes?: number): string {
    if (!minutes) return "";
    if (minutes < 60) return `${minutes}min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h${m}m` : `${h}h`;
}
