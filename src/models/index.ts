// === MODELS ===
// These are just TypeScript types — they define the SHAPE of your data.
// No logic here. Logic lives in services.

export interface Task {
    id: number;
    title: string;
    description?: string;
    projectIds: number[];     // which projects this task belongs to (can be multiple)
    parentId?: number;         // if this is a subtask, who's the parent?
    subtaskIds: number[];      // IDs of child tasks
    conditionIds: number[];    // IDs of tasks that must be done BEFORE this one
    status: "todo" | "done";
    duration?: number;         // estimated minutes
    deadline?: string;         // ISO date string e.g. "2026-05-01"
    createdAt: string;         // ISO date string
    completedAt?: string;       // ISO date string
}

export interface Project {
    id: number;
    title: string;
    description?: string;
    status: "active" | "done";
    deadline?: string;
    createdAt: string;
}

// This is what gets saved to disk
export interface AppData {
    tasks: Task[];
    projects: Project[];
    focus: number[];           // IDs of today's focused projects
    nextTaskId: number;        // auto-increment counter
    nextProjectId: number;
}

// Factory functions — create objects with safe defaults
// WHY: So you never forget a required field when creating a task/project

export function createTask(fields: {
    id: number;
    title: string;
    description?: string;
    projectIds?: number[];
    parentId?: number;
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
    id: number;
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
        projects: [],
        focus: [],
        nextTaskId: 1,
        nextProjectId: 1,
    };
}
