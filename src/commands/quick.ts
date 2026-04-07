import { loadData, saveData } from "../utils/storage";
import { createTask } from "../models";

/**
    * px quick "Fix the navbar"
    *
    * WHY a separate command from `add`?
    * → `add` has flags (--project, --duration, etc). When you're on your phone
    *   and an idea hits, you don't want to think about which project it belongs to.
    *   `quick` is ONE argument, ZERO decisions. Organize later with `px inbox`.
*/
export function quickAdd(args: string[]): void {
    const title = args.join(" ");
    if (!title) {
        console.error('Usage: px quick "Task title"');
        process.exit(1);
    }

    const data = loadData();
    const task = createTask({
        id: String(data.nextTaskId++),
        title,
        // No project = inbox
    });

    data.tasks.push(task);
    saveData(data);
    console.log(`✓ #${task.id} "${title}" → inbox`);
}
