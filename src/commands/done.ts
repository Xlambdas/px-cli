import { loadData, saveData } from "../utils/storage";
import { getTaskOrDie, canComplete, taskProgress } from "../utils/helpers";

/**
    * px done 3
    *
    * Marks task #3 as done. BUT:
    *   - If it has unfinished subtasks → BLOCKED
    *   - If it has unmet conditions → BLOCKED
    *   - If completing it finishes all subtasks of a parent → auto-complete parent
    *
    * WHY auto-complete parent?
    * → If a task has 3 subtasks and you finish the last one,
    *   the parent task is logically done. No need to manually mark it.
*/
export function markDone(args: string[]): void {
    const id = args[0];
    if (!id || id.length === 0) {
        console.error("Usage: px done <task-id>");
        process.exit(1);
    }

    const data = loadData();
    const task = getTaskOrDie(data, id);

    if (task.status === "done") {
        console.log(`Task #${id} is already done.`);
        return;
    }

    // Check if it can be completed
    const check = canComplete(data, task);
    if (!check.ok) {
        console.error(`⛔ Cannot complete #${id}: ${check.reason}`);
        return;
    }

    // Mark done + cascade to all subtasks
    task.status = "done";
    task.completedAt = new Date().toISOString();
    console.log(`✓ #${id} "${task.title}" done!`);

    // Complete all subtasks recursively
    function cascadeComplete(taskIds: string[]): void {
        for (const sid of taskIds) {
            const sub = data.tasks.find((t) => t.id === sid);
            if (sub && sub.status !== "done") {
                sub.status = "done";
                sub.completedAt = new Date().toISOString();
                console.log(`  ✓ #${sub.id} "${sub.title}" auto-completed`);
                if (sub.subtaskIds.length > 0) cascadeComplete(sub.subtaskIds);
            }
        }
    }
    if (task.subtaskIds.length > 0) cascadeComplete(task.subtaskIds);

    // Auto-complete parent if all sibling subtasks are done
    if (task.parentId !== undefined) {
        const parent = data.tasks.find((t) => t.id === task.parentId);
        if (parent) {
            const allSubsDone = parent.subtaskIds.every((sid) => {
                const s = data.tasks.find((t) => t.id === sid);
                return s && s.status === "done";
            });
            if (allSubsDone) {
                parent.status = "done";
                parent.completedAt = new Date().toISOString();
                console.log(`✓ Parent #${parent.id} "${parent.title}" auto-completed!`);
            }
        }
    }

        saveData(data);
    }
