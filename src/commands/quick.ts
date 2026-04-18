import { loadData, saveData } from "../utils/storage";
import { createTask, generateTaskId } from "../models";

/**
    * px quick "Fix the navbar"
*/
export function quickAdd(args: string[]): void {
    const title = args.join(" ");
    if (!title) {
        console.error('Usage: px quick "Task title"');
        process.exit(1);
    }

    const data = loadData();
    const task = createTask({
        id: generateTaskId(data),
        title,
        // No project = inbox
    });

    data.tasks.push(task);
    saveData(data);
    console.log(`✓ #${task.id} "${title}" → inbox`);
}
