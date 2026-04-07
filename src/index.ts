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
import { aiCommand } from "./commands/ai";

const [command, ...args] = process.argv.slice(2);

async function main() {
    switch (command) {
        case "help":
            if (args[0]) {
                showCommandHelp(args[0]);
            } else {
                showGeneralHelp();
            }
            break;
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
            if (args[0] === "setup") {
                console.log(`
--- px web — Access from your phone ---

    1. Start the server:
        px web

    2. Open the Phone URL on your phone browser.

    -- If your phone can't connect --

    Windows Firewall blocking?
        Run PowerShell as Admin:
        netsh advfirewall firewall add rule name="px-web" dir=in action=allow protocol=TCP localport=3478

    Find your laptop IP:
        ipconfig
        Look for "IPv4 Address" under your WiFi adapter.

    -- If phone and laptop are on different networks --

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
        case "ai":
            await aiCommand(args);
            break;

        // Projects
        case "project":
            if (args[0] === "add") projectAdd(args.slice(1));
            else if (args[0] === "list") projectList();
            else console.log("Usage: px project add|list");
            break;

        // Help
        default:
            showGeneralHelp();
            break;
    }
}

function showGeneralHelp(): void {
    console.log(`

--- px - Project Execute ---

    Commands:
        project add "Name" [--descr "X"] [--deadline DATE]
        project list

        add "Task" [--project "X"] [--parent ID] [--duration MIN] [--deadline DATE]
        quick "Task title"
        inbox
        edit <ID>

        focus [ID ID ...]
        day

        done <ID>
        dep <ID> --needs <ID>
        undo

        list [--all] [--project "X"]
        status [ID or "Name"]
        stats

        ai [next|plan|expand <ID>]
        web
        help <command>

--- Run "px help <command>" for details on any command ---

`);
}

function showCommandHelp(cmd: string): void {
    const help: Record<string, string> = {
        add: `
\x1b[32m--- px add "Task title" [options] ---\x1b[0m

    Options:
        --project "Name"    Assign to project (repeat for multiple)
        --parent ID         Make this a subtask of task #ID
        --duration MIN      Estimated minutes (e.g. 60)
        --deadline DATE     Due date (YYYY-MM-DD)

    Examples:
        px add "Design homepage" --project "Portfolio" --duration 90
        px add "Header layout" --parent 3
        px add "Fix bug" --project "Portfolio" --project "Internship"
        px add "Submit report" --deadline 2026-05-01

    Notes:
        No --project and no --parent = goes to inbox.
    `,

        quick: `
\x1b[32m--- px quick "Task title" ---\x1b[0m

    Ultra-fast capture. No flags, no thinking.
    Task goes to inbox — organize later with px inbox.

    Examples:
        px quick "Fix navbar bug"
        px quick "Read article about system design"
    `,

        inbox: `
\x1b[32m--- px inbox ---\x1b[0m

    Interactive review of unassigned tasks.
    For each inbox task you can:
        Type a project ID    Assign to that project
        Type "s"             Skip (keep in inbox)
        Type "d"             Delete
    `,

        edit: `
\x1b[32m--- px edit <ID> ---\x1b[0m

    Interactive editor. Shows current values,
    press Enter to keep, type to change.

    Editable fields:
        title, duration, deadline, project

    Notes:
        Type "clear" on deadline to remove it.

    Examples:
        px edit 3
    `,

        focus: `
\x1b[32m--- px focus [ID ID ...] ---\x1b[0m

    Set which projects you work on today.
    Used by px day and the web UI to filter tasks.
    Recommended: 2-3 projects max.

    Examples:
        px focus 1 2        Set focus to projects 1 and 2
        px focus            Show current focus
    `,

        day: `
\x1b[32m--- px day ---\x1b[0m

    Interactive daily session. Your core morning ritual.

    Flow:
        1. Shows focused projects with progress
        2. Lists ready tasks and blocked tasks
        3. Type a task ID to mark it done
        4. Screen refreshes — shows what unblocked
        5. Type "q" to quit

    Notes:
        Completing the last subtask auto-completes the parent.
    `,

        done: `
\x1b[32m--- px done <ID> ---\x1b[0m

    Mark a task as done.

    Checks before completing:
        - All subtasks must be done
        - All dependencies (px dep) must be done

    Notes:
        Auto-completes parent when all subtasks finish.

    Examples:
        px done 3
    `,

        dep: `
\x1b[32m--- px dep <ID> --needs <ID> ---\x1b[0m

    Add a dependency between tasks.
    Task A cannot be completed until task B is done.

    Examples:
        px dep 5 --needs 3
        → Task 5 "Deploy" needs task 3 "Build" first
    `,

        undo: `
\x1b[32m--- px undo ---\x1b[0m

    Reverts the last action. One level deep.
    Restores data.json from backup created before every save.

    Examples:
        px done 3       (oops, wrong task)
        px undo         (task 3 is todo again)
    `,

        list: `
\x1b[32m--- px list [options] ---\x1b[0m

    Browse tasks. Shows top-level todo tasks by default.

    Options:
        --all              Include done tasks
        --project "Name"   Filter by project

    Examples:
        px list
        px list --all
        px list --project "Portfolio"
    `,

        status: `
\x1b[32m--- px status [ID or "Name"] ---\x1b[0m

    Three modes:
        px status              All projects overview
        px status 1            Project #1 detail (tree view)
        px status "Portfolio"  Project by name
        px status 47           Task #47 detail (if no project with that ID)

    Notes:
        Project detail shows description, deadline, type,
        stage, goal, progress, and full task tree.
    `,

        stats: `
\x1b[32m--- px stats ---\x1b[0m

    Your productivity dashboard:
        - Tasks done today / this week
        - Total done vs remaining
        - Current streak (consecutive days)
        - All projects with progress bars and task trees
    `,

        project: `
\x1b[32m--- px project add "Name" [options] / px project list ---\x1b[0m

    Options for add:
        --descr "Description"   Project description
        --deadline DATE         Due date (YYYY-MM-DD)

    Examples:
        px project add "Portfolio" --descr "Personal website" --deadline 2026-05-01
        px project list
        `,

        ai: `
\x1b[32m--- px ai [mode] ---\x1b[0m

    Smart task suggestions powered by Gemini AI.

    Modes:
        px ai              Suggest next tasks (default)
        px ai next         Same as above
        px ai plan         Full project plan (5-8 tasks)
        px ai expand <ID>  Break a task into subtasks
        px ai setup        Show setup instructions and tips

    Notes:
        First run asks 3 questions (type, stage, goal) — saved forever.
        System learns your preferences over time.
        Requires GEMINI_API_KEY environment variable.
    `,

        web: `
\x1b[32m--- px web / px web setup ---\x1b[0m

    Starts a web server for phone access.
    Shows tasks, inbox, and stats in a mobile-friendly UI.

    Troubleshooting (px web setup):
        - Windows Firewall fix
        - How to find your IP
        - localtunnel for remote access
        - SSH tunnel option
    `,
    };


    const text = help[cmd];
    if (text) {
        console.log(text);
    } else {
        console.log(` Unknown command: "${cmd}". Run "px" to see all commands.`);
    }
}

main().catch(console.error);
