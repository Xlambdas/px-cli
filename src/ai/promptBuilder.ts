import { AppData, Project, Task, ProjectProfile } from "../models";
import { projectProgress } from "../utils/helpers";

export interface AIContext {
    project: Project;
    profile: ProjectProfile;
    existingTasks: Task[];
    doneTasks: Task[];
    todoTasks: Task[];
    progress: number;
    allTasks: Task[];
}

export function buildContext(data: AppData, projectId: string): AIContext {
    const project = data.projects.find((p) => p.id === projectId)!;
    const profile = data.projectProfiles[projectId] || { projectId };
    const existingTasks = data.tasks.filter(
        (t) => t.projectIds.includes(projectId) && !t.parentId
    );
    const doneTasks = existingTasks.filter((t) => t.status === "done");
    const todoTasks = existingTasks.filter((t) => t.status === "todo");
    const progress = projectProgress(data, projectId);
    return { project, profile, existingTasks, doneTasks, todoTasks, progress, allTasks: data.tasks };
}

function formatTaskList(ctx: AIContext): string {
    if (ctx.existingTasks.length === 0) return "No tasks yet.";

    function formatTask(t: Task, indent: string): string {
        const blocked = t.conditionIds.length > 0 && t.conditionIds.some(
            (cid) => { const c = ctx.allTasks.find((x) => x.id === cid); return c && c.status !== "done"; }
        );
        const blockedTag = blocked ? "BLOCKED" : "";
        const dur = t.duration ? ` (${t.duration}min)` : "";
        const deps = t.conditionIds.length > 0
            ? ` [needs: ${t.conditionIds.map((id) => ctx.allTasks.find((s) => s.id === id)?.title || id).join(", ")}]`
            : "";

        let line = `${indent}- ${t.title} [${t.status}]${blockedTag}${dur}${deps}`;

        // Recurse into subtasks
        const subs = t.subtaskIds
            .map((sid) => ctx.allTasks.find((s) => s.id === sid))
            .filter(Boolean) as Task[];
        for (const sub of subs) {
            line += "\n" + formatTask(sub, indent + "  ");
        }

        return line;
    }

    return ctx.existingTasks.map((t) => formatTask(t, "")).join("\n");
}

function projectBlock(ctx: AIContext): string {
    const { project, profile, progress, doneTasks, todoTasks } = ctx;
    let block = `Project: "${project.title}"`;
    if (project.description) block += `\nDescription: ${project.description}`;
    if (project.deadline) block += `\nDeadline: ${project.deadline}`;
    if (profile.type) block += `\nType: ${profile.type}`;
    if (profile.stage) block += `\nStage: ${profile.stage}`;
    if (profile.goal) block += `\nGoal: ${profile.goal}`;
    block += `\nProgress: ${progress}% (${doneTasks.length} done, ${todoTasks.length} remaining)`;
    if (profile.learnedPatterns) {
        if (profile.learnedPatterns.preferredTaskTypes?.length) {
            block += `\nUser prefers: ${profile.learnedPatterns.preferredTaskTypes.join(", ")}`;
        }
        if (profile.learnedPatterns.avoidedTaskTypes?.length) {
            block += `\nUser avoids: ${profile.learnedPatterns.avoidedTaskTypes.join(", ")}`;
        }
    }
    // Recently completed (last 5)
    const recent = ctx.doneTasks
        .filter((t) => t.completedAt)
        .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""))
        .slice(0, 5);
    if (recent.length > 0) {
        block += `\nRecently completed: ${recent.map((t) => t.title).join(", ")}`;
    }
    if (profile.aiStats && profile.aiStats.totalSuggested > 5) {
        const rate = Math.round((profile.aiStats.totalAccepted / profile.aiStats.totalSuggested) * 100);
        block += `\nUser accepts ${rate}% of AI suggestions — ${rate < 40 ? "be more conservative and practical" : "current approach works well"}`;
    }
    return block;
}

const JSON_INSTRUCTION = `Respond ONLY in this exact JSON format, no other text, no markdown.
Tasks MUST be ≤ 2h. If a task would take longer, break it into subtasks.
Subtasks can also have subtasks — nest as deep as needed until every leaf task is ≤ 2h.
Use "needs" to specify which tasks must be done first (by their title, exact match).

[
  {
    "title": "Task A",
    "duration": 60,
    "needs": [],
    "subtasks": []
  },
  {
    "title": "Task B",
    "duration": 90,
    "needs": ["Task A"],
    "subtasks": [
      {
        "title": "Sub B1",
        "duration": 30,
        "needs": [],
        "subtasks": []
      },
      {
        "title": "Sub B2",
        "duration": 45,
        "needs": ["Sub B1"],
        "subtasks": []
      }
    ]
  }
]`;

export function buildNextPrompt(ctx: AIContext): string {
    // Count unblocked todo tasks
    const unblockedTodo = ctx.todoTasks.filter((t) =>
        !t.conditionIds.some((cid) => {
            const c = ctx.allTasks.find((x) => x.id === cid);
            return c && c.status !== "done";
        })
    );

    const blockedCount = ctx.todoTasks.length - unblockedTodo.length;

    // Check all tasks recursively for remaining work
    const allProjectTasks = ctx.allTasks.filter((t) => t.projectIds.includes(ctx.project.id));
    const allTodo = allProjectTasks.filter((t) => t.status === "todo");
    const allDone = allProjectTasks.filter((t) => t.status === "done");

    let instruction: string;

    if (allTodo.length === 0) {
        // No tasks remain — suggest what's needed to finish the project
        instruction = `ALL existing tasks are done. The project is ${ctx.progress}% complete.
Suggest 3-5 NEW tasks needed to fully complete this project based on the goal.
Think about what's missing: testing, polishing, documentation, deployment, review.`;
    } else if (unblockedTodo.length === 0 && blockedCount > 0) {
        // Everything is blocked — suggest tasks that would unblock
        instruction = `All ${blockedCount} remaining tasks are BLOCKED by dependencies.
Suggest 3-5 tasks that would unblock the blocked tasks.
Focus on prerequisite work that's clearly missing.`;
    } else {
        // Normal case — there are actionable tasks
        instruction = `There are ${unblockedTodo.length} actionable tasks and ${blockedCount} blocked.
Suggest 3-5 IMMEDIATE next tasks I should work on RIGHT NOW.
DO NOT suggest tasks that duplicate existing todo tasks — they are already planned.
Only suggest tasks that are MISSING and should come BEFORE the existing todo tasks.
If nothing is missing, suggest tasks that COMPLEMENT the current work.
Prioritize:
1. Tasks that would UNBLOCK blocked tasks
2. Prerequisites missing before existing todos
3. Quick wins (30-60min) that build momentum`;
    }

    return `${projectBlock(ctx)}

FULL task tree (including all subtasks):
${formatTaskList(ctx)}

${instruction}

Each task must be actionable and completable in 30min-2h.
Don't repeat ANY existing task at any level (check subtasks too).

${JSON_INSTRUCTION}`;
}

export function buildPlanPrompt(ctx: AIContext): string {
    const allProjectTasks = ctx.allTasks.filter((t) => t.projectIds.includes(ctx.project.id));
    const totalCount = allProjectTasks.length;
    const doneCount = allProjectTasks.filter((t) => t.status === "done").length;

    return `${projectBlock(ctx)}

FULL task tree (${totalCount} total, ${doneCount} done):
${formatTaskList(ctx)}

Analyze the COMPLETE task tree above and identify 5-8 MISSING tasks.
Consider:
1. What phases are missing? (planning → building → testing → polishing → launching)
2. What dependencies are missing? (tasks that should block others but don't)
3. Are there testing, documentation, or review tasks?
4. Is there a launch/deployment/delivery task?
5. Are there tasks the user might forget? (backups, edge cases, cleanup)

Current stage: ${ctx.profile.stage || "unknown"}
Goal: ${ctx.profile.goal || "complete the project"}

IMPORTANT: Read EVERY existing task and subtask carefully. Do NOT suggest anything that already exists.

Each task: actionable, 30min-2h, with subtasks for complex ones.
Include dependencies ("needs") to existing tasks where logical.

${JSON_INSTRUCTION}`;
}

export function buildExpandPrompt(ctx: AIContext, task: Task): string {
    // Show what comes before and after this task
    const deps = task.conditionIds
        .map((id) => ctx.allTasks.find((t) => t.id === id))
        .filter(Boolean) as Task[];
    const dependents = ctx.allTasks.filter((t) => t.conditionIds.includes(task.id));
    const existingSubs = task.subtaskIds
        .map((sid) => ctx.allTasks.find((s) => s.id === sid))
        .filter(Boolean) as Task[];

    let taskContext = `Task to expand: "${task.title}"${task.duration ? ` (estimated ${task.duration}min)` : ""}`;
    if (deps.length > 0) taskContext += `\nThis task depends on: ${deps.map((d) => d.title).join(", ")}`;
    if (dependents.length > 0) taskContext += `\nTasks waiting on this: ${dependents.map((d) => d.title).join(", ")}`;
    if (existingSubs.length > 0) taskContext += `\nExisting subtasks: ${existingSubs.map((s) => `${s.title} [${s.status}]`).join(", ")}`;

    return `${projectBlock(ctx)}

FULL task tree for context:
${formatTaskList(ctx)}

${taskContext}

Break this task into 2-5 concrete subtasks.
${existingSubs.length > 0 ? `There are already ${existingSubs.length} subtask(s) — add what's MISSING, don't duplicate.` : ""}
Each subtask should be a single action, completable in 15-60min.
Order them logically and use "needs" for dependencies between them.

${JSON_INSTRUCTION}`;
}

export function buildCleanPrompt(ctx: AIContext): string {
    return `${projectBlock(ctx)}

FULL task tree:
${formatTaskList(ctx)}

You are a task quality editor. Analyze ALL tasks above and suggest improvements.
Your job is to make the task list clean, consistent, and actionable.

For each issue, output a fix:

1. RENAME — tasks with vague, inconsistent, or unclear titles
    - Make titles action-oriented ("Design X" not "X design")
    - Use consistent verb style across the project
    - Keep titles concise but descriptive

2. MERGE — tasks that are essentially the same thing but worded differently

3. SPLIT — tasks that are too vague or could mean multiple things

4. REORDER — dependencies that are missing or wrong

Respond ONLY in this JSON format, no other text:
[
  {
    "action": "rename",
    "taskTitle": "exact current title",
    "newTitle": "improved title"
  },
  {
    "action": "merge",
    "taskTitles": ["title 1", "title 2"],
    "mergedTitle": "combined title"
  },
  {
    "action": "split",
    "taskTitle": "vague task title",
    "splitInto": ["specific task 1", "specific task 2"]
  },
  {
    "action": "reorder",
    "taskTitle": "task that should depend on another",
    "needsTitle": "task it should depend on"
  }
]

Only suggest changes that genuinely improve clarity. If everything looks good, return [].`;
}