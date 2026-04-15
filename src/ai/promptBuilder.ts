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
    return ctx.existingTasks
        .map((t) => {
            const subs = t.subtaskIds
                .map((sid) => ctx.allTasks.find((s) => s.id === sid))
                .filter(Boolean) as Task[];
            const subStr = subs.length > 0
                ? `\n  Subtasks: ${subs.map((s) => `${s.title} [${s.status}]`).join(", ")}`
                : "";
            const depStr = t.conditionIds.length > 0
                ? `\n  Depends on: ${t.conditionIds.map((id) => ctx.allTasks.find((s) => s.id === id)?.title || `#${id}`).join(", ")}`
                : "";
            const blocked = t.conditionIds.length > 0 && t.conditionIds.some(
                (cid) => { const c = ctx.allTasks.find((x) => x.id === cid); return c && c.status !== "done"; }
            );
            const blockedTag = blocked ? " ⛔BLOCKED" : "";
            return `- ${t.title} [${t.status}]${blockedTag}${t.duration ? ` (${t.duration}min)` : ""}${subStr}${depStr}`;
        })
        .join("\n");
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
  const blockedCount = ctx.todoTasks.filter((t) =>
    t.conditionIds.some((cid) => {
      const c = ctx.allTasks.find((x) => x.id === cid);
      return c && c.status !== "done";
    })
  ).length;

  return `${projectBlock(ctx)}

Current tasks:
${formatTaskList(ctx)}

${blockedCount > 0 ? `${blockedCount} task(s) are currently blocked by dependencies.\n` : ""}
Suggest 3-5 tasks I should work on RIGHT NOW.
Prioritize:
1. Tasks that would UNBLOCK other tasks
2. Tasks matching the current project stage (${ctx.profile.stage || "unknown"})
3. Quick wins (30-60min) that build momentum
4. Tasks that are missing but logically come before existing todo tasks

Each task must be actionable and completable in 30min-2h.
Don't repeat existing tasks (even partially).
Don't suggest tasks that are already blocked — suggest what unblocks them.

${JSON_INSTRUCTION}`;
}

export function buildPlanPrompt(ctx: AIContext): string {
  return `${projectBlock(ctx)}

Current tasks:
${formatTaskList(ctx)}

Analyze this project and identify 5-8 MISSING tasks needed to complete it.
Consider:
1. What phases are missing? (planning → building → testing → polishing → launching)
2. What tasks have no dependencies but should? (ordering gaps)
3. Are there testing, documentation, or review tasks?
4. Is there a launch/deployment/delivery task?
5. Are there tasks the user might forget? (backups, edge cases, cleanup)

Current stage: ${ctx.profile.stage || "unknown"}
Goal: ${ctx.profile.goal || "complete the project"}

Each task: actionable, 30min-2h, with subtasks for complex ones.
Don't repeat existing tasks.

${JSON_INSTRUCTION}`;
}

export function buildExpandPrompt(ctx: AIContext, task: Task): string {
    return `${projectBlock(ctx)}

I have this task: "${task.title}"${task.duration ? ` (estimated ${task.duration}min)` : ""}

Break it down into 2-5 concrete subtasks.
Each subtask should be a single action, completable in 15-60min.
Order them logically (what needs to happen first).

${JSON_INSTRUCTION}`;
}