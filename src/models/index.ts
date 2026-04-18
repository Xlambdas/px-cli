// === MODELS ===

export interface Task {
    id: string;
    title: string;
    description?: string;
    projectIds: string[];     // which projects this task belongs to (can be multiple)
    parentId?: string;        // if this is a subtask, who's the parent?
    subtaskIds: string[];     // IDs of child tasks
    conditionIds: string[];   // IDs of tasks that must be done BEFORE this one
    status: "todo" | "done";
    duration?: number;        // estimated minutes
    deadline?: string;        // ISO date string e.g. "2026-05-01"
    createdAt: string;        // ISO date string
    completedAt?: string;      // ISO date string
    recurrence?: string;
}

export interface Project {
    id: string;
    title: string;
    description?: string;
    status: "active" | "done";
    deadline?: string;
    createdAt: string;
}

export interface ProjectProfile {
    projectId: string;
    type?: string;
    stage?: string;
    goal?: string;
    lastPromptHash?: string;
    learnedPatterns?: {
        preferredTaskTypes?: string[];
        avoidedTaskTypes?: string[];
    };
    aiStats?: {
        totalSuggested: number;
        totalAccepted: number;
    };
}

export interface AppData {
    tasks: Task[];
    todayTasks: Task[];
    projects: Project[];
    focus: string[];           // IDs of today's focused projects
    nextTaskId: number;        // auto-increment counter (converted to string)
    nextProjectId: number;     // auto-increment counter (converted to string)
    projectProfiles: { [projectId: string]: ProjectProfile };
    archivedTasks: Task[];
    archivedProjects: Project[];
}


// Factory functions — create objects with safe defaults

export function createTask(fields: {
    id: string;
    title: string;
    description?: string;
    projectIds?: string[];
    parentId?: string;
    duration?: number;
    deadline?: string;
}): Task {
    return {
        projectIds: [],
        subtaskIds: [],
        conditionIds: [],
        status: "todo",
        createdAt: new Date().toISOString(),
        ...fields,
    };
}

export function createProject(fields: {
    id: string;
    title: string;
    description?: string;
    deadline?: string;
}): Project {
    return {
        status: "active",
        createdAt: new Date().toISOString(),
        ...fields,
    };
}

export function createEmptyData(): AppData {
    return {
        tasks: [],
        todayTasks: [],
        projects: [],
        focus: [],
        nextTaskId: 1,
        nextProjectId: 1,
        projectProfiles: {},
        archivedTasks: [],
        archivedProjects: [],
    };
}

// === ID GENERATION ===

/**
    * Generate a new top-level task ID for a project.
    * Format: projectId.index (e.g., "2.1", "2.2").
    *
    * If no project is provided (inbox), falls back to the global counter string.
*/
export function generateTaskId(data: AppData, projectId?: string): string {
    if (!projectId) {
        return String(data.nextTaskId++);
    }

    const prefix = `${projectId}.`;
    let maxIndex = 0;

    for (const t of data.tasks) {
        if (t.parentId !== undefined) continue;
        if (!t.projectIds.includes(projectId)) continue;
        if (!t.id.startsWith(prefix)) continue;

        const rest = t.id.slice(prefix.length);
        if (!/^\d+$/.test(rest)) continue;

        const idx = parseInt(rest, 10);
        if (idx > maxIndex) maxIndex = idx;
    }

    return `${projectId}.${maxIndex + 1}`;
}

/**
    * Generate a new project ID
    * Format: just the number as string (e.g., "1", "2", "3")
*/
export function generateProjectId(data: AppData): string {
    return String(data.nextProjectId++);
}

/**
    * Generate a nested subtask ID.
    * Format: parentTaskId.index (e.g., "2.2.1", "2.2.2").
*/
export function generateSubtaskId(data: AppData, parentTaskId: string): string {
    const prefix = `${parentTaskId}.`;
    let maxIndex = 0;

    for (const t of data.tasks) {
        if (t.parentId !== parentTaskId) continue;
        if (!t.id.startsWith(prefix)) continue;

        const rest = t.id.slice(prefix.length);
        if (!/^\d+$/.test(rest)) continue;

        const idx = parseInt(rest, 10);
        if (idx > maxIndex) maxIndex = idx;
    }

    return `${parentTaskId}.${maxIndex + 1}`;
}
