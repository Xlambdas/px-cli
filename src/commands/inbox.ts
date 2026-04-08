import * as readline from "readline";
import { loadData, saveData } from "../utils/storage";
import { generateTaskId } from "../models";

/**
    * px inbox
    *
    * Interactive loop: for each inbox task, you can:
    *   - assign it to a project
    *   - skip it (keep in inbox)
    *   - delete it
    *
    * WHY interactive? Because organizing is a batch activity.
    * You sit down, go through your inbox, and clear it. Like email triage.
*/
export async function inboxReview(): Promise<void> {
    const data = loadData();

    // Inbox = tasks with no project AND no parent
    const inbox = data.tasks.filter(
        (t) => t.projectIds.length === 0 && t.parentId === undefined && t.status === "todo"
    );

    if (inbox.length === 0) {
        console.log("📭 Inbox is empty. Nice!");
        return;
    }

    console.log(`\n📥 Inbox: ${inbox.length} task(s)\n`);

    // Show available projects for reference
    if (data.projects.length > 0) {
        console.log("Projects:");
        for (const p of data.projects) {
            console.log(`  ${p.id}. ${p.title}`);
        }
        console.log();
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const ask = (q: string): Promise<string> =>
        new Promise((resolve) => rl.question(q, resolve));

    for (const task of inbox) {
        console.log(`--- #${task.id}: "${task.title}" ---`);
        const answer = await ask("  [p]roject ID, [s]kip, [d]elete? ");

        if (answer.toLowerCase() === "d") {
            // Remove the task
            data.tasks = data.tasks.filter((t) => t.id !== task.id);
            console.log("  ✗ Deleted\n");
        } else if (answer.toLowerCase() === "s") {
            console.log("  → Skipped\n");
        } else {
            // Try to parse as project ID
            const pid = answer.trim();
            const project = data.projects.find((p) => p.id === pid);
            if (project) {
                task.projectIds = [pid];
                const oldId = task.id;
                task.id = generateTaskId(data, pid);
                console.log(`  ✓ Assigned to "${project.title}" (${oldId} → ${task.id})\n`);
            } else {
                console.log(`  ⚠ Project #${answer} not found, skipped\n`);
            }
        }
    }

    rl.close();
    saveData(data);
    console.log("Inbox review done.");
}
