import { loadData, saveData } from "../utils/storage";

/**
    * px archive --project ID    Archive a project and all its tasks
    * px archive --task ID       Archive a single task (and its subtasks)
    * px archive list            Show archived items
    * px archive restore ID      Restore an archived project or task
*/
export function archiveCommand(args: string[]): void {
    const data = loadData();

    // px archive list
    if (args[0] === "list") {
        if (data.archivedProjects.length === 0 && data.archivedTasks.length === 0) {
            console.log("\n  📦 Archive is empty.\n");
            return;
        }
        if (data.archivedProjects.length > 0) {
            console.log("\n  📦 Archived Projects\n");
            for (const p of data.archivedProjects) {
                console.log(`    #${p.id}  ${p.title}`);
            }
        }
        if (data.archivedTasks.length > 0) {
            console.log("\n  📦 Archived Tasks\n");
            for (const t of data.archivedTasks) {
                // const proj = t.projectIds.length > 0 ? ` (was in project #${t.projectIds[0]})` : "";
                // console.log(`    #${t.id}  ${t.title}${proj}`);
                console.log(`    #${t.id}  ${t.title}`);
            }
        }
        console.log();
        return;
    }

    // px archive restore ID
    if (args[0] === "restore") {
        const id = args[1];
        if (!id) {
            console.error("  Usage: px archive restore <ID>");
            return;
        }

        // Try project first
        const projIdx = data.archivedProjects.findIndex((p) => p.id === id);
        if (projIdx !== -1) {
            const project = data.archivedProjects.splice(projIdx, 1)[0];
            data.projects.push(project);

            // Restore all tasks that belonged to this project
            const tasksToRestore = data.archivedTasks.filter((t) => t.projectIds.includes(id));
            for (const t of tasksToRestore) {
                data.tasks.push(t);
            }
            data.archivedTasks = data.archivedTasks.filter((t) => !t.projectIds.includes(id));

            saveData(data);
            console.log(`  ✓ Restored project "${project.title}" with ${tasksToRestore.length} task(s)`);
            return;
        }

        // Try task
        const taskIdx = data.archivedTasks.findIndex((t) => t.id === id);
        if (taskIdx !== -1) {
            const task = data.archivedTasks.splice(taskIdx, 1)[0];
            data.tasks.push(task);

            // Re-register in parent's subtaskIds if parent exists
            if (task.parentId) {
                const parent = data.tasks.find((t) => t.id === task.parentId);
                if (parent && !parent.subtaskIds.includes(task.id)) {
                    parent.subtaskIds.push(task.id);
                }
            }

            saveData(data);
            console.log(`  ✓ Restored task "${task.title}"`);
            return;
        }

        console.error(`  ⚠ ID "${id}" not found in archive.`);
        return;
    }

    // px archive --project ID
    const projFlag = args.indexOf("--project");
    if (projFlag !== -1) {
        const id = args[projFlag + 1];
        if (!id) {
            console.error("  Usage: px archive --project <ID>");
            return;
        }

        const project = data.projects.find((p) => p.id === id);
        if (!project) {
            console.error(`  ⚠ Project #${id} not found.`);
            return;
        }

        // Collect all tasks (including subtasks) belonging to this project
        const tasksToArchive = data.tasks.filter((t) => t.projectIds.includes(id));

        // Clean up references from other tasks
        for (const t of data.tasks) {
            if (t.projectIds.includes(id)) continue;
            for (const archived of tasksToArchive) {
                t.conditionIds = t.conditionIds.filter((c) => c !== archived.id);
            }
        }

        // Move to archive
        data.archivedProjects.push(project);
        for (const t of tasksToArchive) {
            data.archivedTasks.push(t);
        }

        // Remove from active
        data.projects = data.projects.filter((p) => p.id !== id);
        data.tasks = data.tasks.filter((t) => !t.projectIds.includes(id));
        data.focus = data.focus.filter((f) => f !== id);

        saveData(data);
        console.log(`  ✓ Archived "${project.title}" with ${tasksToArchive.length} task(s)`);
        return;
    }

    // px archive --task ID
    const taskFlag = args.indexOf("--task");
    if (taskFlag !== -1) {
        const id = args[taskFlag + 1];
        if (!id) {
            console.error("  Usage: px archive --task <ID>");
            return;
        }

        const task = data.tasks.find((t) => t.id === id);
        if (!task) {
            console.error(`  ⚠ Task #${id} not found.`);
            return;
        }

        // Collect task + all subtasks recursively
        function collectAll(taskId: string): string[] {
            const t = data.tasks.find((x) => x.id === taskId);
            if (!t) return [taskId];
            let ids = [taskId];
            for (const sid of t.subtaskIds) ids = ids.concat(collectAll(sid));
            return ids;
        }
        const allIds = new Set(collectAll(id));

        // Remove from parent's subtaskIds
        if (task.parentId) {
            const parent = data.tasks.find((t) => t.id === task.parentId);
            if (parent) {
                parent.subtaskIds = parent.subtaskIds.filter((s) => s !== id);
            }
        }

        // Clean up references
        for (const t of data.tasks) {
            if (allIds.has(t.id)) continue;
            t.conditionIds = t.conditionIds.filter((c) => !allIds.has(c));
        }

        // Move to archive
        const tasksToArchive = data.tasks.filter((t) => allIds.has(t.id));
        for (const t of tasksToArchive) {
            data.archivedTasks.push(t);
        }
        data.tasks = data.tasks.filter((t) => !allIds.has(t.id));

        saveData(data);
        console.log(`  ✓ Archived "${task.title}"${allIds.size > 1 ? ` + ${allIds.size - 1} subtask(s)` : ""}`);
        return;
    }

    // No valid args
    console.log(`
\x1b[32m--- px archive ---\x1b[0m

    Commands:
        px archive --project <ID>     Archive a project and all its tasks
        px archive --task <ID>        Archive a task and its subtasks
        px archive list               Show archived items
        px archive restore <ID>       Restore from archive
    `);
}