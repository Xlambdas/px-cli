import * as readline from "readline";
import { loadData, saveData } from "../utils/storage";
import { createTask, generateSubtaskId, generateTaskId, ProjectProfile } from "../models";
import { getTaskOrDie } from "../utils/helpers";
import { buildContext, buildNextPrompt, buildPlanPrompt, buildExpandPrompt } from "../ai/promptBuilder";
import { parseAIResponse, TaskSuggestion } from "../ai/parser";
import { callGemini } from "../ai/gemini";

export async function aiCommand(args: string[]): Promise<void> {
    const apiKey = process.env.px_cli_KEY;
    if (!apiKey) {
        console.error("  ⚠ GEMINI_API_KEY not set.");
        console.error('  1. Go to aistudio.google.com → Get API key');
        console.error('  2. Run: [System.Environment]::SetEnvironmentVariable("GEMINI_API_KEY", "your-key", "User")');
        console.error("  3. Restart PowerShell");
        process.exit(1);
    }

    const data = loadData();
    const mode = args[0] || "next";

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> => new Promise((r) => rl.question(q, r));

    // ── Pick project ──
    let projectId: string;

    if (mode === "setup") {
        console.log(`
--- px ai — Setup & Usage ---

    Step 1: Get your API key (free)
        1. Go to aistudio.google.com
        2. Click "Get API key" → "Create API key"
        3. Copy the key

    Step 2: Save the key
        Run in PowerShell:
        [System.Environment]::SetEnvironmentVariable("GEMINI_API_KEY", "your-key-here", "User")
        Then restart PowerShell.

    Step 3: Use it
        px ai                 Suggest next tasks for focused project
        px ai next            Same as above
        px ai plan            Full project plan (5-8 tasks)
        px ai expand <ID>     Break a task into subtasks

    How it works:
        1. First run asks 3 questions (type, stage, goal) — saved forever
        2. AI reads your project context, existing tasks, and progress
        3. You pick which suggestions to add (1,3,5 / all / none)
        4. System learns what you accept vs reject over time

    Troubleshooting:
        Quota error?      Wait 30 seconds and retry (rolling rate limit)
        Wrong model?      Check src/ai/gemini.ts uses gemini-2.5-flash

    `);
    return;
    } else if (mode === "expand") {
        const taskId = args[1];
        if (!taskId) {
            console.error("Usage: px ai expand <task-id>");
            rl.close();
            process.exit(1);
        }
        const task = getTaskOrDie(data, taskId);
        if (task.projectIds.length === 0) {
            console.error("  ⚠ Task has no project. Assign it first.");
            rl.close();
            process.exit(1);
        }
        projectId = task.projectIds[0];
    } else if (data.focus.length === 1) {
        projectId = data.focus[0];
    } else if (data.focus.length > 1) {
        console.log("\n  Focused projects:");
        for (const pid of data.focus) {
            const p = data.projects.find((pr) => pr.id === pid);
            if (p) console.log(`    ${p.id}. ${p.title}`);
        }
        const answer = await ask("\n  Which project? (ID): ");
        projectId = answer.trim();
        if (!data.projects.find((p) => p.id === projectId)) {
            console.error("  ⚠ Project not found.");
            rl.close();
            process.exit(1);
        }
    } else {
        console.log("\n  Projects:");
        for (const p of data.projects) {
            console.log(`    ${p.id}. ${p.title}`);
        }
        const answer = await ask("\n  Which project? (ID): ");
        projectId = answer.trim();
        if (!data.projects.find((p) => p.id === projectId)) {
            console.error("  ⚠ Project not found.");
            rl.close();
            process.exit(1);
        }
    }

    // ── Load or create profile ──
    if (!data.projectProfiles[projectId]) {
        data.projectProfiles[projectId] = { projectId };
    }
    const profile = data.projectProfiles[projectId];

    // ── Ask missing context (saved permanently) ──
    let profileChanged = false;

    if (!profile.type) {
        const answer = await ask("  What kind of project? (e.g. web app, mobile app, learning course, fitness plan, creative writing): ");
        if (answer.trim()) { profile.type = answer.trim(); profileChanged = true; }
    }

    if (!profile.stage) {
        const answer = await ask("  Current stage? (1=idea, 2=planning, 3=building, 4=testing, 5=polishing, 6=launching): ");
        const stages: Record<string, string> = { "1": "idea", "2": "planning", "3": "building", "4": "testing", "5": "polishing", "6": "launching" };
        const val = answer.trim();
        profile.stage = stages[val] || val;
        if (profile.stage) profileChanged = true;
    }

    if (!profile.goal) {
        const answer = await ask("  One-sentence goal? (e.g. deploy portfolio with 3 projects by May 1st): ");
        if (answer.trim()) { profile.goal = answer.trim(); profileChanged = true; }
    }

    if (profileChanged) {
        saveData(data);
        console.log("  ✓ Profile saved — won't ask these again\n");
    }

    // ── Build prompt ──
    const ctx = buildContext(data, projectId);
    let prompt: string;
    let modeLabel: string;

    if (mode === "expand") {
        const taskId = args[1];
        const task = getTaskOrDie(data, taskId);
        prompt = buildExpandPrompt(ctx, task);
        modeLabel = `expanding "${task.title}"`;
    } else if (mode === "plan") {
        prompt = buildPlanPrompt(ctx);
        modeLabel = "full plan";
    } else {
        prompt = buildNextPrompt(ctx);
        modeLabel = "next tasks";
    }

    console.log(`  🤖 Getting ${modeLabel} for "${ctx.project.title}"...\n`);

    // Skip API if prompt is identical to last call
    const promptHash = Buffer.from(prompt).toString("base64").slice(0, 32);
    if (profile.lastPromptHash === promptHash && mode !== "expand") {
        console.log("  ℹ No changes since last suggestion. Use px ai plan for fresh ideas.");
        rl.close();
        return;
    }

    // ── Call API ──
    let rawResponse: string;
    try {
        rawResponse = await callGemini(apiKey, prompt);
    } catch (err: any) {
        console.error(`  ⚠ API error: ${err.message}`);
        rl.close();
        return;
    }

    // ── Parse ──
    const suggestions = parseAIResponse(rawResponse);
    if (!suggestions) {
        console.error("  ⚠ Couldn't parse AI response. Raw output:");
        console.log(rawResponse);
        rl.close();
        return;
    }

    // ── Display ──
    console.log("  Suggestions:\n");
    function displaySuggestion(s: TaskSuggestion, index: string, indent: string): void {
        const deps = s.needs.length > 0 ? ` [needs ${s.needs.join(", ")}]` : "";
        console.log(`${indent}${index} ${s.title}  (${s.duration || "?"}min)${deps}`);
        s.subtasks.forEach((sub, j) => {
            displaySuggestion(sub, `${index}${j + 1}.`, indent + "     ");
        });
    }
    suggestions.forEach((s, i) => {
        displaySuggestion(s, `${i + 1}.`, "  ");
    });

    // ── Pick ──
    console.log();
    const answer = await ask("  Add which? (e.g. 1,3,5 / all / none): ");
    const trimmed = answer.trim().toLowerCase();

    if (trimmed === "none" || trimmed === "n" || trimmed === "") {
        trackRejections(profile, suggestions);
        saveData(data);
        rl.close();
        console.log("  Nothing added.");
        return;
    }

    let indices: number[];
    if (trimmed === "all" || trimmed === "a") {
        indices = suggestions.map((_, i) => i);
    } else {
        indices = trimmed
            .split(",")
            .map((s) => parseInt(s.trim(), 10) - 1)
            .filter((n) => !isNaN(n) && n >= 0 && n < suggestions.length);
    }

    const accepted = indices.map((i) => suggestions[i]);
    const rejected = suggestions.filter((_, i) => !indices.includes(i));

    // ── Add tasks ──
    const isExpand = mode === "expand";
    const parentTask = isExpand ? getTaskOrDie(data, args[1]) : undefined;

    // First pass: create all tasks and collect title→id mapping
    const titleToId: Record<string, string> = {};

    // Also index existing tasks by title for cross-referencing
    for (const t of data.tasks) {
        titleToId[t.title.toLowerCase()] = t.id;
    }

    function addTaskRecursive(s: TaskSuggestion, parentId: string | undefined): number {
        const task = createTask({
            id: parentId !== undefined
                ? generateSubtaskId(data, parentId)
                : generateTaskId(data, projectId),
            title: s.title,
            projectIds: [projectId],
            duration: s.duration,
            parentId,
        });
        data.tasks.push(task);
        titleToId[s.title.toLowerCase()] = task.id;

        if (parentId !== undefined) {
            const parent = data.tasks.find((t) => t.id === parentId);
            if (parent && !parent.subtaskIds.includes(task.id)) {
                parent.subtaskIds.push(task.id);
            }
        }

        let count = 1;
        for (const sub of s.subtasks) {
            count += addTaskRecursive(sub, task.id);
        }
        return count;
    }

    let totalAdded = 0;
    for (const s of accepted) {
        const parentId = isExpand ? parentTask!.id : undefined;
        const count = addTaskRecursive(s, parentId);
        totalAdded += count;
        const subCount = count - 1;
        console.log(`  ✓ Added "${s.title}"${subCount > 0 ? ` + ${subCount} subtask(s)` : ""}`);
    }

    // Second pass: resolve "needs" titles → conditionIds
    function resolveDeps(s: TaskSuggestion): void {
        if (s.needs.length > 0) {
            const task = data.tasks.find((t) => t.title.toLowerCase() === s.title.toLowerCase());
            if (task) {
                for (const need of s.needs) {
                    const depId = titleToId[need.toLowerCase()];
                    if (depId && !task.conditionIds.includes(depId)) {
                        task.conditionIds.push(depId);
                    }
                }
            }
        }
        for (const sub of s.subtasks) {
            resolveDeps(sub);
        }
    }
    for (const s of accepted) {
        resolveDeps(s);
    }

    trackAcceptances(profile, accepted);
    trackRejections(profile, rejected);
    // Track acceptance rate
    if (!profile.aiStats) profile.aiStats = { totalSuggested: 0, totalAccepted: 0 };
    profile.aiStats.totalSuggested += suggestions.length;
    profile.aiStats.totalAccepted += accepted.length;

    rl.close();
    saveData(data);
    profile.lastPromptHash = promptHash;
    console.log(`\n  Done! ${totalAdded} task(s) added.\n`);
}

function trackAcceptances(profile: ProjectProfile, tasks: TaskSuggestion[]): void {
    if (!profile.learnedPatterns) profile.learnedPatterns = {};
    if (!profile.learnedPatterns.preferredTaskTypes) profile.learnedPatterns.preferredTaskTypes = [];
    for (const t of tasks) {
        for (const kw of extractKeywords(t.title)) {
            if (!profile.learnedPatterns.preferredTaskTypes.includes(kw)) {
                profile.learnedPatterns.preferredTaskTypes.push(kw);
            }
        }
    }
    if (profile.learnedPatterns.preferredTaskTypes.length > 20) {
        profile.learnedPatterns.preferredTaskTypes = profile.learnedPatterns.preferredTaskTypes.slice(-20);
    }
}

function trackRejections(profile: ProjectProfile, tasks: TaskSuggestion[]): void {
    if (tasks.length === 0) return;
    if (!profile.learnedPatterns) profile.learnedPatterns = {};
    if (!profile.learnedPatterns.avoidedTaskTypes) profile.learnedPatterns.avoidedTaskTypes = [];
    for (const t of tasks) {
        for (const kw of extractKeywords(t.title)) {
            if (!profile.learnedPatterns.avoidedTaskTypes.includes(kw)) {
                profile.learnedPatterns.avoidedTaskTypes.push(kw);
            }
        }
    }
    if (profile.learnedPatterns.avoidedTaskTypes.length > 20) {
        profile.learnedPatterns.avoidedTaskTypes = profile.learnedPatterns.avoidedTaskTypes.slice(-20);
    }
}

function extractKeywords(title: string): string[] {
    const stopWords = new Set([
        "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "from", "as", "is", "was", "are", "be", "been",
        "do", "does", "did", "will", "would", "could", "should", "may", "might",
        "up", "out", "if", "not", "no", "so", "it", "its", "my", "your",
    ]);
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !stopWords.has(w))
        .slice(0, 3);
}