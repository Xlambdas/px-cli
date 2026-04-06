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
import { showStats } from "./commands/stats";
import { editTask } from "./commands/edit";
import { undo } from "./commands/undo";
import { projectAdd, projectList } from "./commands/project";
import { startServer } from "./server";

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
    case "edit":
      await editTask(args);
      break;
    case "undo":
      undo();
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
    case "stats":
      showStats();
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
    case "web":
      if (args[0] === "help") {
        console.log(`
    px web — Access from your phone

    1. Start the server:
      px web

    2. Open the Phone URL on your phone browser.

    ── If your phone can't connect ──

    Windows Firewall blocking?
      Run PowerShell as Admin:
      netsh advfirewall firewall add rule name="px-web" dir=in action=allow protocol=TCP localport=3478

    Find your laptop IP:
      ipconfig
      Look for "IPv4 Address" under your WiFi adapter.

    ── If phone and laptop are on different networks ──

    Option A: Free tunnel (no install)
      In a second terminal:
      npx localtunnel --port 3478
      → Gives you a public URL, open it on any phone.

    Option B: SSH tunnel (no install)
      In a second terminal:
      ssh -R 80:localhost:3478 nokey@localhost.run
      → Gives you a public URL like https://abc123.localhost.run
          `);
      } else {
        startServer();
      }
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
    edit <ID>                              Edit a task interactively
    undo                                   Revert last action
    dep <ID> --needs <ID>                  Add dependency
    list [--all] [--project "X"]           Browse tasks
    status [ID]                            Project overview or task detail
    stats                                  Productivity stats
    web                                    Start web UI for phone (experimental)
      `);
      break;
  }
}

main().catch(console.error);
