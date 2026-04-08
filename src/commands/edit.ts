import * as readline from "readline";
import { loadData, saveData } from "../utils/storage";
import { getTaskOrDie } from "../utils/helpers";
import { generateTaskId } from "../models";

/**
    * px edit 3
    *
    * Interactive edit: shows current values, press Enter to keep, type to change.
    * WHY interactive? Because flags like --title --project --duration --deadline
    * would be painful to remember. This way you just see what's there and fix it.
*/
export async function editTask(args: string[]): Promise<void> {
    const id = args[0];
    if (!id || id.length === 0) {
        console.error("Usage: px edit <task-id>");
        process.exit(1);
    }

    const data = loadData();
    const task = getTaskOrDie(data, id);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const ask = (q: string): Promise<string> =>
        new Promise((resolve) => rl.question(q, resolve));

    console.log(`\n  Editing #${task.id} — press Enter to keep current value\n`);

    // Title
    const newTitle = await ask(`  Title (${task.title}): `);
    if (newTitle.trim()) task.title = newTitle.trim();

    // Description
    const newDescr = await ask(`  Description (${task.description || "none"}): `);
    if (newDescr.trim()) task.description = newDescr.trim();

    // Duration
    const durLabel = task.duration ? `${task.duration}min` : "none";
    const newDur = await ask(`  Duration in min (${durLabel}): `);
    if (newDur.trim()) {
        const parsed = parseInt(newDur.trim(), 10);
        if (!isNaN(parsed)) task.duration = parsed;
    }

    // Deadline
    const dlLabel = task.deadline ?? "none";
    const newDl = await ask(`  Deadline YYYY-MM-DD (${dlLabel}): `);
    if (newDl.trim()) {
        if (newDl.trim() === "clear") task.deadline = undefined;
        else task.deadline = newDl.trim();
    }

    // Project
    const currentProjects = task.projectIds
        .map((pid) => data.projects.find((p) => p.id === pid))
        .filter(Boolean)
        .map((p) => `${p!.id}:${p!.title}`)
        .join(", ") || "none (inbox)";
    console.log(`  Current projects: ${currentProjects}`);
    console.log(`  Available:`);
    for (const p of data.projects) {
        console.log(`    ${p.id}. ${p.title}`);
    }
    const newProj = await ask(`  Project IDs comma-separated (Enter to keep): `);
    if (newProj.trim()) {
        const ids = newProj.split(",").map((s) => s.trim()).filter((n) => n.length > 0);
        const allValid = ids.every((pid) => data.projects.find((p) => p.id === pid));
        if (allValid) {
            const oldId = task.id;
            task.projectIds = ids;
            // Regenerate ID based on new project (only if no parent)
            if (!task.parentId) {
                task.id = generateTaskId(data, ids[0]);
                // Update any references to old ID
                for (const t of data.tasks) {
                    t.conditionIds = t.conditionIds.map((c) => c === oldId ? task.id : c);
                }
            }
            console.log(`  (ID: ${oldId} → ${task.id})`);
        } else {
            console.log("  ⚠ Some project IDs not found, kept original");
        }
    }

    rl.close();
    saveData(data);
    console.log(`\n  ✓ Task #${task.id} updated\n`);
}