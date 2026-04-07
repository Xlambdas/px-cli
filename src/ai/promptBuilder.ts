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

export function buildContext(data: AppData, projectId: number): AIContext {
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
            return `- ${t.title} [${t.status}]${t.duration ? ` (${t.duration}min)` : ""}${subStr}${depStr}`;
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
    return block;
}

const JSON_INSTRUCTION = `Respond ONLY in this exact JSON format, no other text, no markdown:
[
  {
    "title": "Task title",
    "duration": 60,
    "subtasks": ["Subtask 1", "Subtask 2"]
  }
]`;

export function buildNextPrompt(ctx: AIContext): string {
    return `${projectBlock(ctx)}

Current tasks:
${formatTaskList(ctx)}

Based on the current progress and what's already done, suggest 3-5 tasks I should work on NEXT.
Focus on what's most impactful right now given the project stage.
Each task should be actionable and completable in 30min-2h.
Don't repeat tasks that already exist.

${JSON_INSTRUCTION}`;
}

export function buildPlanPrompt(ctx: AIContext): string {
    return `${projectBlock(ctx)}

Current tasks:
${formatTaskList(ctx)}

Suggest 5-8 tasks I might be missing to complete this project successfully.
Consider all phases: planning, building, testing, polishing, launching.
Each task should be actionable and completable in 30min-2h.
For complex tasks, suggest 2-3 subtasks.
Don't repeat tasks that already exist.

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