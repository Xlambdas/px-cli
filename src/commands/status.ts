import { loadData } from "../utils/storage";
import {
  getTaskOrDie,
  projectProgress,
  taskProgress,
  canComplete,
  fmtDeadline,
  fmtDuration,
} from "../utils/helpers";

/**
 * px status        → all projects with progress
 * px status 3      → detail of task #3 (subtasks, conditions, etc)
 */
export function showStatus(args: string[]): void {
  const data = loadData();

  if (args.length === 0) {
    // Project overview
    if (data.projects.length === 0) {
      console.log("No projects. Create one: px project add \"Name\"");
      return;
    }
    console.log("\n📊 Project Status\n");
    for (const p of data.projects) {
      const pct = projectProgress(data, p.id);
      const total = data.tasks.filter(
        (t) => t.projectIds.includes(p.id) && t.parentId === undefined
      ).length;
      const done = data.tasks.filter(
        (t) =>
          t.projectIds.includes(p.id) &&
          t.parentId === undefined &&
          t.status === "done"
      ).length;
      const dl = fmtDeadline(p.deadline);
      const focus = data.focus.includes(p.id) ? " ★" : "";
      console.log(`  #${p.id}  ${p.title}${focus}  ${done}/${total} tasks  ${pct}%  ${dl}`);
    }
    console.log();
    return;
  }

  // Task detail
  const id = parseInt(args[0], 10);
  const task = getTaskOrDie(data, id);
  const check = canComplete(data, task);
  const pct = taskProgress(data, task);

  console.log(`\n📋 Task #${task.id}: ${task.title}`);
  console.log(`   Status: ${task.status}  ${check.ok ? "✅ ready" : `⛔ ${check.reason}`}`);
  console.log(`   Progress: ${pct}%`);
  if (task.duration) console.log(`   Duration: ${fmtDuration(task.duration)}`);
  if (task.deadline) console.log(`   Deadline: ${fmtDeadline(task.deadline)}`);

  if (task.projectIds.length > 0) {
    const names = task.projectIds
      .map((pid) => data.projects.find((p) => p.id === pid)?.title ?? `#${pid}`)
      .join(", ");
    console.log(`   Projects: ${names}`);
  }

  if (task.subtaskIds.length > 0) {
    console.log(`   Subtasks:`);
    for (const sid of task.subtaskIds) {
      const sub = data.tasks.find((t) => t.id === sid);
      if (sub) {
        const mark = sub.status === "done" ? "✓" : "○";
        console.log(`     ${mark} #${sub.id} ${sub.title}`);
      }
    }
  }

  if (task.conditionIds.length > 0) {
    console.log(`   Depends on:`);
    for (const cid of task.conditionIds) {
      const dep = data.tasks.find((t) => t.id === cid);
      if (dep) {
        const mark = dep.status === "done" ? "✓" : "○";
        console.log(`     ${mark} #${dep.id} ${dep.title}`);
      }
    }
  }

  console.log();
}
