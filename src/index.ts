#!/usr/bin/env node

/**
 * px - Project Execute CLI
 *
 * This file is the ROUTER. It reads the command you typed
 * and calls the right function. No logic lives here.
 *
 * WHY a manual router instead of a CLI framework (like Commander.js)?
 * → Zero dependencies. You can add one later if this gets unwieldy.
 *   Right now, with ~10 commands, a switch statement is perfectly fine.
 */

import { addTask } from "./commands/add";
import { quickAdd } from "./commands/quick";
import { inboxReview } from "./commands/inbox";
import { setFocus } from "./commands/focus";
import { daySession } from "./commands/day";
import { markDone } from "./commands/done";
import { addDependency } from "./commands/dep";
import { listTasks } from "./commands/list";
import { showStatus } from "./commands/status";
import { projectAdd, projectList } from "./commands/project";

const [command, ...args] = process.argv.slice(2);

async function main() {
  switch (command) {
    // Tasks
    case "add":
      addTask(args);
      break;
    case "quick":
      quickAdd(args);
      break;
    case "done":
      markDone(args);
      break;
    case "dep":
      addDependency(args);
      break;

    // Views
    case "list":
      listTasks(args);
      break;
    case "status":
      showStatus(args);
      break;

    // Daily workflow
    case "focus":
      setFocus(args);
      break;
    case "day":
      await daySession();
      break;
    case "inbox":
      await inboxReview();
      break;

    // Projects
    case "project":
      if (args[0] === "add") projectAdd(args.slice(1));
      else if (args[0] === "list") projectList();
      else console.log("Usage: px project add|list");
      break;

    // Help
    default:
      console.log(`
  px - Project Execute

  Commands:
    project add "Name" [--deadline DATE]   Create a project
    project list                           List all projects

    add "Task" [--project "X"] [--parent ID] [--duration MIN] [--deadline DATE]
    quick "Task title"                     Quick capture to inbox
    inbox                                  Review inbox tasks

    focus [ID ID ...]                      Set/view focused projects
    day                                    Interactive daily session

    done <ID>                              Mark task done
    dep <ID> --needs <ID>                  Add dependency
    list [--all] [--project "X"]           Browse tasks
    status [ID]                            Project overview or task detail
      `);
      break;
  }
}

main().catch(console.error);
