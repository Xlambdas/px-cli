// gg api key : AIzaSyBVcUT9psJLLHKi3n1BhGBimDtqSC8MopI

import * as readline from "readline";
import * as https from "https";
import { loadData, saveData } from "../utils/storage";
import { createTask } from "../models";

export async function aiSuggest(args: string[]): Promise<void> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("  ⚠ GEMINI_API_KEY not set.");
        console.error('  Run: [System.Environment]::SetEnvironmentVariable("GEMINI_API_KEY", "your-key", "User")');
        console.error("  Then restart PowerShell.");
        process.exit(1);
    }

    const projectId = parseInt(args[0], 10);
    if (isNaN(projectId)) {
        console.error("Usage: px ai <project-id>");
        process.exit(1);
    }

    const data = loadData();
    const project = data.projects.find((p) => p.id === projectId);
    if (!project) {
        console.error(`Project #${projectId} not found.`);
        process.exit(1);
    }

    // Gather existing tasks for context
    const existingTasks = data.tasks
        .filter((t) => t.projectIds.includes(projectId) && !t.parentId)
        .map((t) => {
            const subs = t.subtaskIds
                .map((sid) => data.tasks.find((s) => s.id === sid)?.title)
                .filter(Boolean);
            let line = `- ${t.title} [${t.status}]`;
            if (subs.length > 0) line += `\n  Subtasks: ${subs.join(", ")}`;
            return line;
        })
        .join("\n");

    const prompt = `I'm working on a project called "${project.title}".
${project.description ? `Description: ${project.description}` : ""}
${project.deadline ? `Deadline: ${project.deadline}` : ""}

${existingTasks ? `Here are my current tasks:\n${existingTasks}\n` : "No tasks yet."}

Suggest 5-8 tasks I might be missing to complete this project successfully.
Each task should be actionable and completable in 30min-2h.
For complex tasks, suggest 2-3 subtasks.

Respond ONLY in this exact JSON format, no other text:
[
  {
    "title": "Task title",
    "duration": 60,
    "subtasks": ["Subtask 1", "Subtask 2"]
  }
]`;

    console.log(`\n  🤖 Asking Gemini about "${project.title}"...\n`);

    let response: string;
    try {
        response = await callGemini(apiKey, prompt);
    } catch (err: any) {
        console.error(`  ⚠ API error: ${err.message}`);
        return;
    }

    // Parse suggestions
    let suggestions: Array<{ title: string; duration?: number; subtasks?: string[] }>;
    try {
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error("No JSON found");
        suggestions = JSON.parse(jsonMatch[0]);
    } catch {
        console.error("  ⚠ Couldn't parse suggestions. Raw response:");
        console.log(response);
        return;
    }

    // Show suggestions
    console.log("  Suggestions:\n");
    suggestions.forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.title}  (${s.duration || "?"}min)`);
        if (s.subtasks && s.subtasks.length > 0) {
            for (const sub of s.subtasks) {
                console.log(`     └─ ${sub}`);
            }
        }
    });

    // Let user pick
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> => new Promise((r) => rl.question(q, r));

    console.log();
    const answer = await ask("  Add which? (e.g. 1,3,5 / all / none): ");
    const trimmed = answer.trim().toLowerCase();

    if (trimmed === "none" || trimmed === "n" || trimmed === "") {
        rl.close();
        console.log("  Nothing added.");
        return;
    }

    let indices: number[];
    if (trimmed === "all" || trimmed === "a") {
        indices = suggestions.map((_, i) => i);
    } else {
        indices = trimmed.split(",").map((s) => parseInt(s.trim(), 10) - 1).filter((n) => !isNaN(n) && n >= 0 && n < suggestions.length);
    }

    for (const idx of indices) {
        const s = suggestions[idx];
        const task = createTask({
            id: data.nextTaskId++,
            title: s.title,
            projectIds: [projectId],
            duration: s.duration,
        });
        data.tasks.push(task);

        if (s.subtasks && s.subtasks.length > 0) {
            for (const subTitle of s.subtasks) {
                const sub = createTask({
                    id: data.nextTaskId++,
                    title: subTitle,
                    projectIds: [projectId],
                    parentId: task.id,
                });
                data.tasks.push(sub);
                task.subtaskIds.push(sub.id);
            }
        }

        const subCount = s.subtasks?.length || 0;
        console.log(`  ✓ Added "${s.title}"${subCount > 0 ? ` + ${subCount} subtasks` : ""}`);
    }

    rl.close();
    saveData(data);
    console.log(`\n  Done! ${indices.length} task(s) added.\n`);
}

function callGemini(apiKey: string, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
        });

        const options = {
            hostname: "generativelanguage.googleapis.com",
            path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            method: "POST",
            headers: { "Content-Type": "application/json" },
        };

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        reject(new Error(parsed.error.message));
                    } else {
                        resolve(parsed.candidates[0].content.parts[0].text);
                    }
                } catch {
                    reject(new Error("Invalid API response"));
                }
            });
        });

        req.on("error", reject);
        req.write(body);
        req.end();
    });
}