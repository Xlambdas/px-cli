import express from "express";
import * as path from "path";
import * as os from "os";
import { loadData, saveData } from "./utils/storage";
import { canComplete, projectProgress } from "./utils/helpers";

const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "../src/web/index.html"));
});

app.get("/api/data", (_req, res) => {
    const data = loadData();
    const projects = data.projects.map((p) => ({
        ...p,
        progress: projectProgress(data, p.id),
        focused: data.focus.includes(p.id),
    }));
    const tasks = data.tasks.map((t) => {
        const check = canComplete(data, t);
        return { ...t, blocked: !check.ok, blockReason: check.reason };
    });
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - mondayOffset);
    monday.setHours(0, 0, 0, 0);
    const allDone = data.tasks.filter((t) => t.status === "done" && t.completedAt);
    const doneToday = allDone.filter((t) => t.completedAt!.slice(0, 10) === todayStr).length;
    const doneThisWeek = allDone.filter((t) => new Date(t.completedAt!) >= monday).length;
    const totalTodo = data.tasks.filter((t) => t.status === "todo" && !t.parentId).length;
    const totalDone = data.tasks.filter((t) => t.status === "done" && !t.parentId).length;
    res.json({ projects, tasks, focus: data.focus, stats: { doneToday, doneThisWeek, totalTodo, totalDone } });
});

app.post("/api/quick", (req, res) => {
    const { title } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: "Title required" });
    const data = loadData();
    const task = {
        id: String(data.nextTaskId++),
        title: title.trim(),
        projectIds: [] as string[],
        subtaskIds: [] as string[],
        conditionIds: [] as string[],
        status: "todo" as const,
        createdAt: new Date().toISOString(),
    };
    data.tasks.push(task);
    saveData(data);
    res.json({ ok: true, task });
});

app.post("/api/done/:id", (req, res) => {
    const id = req.params.id;
    const data = loadData();
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (task.status === "done") return res.json({ ok: true, already: true });
    const check = canComplete(data, task);
    if (!check.ok) return res.status(400).json({ error: check.reason });
    task.status = "done";
    task.completedAt = new Date().toISOString();
    if (task.parentId !== undefined) {
        const parent = data.tasks.find((t) => t.id === task.parentId);
        if (parent) {
            const allDone = parent.subtaskIds.every((sid) => {
                const s = data.tasks.find((t) => t.id === sid);
                return s && s.status === "done";
            });
            if (allDone) {
                parent.status = "done";
                parent.completedAt = new Date().toISOString();
            }
        }
    }
    saveData(data);
    res.json({ ok: true });
});

app.post("/api/untodo/:id", (req, res) => {
    const id = req.params.id;
    const data = loadData();
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    task.status = "todo";
    task.completedAt = undefined;
    saveData(data);
    res.json({ ok: true });
});

export function startServer(): void {
    const PORT = 3478;
    app.listen(PORT, "0.0.0.0", () => {
        const nets = os.networkInterfaces();
        let localIp = "localhost";
        for (const name of Object.keys(nets)) {
            for (const net of nets[name] || []) {
                if (net.family === "IPv4" && !net.internal) {
                    localIp = net.address;
                    break;
                }
            }
        }
        console.log(`\n  📱 px web server running\n`);
        console.log(`  Laptop:  http://localhost:${PORT}`);
        console.log(`  Phone:   http://${localIp}:${PORT}`);
        console.log(`\n  Press Ctrl+C to stop\n`);
    });
}