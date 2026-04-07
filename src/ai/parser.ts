export interface TaskSuggestion {
    title: string;
    duration?: number;
    subtasks: string[];
}

export function parseAIResponse(raw: string): TaskSuggestion[] | null {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    let parsed: any[];
    try {
        parsed = JSON.parse(jsonMatch[0]);
    } catch {
        return null;
    }

    if (!Array.isArray(parsed)) return null;

    const suggestions: TaskSuggestion[] = [];
    for (const item of parsed) {
        if (!item.title || typeof item.title !== "string") continue;
        suggestions.push({
            title: item.title.trim(),
            duration: typeof item.duration === "number" ? item.duration : undefined,
            subtasks: Array.isArray(item.subtasks)
                ? item.subtasks.filter((s: any) => typeof s === "string").map((s: string) => s.trim())
                : [],
        });
    }

    return suggestions.length > 0 ? suggestions : null;
}