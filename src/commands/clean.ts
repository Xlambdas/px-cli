import * as readline from "readline";
import { loadData, saveData } from "../utils/storage";
import { AppData, Task } from "../models";
import { fmtDuration } from "../utils/helpers";

/**
    * px clean           → analyze and fix issues interactively
    * px clean --auto    → fix safe issues automatically (duplicates, orphans)
    * px clean --report  → just show issues, don't fix anything
*/
export async function cleanCommand(args: string[]): Promise<void> {
    const data = loadData();
    const reportOnly = args.includes("--report");
    const auto = args.includes("--auto");

    console.log("\n -- Scanning for issues... -- \n");

    const issues: Issue[] = [];

    findDuplicates(data, issues);
    findOrphans(data, issues);
    findDeadRefs(data, issues);
    findOversize(data, issues);
    findEmpty(data, issues);
    findCircular(data, issues);
    findInconsistent(data, issues);

    if (issues.length === 0) {
        console.log(" No issues found. Everything is clean!\n");
        return;
    }

    console.log(`  Found ${issues.length} issue(s):\n`);

    // Group by type
    const grouped: Record<string, Issue[]> = {};
    for (const issue of issues) {
        if (!grouped[issue.type]) grouped[issue.type] = [];
        grouped[issue.type].push(issue);
    }

    for (const [type, items] of Object.entries(grouped)) {
        console.log(`  -- ${type} (${items.length}) --`);
        for (const item of items) {
            console.log(`    ${item.icon} ${item.message}`);
        }
        console.log();
    }

    if (reportOnly) {
        console.log(`  Run "px clean" to fix interactively or "px clean --auto" for safe auto-fixes.\n`);
        return;
    }

    // Auto-fix safe issues
    if (auto) {
        let fixed = 0;
        fixed += fixDeadRefs(data);
        fixed += fixOrphans(data);
        fixed += fixEmpty(data);
        fixed += fixInconsistent(data);
        saveData(data);
        console.log(`  ✓ Auto-fixed ${fixed} issue(s)\n`);
        return;
    }

    // Interactive fix
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> => new Promise((r) => rl.question(q, r));

    let fixed = 0;

    // Fix dead refs silently
    fixed += fixDeadRefs(data);
    if (fixed > 0) console.log(`  ✓ Cleaned ${fixed} dead reference(s)`);

    // Fix orphans silently
    const orphanFixed = fixOrphans(data);
    if (orphanFixed > 0) console.log(`  ✓ Fixed ${orphanFixed} orphan subtask(s)`);
    fixed += orphanFixed;

    // Fix empty silently
    const emptyFixed = fixEmpty(data);
    if (emptyFixed > 0) console.log(`  ✓ Removed ${emptyFixed} empty task(s)`);
    fixed += emptyFixed;

    // Fix inconsistent silently
    const inconsistentFixed = fixInconsistent(data);
    if (inconsistentFixed > 0) console.log(`  ✓ Fixed ${inconsistentFixed} inconsistent status(es)`);
    fixed += inconsistentFixed;

    // Duplicates - ask
    const dupes = issues.filter((i) => i.type === "Duplicates");
    if (dupes.length > 0) {
        console.log();
        for (const dupe of dupes) {
            console.log(`  ${dupe.icon} ${dupe.message}`);
            if (dupe.taskIds && dupe.taskIds.length >= 2) {
                const t1 = data.tasks.find((t) => t.id === dupe.taskIds![0]);
                const t2 = data.tasks.find((t) => t.id === dupe.taskIds![1]);
                if (t1 && t2) {
                    const answer = await ask(`    Keep #${t1.id} or #${t2.id}? (1/2/skip): `);
                    if (answer.trim() === "1") {
                        removeTasks(data, [t2.id]);
                        console.log(`    ✓ Removed #${t2.id}`);
                        fixed++;
                    } else if (answer.trim() === "2") {
                        removeTasks(data, [t1.id]);
                        console.log(`    ✓ Removed #${t1.id}`);
                        fixed++;
                    } else {
                        console.log("    → Skipped");
                    }
                }
            }
        }
    }

    // Oversize - ask
    const oversize = issues.filter((i) => i.type === "Oversize tasks");
    if (oversize.length > 0) {
        console.log();
        for (const over of oversize) {
            console.log(`  ${over.icon} ${over.message}`);
            const answer = await ask(`    [e]xpand with AI, [s]kip? `);
            if (answer.trim().toLowerCase() === "e" && over.taskIds?.[0]) {
                console.log(`    → Run: px ai expand ${over.taskIds[0]}`);
            }
        }
    }

    // Circular deps - ask
    const circular = issues.filter((i) => i.type === "Circular dependencies");
    if (circular.length > 0) {
        console.log();
        for (const circ of circular) {
            console.log(`  ${circ.icon} ${circ.message}`);
            if (circ.taskIds && circ.taskIds.length >= 2) {
                const answer = await ask(`    Remove dependency ${circ.taskIds[0]} → ${circ.taskIds[1]}? (y/n): `);
                if (answer.trim().toLowerCase() === "y") {
                    const task = data.tasks.find((t) => t.id === circ.taskIds![0]);
                    if (task) {
                        task.conditionIds = task.conditionIds.filter((c) => c !== circ.taskIds![1]);
                        console.log("    ✓ Removed");
                        fixed++;
                    }
                }
            }
        }
    }

    rl.close();
    saveData(data);
    console.log(`\n  ✓ Fixed ${fixed} issue(s)\n`);
}

// === Issue types ===

interface Issue {
    type: string;
    icon: string;
    message: string;
    taskIds?: string[];
}

function findDuplicates(data: AppData, issues: Issue[]): void {
    const seen: Record<string, string[]> = {};
    for (const t of data.tasks) {
        const key = `${t.title.toLowerCase()}|${t.projectIds.sort().join(",")}`;
        if (!seen[key]) seen[key] = [];
        seen[key].push(t.id);
    }
    for (const [key, ids] of Object.entries(seen)) {
        if (ids.length > 1) {
            const title = key.split("|")[0];
            issues.push({
                type: "Duplicates",
                icon: "D",
                message: `"${title}" appears ${ids.length}x (${ids.map((id) => "#" + id).join(", ")})`,
                taskIds: ids,
            });
        }
    }
}

function findOrphans(data: AppData, issues: Issue[]): void {
    for (const t of data.tasks) {
        if (t.parentId && !data.tasks.find((p) => p.id === t.parentId)) {
            issues.push({
                type: "Orphan subtasks",
                icon: "O",
                message: `#${t.id} "${t.title}" has parentId ${t.parentId} which doesn't exist`,
                taskIds: [t.id],
            });
        }
    }
}

function findDeadRefs(data: AppData, issues: Issue[]): void {
    for (const t of data.tasks) {
        for (const sid of t.subtaskIds) {
            if (!data.tasks.find((s) => s.id === sid)) {
                issues.push({
                    type: "Dead references",
                    icon: "X",
                    message: `#${t.id} references subtask ${sid} which doesn't exist`,
                    taskIds: [t.id],
                });
            }
        }
        for (const cid of t.conditionIds) {
            if (!data.tasks.find((c) => c.id === cid)) {
                issues.push({
                    type: "Dead references",
                    icon: "X",
                    message: `#${t.id} depends on ${cid} which doesn't exist`,
                    taskIds: [t.id],
                });
            }
        }
    }
}

function findOversize(data: AppData, issues: Issue[]): void {
    for (const t of data.tasks) {
        if (t.duration && t.duration > 120 && t.subtaskIds.length === 0 && t.status === "todo") {
            issues.push({
                type: "Oversize tasks",
                icon: "T",
                message: `#${t.id} "${t.title}" is ${fmtDuration(t.duration)} with no subtasks — should be broken down`,
                taskIds: [t.id],
            });
        }
    }
}

function findEmpty(data: AppData, issues: Issue[]): void {
    for (const t of data.tasks) {
        if (!t.title || t.title.trim() === "") {
            issues.push({
                type: "Empty tasks",
                icon: "E",
                message: `#${t.id} has no title`,
                taskIds: [t.id],
            });
        }
    }
}

function findCircular(data: AppData, issues: Issue[]): void {
    for (const t of data.tasks) {
        for (const cid of t.conditionIds) {
            const dep = data.tasks.find((d) => d.id === cid);
            if (dep && dep.conditionIds.includes(t.id)) {
                // Avoid reporting both directions
                if (t.id < cid) {
                    issues.push({
                        type: "Circular dependencies",
                        icon: "C",
                        message: `#${t.id} and #${cid} depend on each other`,
                        taskIds: [t.id, cid],
                    });
                }
            }
        }
    }
}

function findInconsistent(data: AppData, issues: Issue[]): void {
    for (const t of data.tasks) {
        if (t.status === "done" && t.subtaskIds.length > 0) {
            const todoSubs = t.subtaskIds.filter((sid) => {
                const s = data.tasks.find((x) => x.id === sid);
                return s && s.status === "todo";
            });
            if (todoSubs.length > 0) {
                issues.push({
                    type: "Inconsistent status",
                    icon: "⚠",
                    message: `#${t.id} "${t.title}" is done but has ${todoSubs.length} todo subtask(s)`,
                    taskIds: [t.id],
                });
            }
        }
    }
}

// === Fixers ===

function fixDeadRefs(data: AppData): number {
    let fixed = 0;
    for (const t of data.tasks) {
        const beforeSubs = t.subtaskIds.length;
        t.subtaskIds = t.subtaskIds.filter((sid) => data.tasks.find((s) => s.id === sid));
        fixed += beforeSubs - t.subtaskIds.length;

        const beforeDeps = t.conditionIds.length;
        t.conditionIds = t.conditionIds.filter((cid) => data.tasks.find((c) => c.id === cid));
        fixed += beforeDeps - t.conditionIds.length;
    }
    return fixed;
}

function fixOrphans(data: AppData): number {
    let fixed = 0;
    for (const t of data.tasks) {
        if (t.parentId && !data.tasks.find((p) => p.id === t.parentId)) {
            t.parentId = undefined;
            fixed++;
        }
    }
    return fixed;
}

function fixEmpty(data: AppData): number {
    const before = data.tasks.length;
    const emptyIds = data.tasks.filter((t) => !t.title || t.title.trim() === "").map((t) => t.id);
    removeTasks(data, emptyIds);
    return before - data.tasks.length;
}

function fixInconsistent(data: AppData): number {
    let fixed = 0;
    for (const t of data.tasks) {
        if (t.status === "done" && t.subtaskIds.length > 0) {
            for (const sid of t.subtaskIds) {
                const sub = data.tasks.find((s) => s.id === sid);
                if (sub && sub.status === "todo") {
                    sub.status = "done";
                    sub.completedAt = t.completedAt || new Date().toISOString();
                    fixed++;
                }
            }
        }
    }
    return fixed;
}

function removeTasks(data: AppData, ids: string[]): void {
    const idSet = new Set(ids);
    // Clean references
    for (const t of data.tasks) {
        t.subtaskIds = t.subtaskIds.filter((s) => !idSet.has(s));
        t.conditionIds = t.conditionIds.filter((c) => !idSet.has(c));
    }
    data.tasks = data.tasks.filter((t) => !idSet.has(t.id));
}