// === MODELS ===
// These are just TypeScript types — they define the SHAPE of your data.
// No logic here. Logic lives in services.

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
    learnedPatterns?: {
        preferredTaskTypes?: string[];
        avoidedTaskTypes?: string[];
    };
}

// This is what gets saved to disk
export interface AppData {
    tasks: Task[];
    projects: Project[];
    focus: string[];           // IDs of today's focused projects
    nextTaskId: number;        // auto-increment counter (converted to string)
    nextProjectId: number;     // auto-increment counter (converted to string)
    projectProfiles: { [projectId: string]: ProjectProfile };
}


// Factory functions — create objects with safe defaults
// WHY: So you never forget a required field when creating a task/project

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
        projects: [],
        focus: [],
        nextTaskId: 1,
        nextProjectId: 1,
        projectProfiles: {},
    };
}

// === ID GENERATION ===

/**
 * Generate a new task ID (top-level task)
 * Format: just the number as string (e.g., "1", "2", "3")
 */
export function generateTaskId(data: AppData): string {
    return String(data.nextTaskId++);
}

/**
 * Generate a new project ID
 * Format: just the number as string (e.g., "1", "2", "3")
 */
export function generateProjectId(data: AppData): string {
    return String(data.nextProjectId++);
}

/**
 * Generate a subtask ID
 * Format: parentTaskId.subtaskIndex (e.g., "5.1", "5.2")
 * The index is based on the position in the parent's subtaskIds array
 */
export function generateSubtaskId(parentTaskId: string, subtaskIndex: number): string {
    return `${parentTaskId}.${subtaskIndex}`;
}
