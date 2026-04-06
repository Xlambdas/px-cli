import { loadData, saveData } from "../utils/storage";
import { projectProgress, fmtDeadline } from "../utils/helpers";

/**
 * px focus 1 3
 *
 * Sets which projects you're working on today.
 * WHY limit to 2-3? → Context switching kills productivity.
 * The system doesn't enforce a limit, but you should.
 *
 * px focus (no args) → shows current focus
 */
export function setFocus(args: string[]): void {
  const data = loadData();

  if (args.length === 0) {
    // Show current focus
    if (data.focus.length === 0) {
      console.log("No projects focused. Use: px focus 1 3");
      return;
    }
    console.log("\n★ Today's focus:\n");
    for (const pid of data.focus) {
      const p = data.projects.find((pr) => pr.id === pid);
      if (p) {
        const pct = projectProgress(data, p.id);
        console.log(`  #${p.id}  ${p.title}  [${pct}%]  ${fmtDeadline(p.deadline)}`);
      }
    }
    console.log();
    return;
  }

  // Set focus
  const ids = args.map((a) => parseInt(a, 10));
  for (const id of ids) {
    if (!data.projects.find((p) => p.id === id)) {
      console.error(`Project #${id} not found.`);
      process.exit(1);
    }
  }

  data.focus = ids;
  saveData(data);

  const names = ids
    .map((id) => data.projects.find((p) => p.id === id)!.title)
    .join(", ");
  console.log(`★ Focus set: ${names}`);
}
