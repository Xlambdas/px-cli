import express from "express";
import * as path from "path";
import * as os from "os";
import { loadData, saveData } from "./utils/storage";
import { generateTaskId } from "./models";
import { canComplete, projectProgress } from "./utils/helpers";
import * as qrcode from "qrcode-terminal";

const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
    const candidates = [
        path.join(__dirname, "../src/web/index.html"),   // running from dist/
        path.join(__dirname, "../../src/web/index.html"), // running from dist/commands/
        path.join(process.cwd(), "src/web/index.html"),  // running from project root
    ];
    const found = candidates.find(p => require("fs").existsSync(p));
    if (!found) {
        res.status(500).send("Could not locate index.html — run px web from the project root.");
        return;
    }
    res.sendFile(found);
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
        id: generateTaskId(data),
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

app.get("/api/today", (_req, res) => {
    const data = loadData();
    res.json(data.todayTasks || []);
});

app.post("/api/today", (req, res) => {
    const { title } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: "Title required" });
    const data = loadData();
    if (!data.todayTasks) data.todayTasks = [];
    const task = {
        id: `today-${Date.now()}`,
        title: title.trim(),
        projectIds: [] as string[],
        subtaskIds: [] as string[],
        conditionIds: [] as string[],
        status: "todo" as const,
        createdAt: new Date().toISOString(),
    };
    data.todayTasks.push(task);
    saveData(data);
    res.json({ ok: true, task });
});

app.post("/api/today/done/:index", (req, res) => {
    const idx = parseInt(req.params.index, 10);
    const data = loadData();
    if (!data.todayTasks || idx < 0 || idx >= data.todayTasks.length) {
        return res.status(404).json({ error: "Not found" });
    }
    data.todayTasks[idx].status = "done";
    data.todayTasks[idx].completedAt = new Date().toISOString();
    saveData(data);
    res.json({ ok: true });
});

app.put("/api/task/:id", (req, res) => {
    const id = req.params.id;
    const data = loadData();
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    const { title, duration, deadline, description } = req.body;
    if (title !== undefined) task.title = title;
    if (duration !== undefined) task.duration = duration || undefined;
    if (deadline !== undefined) task.deadline = deadline || undefined;
    if (description !== undefined) task.description = description || undefined;
    saveData(data);
    res.json({ ok: true });
});

app.delete("/api/task/:id", (req, res) => {
    const id = req.params.id;
    const data = loadData();
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    // Remove from parent's subtaskIds
    if (task.parentId) {
        const parent = data.tasks.find((t) => t.id === task.parentId);
        if (parent) parent.subtaskIds = parent.subtaskIds.filter((s) => s !== id);
    }
    // Remove references from other tasks
    for (const t of data.tasks) {
        t.conditionIds = t.conditionIds.filter((c) => c !== id);
    }
    // Remove task and all its subtasks recursively
    function collectIds(taskId: string): string[] {
        const t = data.tasks.find((x) => x.id === taskId);
        if (!t) return [taskId];
        let ids = [taskId];
        for (const sid of t.subtaskIds) ids = ids.concat(collectIds(sid));
        return ids;
    }
    const removeIds = new Set(collectIds(id));
    data.tasks = data.tasks.filter((t) => !removeIds.has(t.id));
    saveData(data);
    res.json({ ok: true });
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

app.put("/api/today/:index", (req, res) => {
    const idx = parseInt(req.params.index, 10);
    const data = loadData();
    if (!data.todayTasks || idx < 0 || idx >= data.todayTasks.length) {
        return res.status(404).json({ error: "Not found" });
    }
    const { title, duration, recurrence } = req.body;
    if (title !== undefined) data.todayTasks[idx].title = title;
    if (duration !== undefined) data.todayTasks[idx].duration = duration || undefined;
    if (recurrence !== undefined) data.todayTasks[idx].recurrence = recurrence || undefined;
    saveData(data);
    res.json({ ok: true });
});

app.delete("/api/today/:index", (req, res) => {
    const idx = parseInt(req.params.index, 10);
    const data = loadData();
    if (!data.todayTasks || idx < 0 || idx >= data.todayTasks.length) {
        return res.status(404).json({ error: "Not found" });
    }
    data.todayTasks.splice(idx, 1);
    saveData(data);
    res.json({ ok: true });
});

export function startServer(showQr: boolean = false): void {
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
        console.log("\n╔═══════════════════════════════════════╗");
        console.log("║               WEB SERVER              ║");
        console.log("╚═══════════════════════════════════════╝\n");
        console.log(`  Laptop:  http://localhost:${PORT}`);
        console.log(`  Phone:   http://${localIp}:${PORT}`);
        if (showQr) {
            qrcode.generate(`http://${localIp}:${PORT}`, { small: true });
        }
        console.log(`\n  Press Ctrl+C to stop\n`);
    });
}