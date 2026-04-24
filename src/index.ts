#!/usr/bin/env node
import { startServer } from "./server";
import {
    addTask, quickAdd, inboxReview,
    setFocus, daySession, markDone,
    addDependency, listTasks, showStats,
    showStatus, editTask, undo,
    projectAdd, projectList, aiCommand,
    pxStart, pxEnd, todayCommand,
    archiveCommand, completionCommand, nextCommand,
    cleanCommand, versionCommand, initCommand
} from "./commands";
import { checkVersionOnce } from "./utils/versionCheck";

const [command, ...args] = process.argv.slice(2);

async function main() {
    checkVersionOnce();
    switch (command) {
        case "help":
            if (args[0]) {
                showCommandHelp(args[0]);
            } else {
                showGeneralHelp();
            }
            break;
        case "version":
            await versionCommand(args);
            break;
        case "init":
            await initCommand();
            break;
        // Tasks
        case "add":
            addTask(args);
            break;
        case "quick":
            quickAdd(args);
            break;
        case "todo":
            todayCommand(args);
            break;
        case "done":
            markDone(args);
            break;
        case "next":
            nextCommand(args);
            break;
        case "edit":
            await editTask(args);
            break;
        case "undo":
            undo();
            break;
        case "clean":
            await cleanCommand(args);
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
                startServer(args.includes("--qr"));
            }
                break;
        case "ai":
            await aiCommand(args);
            break;
        case "start":
            pxStart(process.argv.includes("--perso") || process.argv.includes("-p"));
            break;
        case "end":
            pxEnd(process.argv.includes("--perso") || process.argv.includes("-p"));
            break;

        // Projects
        case "project":
            if (args[0] === "add") projectAdd(args.slice(1));
            else if (args[0] === "list") projectList();
            else console.log("Usage: px project add|list");
            break;

        case "archive":
            archiveCommand(args);
            break;

        // Help
        case "completion":
            completionCommand(args);
            break;
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
        todo "task title" [--duration MIN] [--every INTERVAL]       Add to today's list
        inbox
        edit <ID>

        focus [ID ID ...]
        day

        done <ID>
        dep <ID> --needs <ID>
        undo
        clean [--report] [--auto]

        list [--all] [--project "X"]
        next [--top N]
        status [ID or "Name"]
        stats
        archive [--project ID | --task ID | list | restore ID]

        ai [next|plan|expand|clean <ID>]
        web [--qr]
        start [--perso]
        end [--perso]
        version [--check | --update]
        help <command>

--- Run "px help <command>" for details on any command ---

`);
}

function showCommandHelp(cmd: string): void {
    const help: Record<string, string> = {
        add: `
\x1b[32m--- px add "Task title" [options] ---\x1b[0m

    Options:
        --project, -p  "Name"          Assign to project (repeat for multiple)
        --parent, -P    ID             Make this a subtask of task #ID
        --descr, -d    "Description"   Task description
        --duration, -t  MIN            Estimated minutes (e.g. 60)
        --deadline, -D  DATE           Due date (YYYY-MM-DD)

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

        todo: `
\x1b[32m--- px todo [options] ---\x1b[0m

    Quick daily task list, separate from projects.

    Commands:
        px todo                              Show today's tasks
        px todo "Task" [options]             Add a task to today
        px todo done <number>                Complete a task by its number
        px todo clear                        Remove completed (keeps recurring)
        px todo clear --all, -a              Remove ALL tasks (asks confirmation)
        px todo reset                        New day: reset recurring, remove the rest
        px todo reset --keep, -k [id ...]    New day but keep tasks id (by shown index from "px todo" list)

    Options for adding:
        --duration, -t MIN                   Estimated minutes (e.g. 60)
        --every, -e INTERVAL                 Recurrence interval

    Recurrence intervals:
        daily, weekly, monthly,
        <number>d    e.g. 2d = every 2 days,
        <number>w    e.g. 4w = every 4 weeks,
        <number>m    e.g. 2m = every 2 months.

    Examples:
        px todo "Write report" --duration 60
        px todo "Meditate" --duration 15 --every daily
        px todo "Workout" --every 2d
        px todo "Review goals" --every weekly
        px todo done 3
        px todo reset --keep 2 4
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
        - All dependencies (px dep) must be done

    Notes:
        - Completing a task with subtasks also completes all subtasks
        - Completing the last subtask auto-completes the parent

    Examples:
        px done 3
    `,

        dep: `
\x1b[32m--- px dep <ID> [ID ...] --needs <ID> [ID ...] ---\x1b[0m

    Add a dependency between tasks.
    Task A cannot be completed until task B is done - px dep A --needs B.

    Usage:
        --needs, -n    Specify dependencies (repeat for multiple)

    Examples:
        px dep 5 --needs 3
        → Task 5 "Deploy" needs task 3 "Build" first

    Notes:
        You can add multiple dependencies at once:
        px dep 5 6 --needs 3
        → Tasks 5 and 6 both need task 3
        Or add multiple needs:
        px dep 5 --needs 3 4
        → Task 5 needs both tasks 3 and 4
    `,

        undo: `
\x1b[32m--- px undo ---\x1b[0m

    Reverts the last action. One level deep.
    Restores data.json from backup created before every save.

    Examples:
        px done 3       (oops, wrong task)
        px undo         (task 3 is todo again)
    `,

        clean: `
\x1b[32m--- px clean [options] ---\x1b[0m
    Cleanup for your task list.

    What it does:
        1. Suggests tasks to archive or delete based on age, inactivity, or being blocked for a long time.
        2. Provides a report of what was cleaned and why.
        3. Optionally auto-cleans without confirmation.

    Options:
    px clean                  → interactive: finds dupes, orphans, oversize, dead refs
    px clean --report, -r     → just shows issues
    px clean --auto, -a       → auto-fixes safe issues (dead refs, orphans, empty)
    px ai clean               → AI analyzes writing style, suggests renames/merges/splits/reorders

    Examples:
        px clean --report
        px clean --auto
    `,

        list: `
\x1b[32m--- px list [options] ---\x1b[0m

    Browse tasks. Shows top-level todo tasks by default.

    Options:
        --all, -a              Include done tasks
        --project, -p "Name"   Filter by project

    Examples:
        px list
        px list --all
        px list --project "Portfolio"
        px list --project 3
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

        next: `
\x1b[32m--- px next [--top N] ---\x1b[0m

    Get next best task to work on, based on:
        - Unblocked and incomplete tasks only
        - Focused projects prioritized
        - Tasks ≤ 2h preferred
        - Scoring algorithm considers deadlines, durations, project focus, and more

    Options:
        --top, -t  N         Show top N tasks instead of just 1

    Examples:
        px next              single best task with reason
        px next --top 3      top 3
        px next --top 5      top 5
    `,


        archive: `
\x1b[32m--- px archive [--project ID | --task ID | list | restore ID] ---\x1b[0m

    archive --project, -p <ID>             Archive a project
    archive --task, -t    <ID>             Archive a task
    archive list                           Show archived items
    archive restore <ID>                   Restore from archive

    Examples:
        px archive --project 1
        px archive --task 3
        px archive list
        px archive restore 2
    `,


        project: `
\x1b[32m--- px project add "Name" [options] / px project list ---\x1b[0m

    Options for add:
        --descr, -d     "Description"         Project description
        --deadline, -D   DATE                 Due date (YYYY-MM-DD)

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
        px ai clean <ID>   Suggest improvements for a task (title, description, project)
        px ai setup        Show setup instructions and tips

    Notes:
        First run asks 3 questions (type, stage, goal) — saved forever.
        System learns your preferences over time.
        Requires GEMINI_API_KEY environment variable.
    `,

        web: `
\x1b[32m--- px web [option] / px web setup ---\x1b[0m

    Starts a web server for phone access.
    Shows tasks, inbox, and stats in a mobile-friendly UI.

    Options:
        --qr    Show QR code in terminal for easy phone access

    Troubleshooting (px web setup):
        - Windows Firewall fix
        - How to find your IP
        - localtunnel for remote access
        - SSH tunnel option
    `,
        start: `
\x1b[32m--- px start ---\x1b[0m

    Morning routine. Run this when you sit down to work.

    What it does:
        1. git pull (get latest from any device)
        2. Checks if projects.md was edited
        3. Imports status changes back into data.json
        4. Creates a backup before importing

    Notes:
        Edit projects.md on your phone to toggle tasks.
        Change [ ] to [x] or [x] to [ ] — px start picks it up.
    `,

        end: `
\x1b[32m--- px end ---\x1b[0m

    End of session. Run this when you stop working.

    What it does:
        1. Exports all projects/tasks to projects.md
        2. git add + commit + push

    Notes:
        projects.md is human-readable and editable.
        You can edit it on your phone and run px start to import.
    `,

        version: `
\x1b[32m--- px version [--check | --update] ---\x1b[0m
    Show current version, check for updates, or self-update.

    Options:
        --check, -c     Check if a newer version is available
        --update, -u    If a newer version exists, update to it

    Examples:
        px version
        px version --check
        px version --update
    `
        };

    const text = help[cmd];
    if (text) {
        console.log(text);
    } else {
        console.log(` Unknown command: "${cmd}". Run "px" to see all commands.`);
    }
}

main().catch(console.error);
