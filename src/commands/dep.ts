import { loadData, saveData } from "../utils/storage";
import { getTaskOrDie } from "../utils/helpers";

/**
    * px dep 5 --needs 3
    * → Task 5 cannot be completed until task 3 is done.
    *
    * WHY separate from `add`?
    * → Dependencies are often added AFTER tasks exist.
    *   You realize "oh wait, I can't deploy until I build" mid-session.
*/
export function addDependency(args: string[]): void {
    const needsIdx = args.indexOf("--needs");

    if (needsIdx === -1 || needsIdx === 0) {
        console.error("Usage: px dep <id> [id ...] --needs <id> [id ...]");
        process.exit(1);
    }

    // Everything before --needs = task IDs to update
    const taskIds = args.slice(0, needsIdx).filter((s) => s.length > 0);
    // Everything after --needs = dependency IDs
    const depIds = args.slice(needsIdx + 1).filter((s) => s.length > 0);

    if (taskIds.length === 0 || depIds.length === 0) {
        console.error("Usage: px dep <id> [id ...] --needs <id> [id ...]");
        process.exit(1);
    }

    const data = loadData();
    let added = 0;

    for (const taskId of taskIds) {
        const task = getTaskOrDie(data, taskId);
        for (const depId of depIds) {
            if (taskId === depId) {
                console.log(`  ⚠ #${taskId} cannot depend on itself, skipped`);
                continue;
            }
            const dep = getTaskOrDie(data, depId);
            if (task.conditionIds.includes(depId)) {
                console.log(`  #${taskId} already depends on #${depId}, skipped`);
                continue;
            }
            task.conditionIds.push(depId);
            console.log(`  ✓ #${taskId} "${task.title}" now needs #${depId} "${dep.title}"`);
            added++;
        }
    }

    if (added > 0) saveData(data);
    console.log(`\n  ${added} dependency(s) added.`);
}
