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
    const taskId = args[0];
    const needsIdx = args.indexOf("--needs");

    if (!taskId || needsIdx === -1) {
        console.error("Usage: px dep <task-id> --needs <dependency-id>");
        process.exit(1);
    }

    const depId = args[needsIdx + 1];
    if (!depId) {
        console.error("Usage: px dep <task-id> --needs <dependency-id>");
        process.exit(1);
    }

    if (taskId === depId) {
        console.error("A task cannot depend on itself.");
        process.exit(1);
    }

    const data = loadData();
    const task = getTaskOrDie(data, taskId);
    const dep = getTaskOrDie(data, depId);

    if (task.conditionIds.includes(depId)) {
        console.log(`Dependency already exists.`);
        return;
    }

    task.conditionIds.push(depId);
    saveData(data);
    console.log(`✓ #${taskId} "${task.title}" now needs #${depId} "${dep.title}" first`);
}
