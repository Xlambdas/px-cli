import { loadData, saveData } from "../utils/storage";
import { createTask, generateTaskId, generateSubtaskId } from "../models";

/**
    * px add "Title" --project "Name" --duration 60 --deadline 2026-05-01 --parent 3
    *
    * Flags:
    *   --project "X"   → can be repeated for multi-project
    *   --parent N      → makes this a subtask of task N
    *   --duration N    → estimated minutes
    *   --deadline X    → ISO date
    *
    * No --project and no --parent = inbox task (unassigned)
*/
export function addTask(args: string[]): void {
    const data = loadData();

    // Extract title: first arg that isn't a flag or a flag's value
    let title = "";
    const projectNames: string[] = [];
    let description: string | undefined;
    let duration: number | undefined;
    let deadline: string | undefined;
    let parentId: string | undefined;

    let i = 0;
    while (i < args.length) {
        const arg = args[i];
        if (arg === "--project") {
            projectNames.push(args[++i]);
        } else if (arg == "--descr") {
            description = args[++i];
        } else if (arg === "--duration") {
            duration = parseInt(args[++i], 10);
        } else if (arg === "--deadline") {
            deadline = args[++i];
        } else if (arg === "--parent") {
            parentId = args[++i];
        } else if (!arg.startsWith("--")) {
            title = arg;
        }
        i++;
    }

    if (!title) {
        console.error('Usage: px add "Task title" [--project "Name"] [--descr "Description"] [--parent ID] [--duration MIN] [--deadline DATE]');
        process.exit(1);
    }

    // Resolve project names → IDs
    const projectIds: string[] = [];
    for (const name of projectNames) {
        const proj = data.projects.find(
            (p) => p.title.toLowerCase() === name.toLowerCase()
        );
        if (!proj) {
            console.error(`Project "${name}" not found. Create it first: px project add "${name}"`);
            process.exit(1);
        }
        projectIds.push(proj.id);
    }

    // If this is a subtask, inherit parent's projects
    if (parentId !== undefined) {
        const parent = data.tasks.find((t) => t.id === parentId);
        if (!parent) {
            console.error(`Parent task ${parentId} not found.`);
            process.exit(1);
        }
        // Inherit projects from parent if none specified
        if (projectIds.length === 0) {
            projectIds.push(...parent.projectIds);
        }
    }

    // Generate ID for the new task
    let taskId: string;
    if (parentId !== undefined) {
        taskId = generateSubtaskId(data, parentId);
    } else {
        // For top-level tasks, use first project to build project-scoped ID (e.g. 3.2).
        taskId = generateTaskId(data, projectIds[0]);
    }

    const task = createTask({
        id: taskId,
        title,
        description,
        projectIds,
        parentId,
        duration,
        deadline,
    });

    data.tasks.push(task);

    // Register this subtask in the parent's subtaskIds
    if (parentId !== undefined) {
        const parent = data.tasks.find((t) => t.id === parentId)!;
        parent.subtaskIds.push(task.id);
    }

    saveData(data);

    const location =
        parentId !== undefined
            ? `(subtask of ${parentId})`
            : projectIds.length > 0
                ? `(${projectNames.join(", ")})`
                : "(inbox)";

    console.log(`✓ Task ${task.id} "${task.title}" added ${location}`);
}
