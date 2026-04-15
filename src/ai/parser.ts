export interface TaskSuggestion {
    title: string;
    duration?: number;
    needs: string[];
    subtasks: TaskSuggestion[];
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

    const suggestions = parsed.map(parseSuggestion).filter(Boolean) as TaskSuggestion[];
    return suggestions.length > 0 ? suggestions : null;
}

function parseSuggestion(item: any): TaskSuggestion | null {
    if (!item.title || typeof item.title !== "string") return null;

    const subtasks: TaskSuggestion[] = [];
    if (Array.isArray(item.subtasks)) {
        for (const sub of item.subtasks) {
            const parsed = parseSuggestion(sub);
            if (parsed) subtasks.push(parsed);
        }
    }

    const needs: string[] = [];
    if (Array.isArray(item.needs)) {
        for (const n of item.needs) {
            if (typeof n === "string" && n.trim()) needs.push(n.trim());
        }
    }

    return {
        title: item.title.trim(),
        duration: typeof item.duration === "number" ? item.duration : undefined,
        needs,
        subtasks,
    };
}