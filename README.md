# px — Project Execute

A personal project & task management CLI. Built for speed, daily execution, and zero decision fatigue.

---

## Setup

```bash
cd px-cli
npm install
npx tsc
npm link
px init
```

`px init` walks you through git remote, Gemini API key, SSH key, and creates the data directory.

### Tab Completion (PowerShell)

```bash
px completion --install
```

Or manually:

```powershell
px completion | Out-File -Append $PROFILE -Encoding utf8
```

Restart PowerShell after installing.

---

## Quick Start

```bash
px project add "Portfolio" --descr "Personal website" --deadline 2026-05-01
px add "Design homepage" --project "Portfolio" --duration 90
px add "Header layout" --parent 1.1
px dep 1.3 --needs 1.2
px focus 1 2
px day
```

---

## Commands

### Projects

| Command | Description |
|---|---|
| `px project add "Name" [--descr "X"] [--deadline DATE]` | Create a project |
| `px project list` | List all projects |

### Tasks

| Command | Description |
|---|---|
| `px add "Task" [--project "X"] [--parent ID] [--duration MIN] [--deadline DATE]` | Add a task |
| `px quick "Task"` | Fast capture → inbox |
| `px inbox` | Review & assign inbox tasks |
| `px edit <ID>` | Edit a task interactively |
| `px done <ID>` | Complete a task (cascades to subtasks) |
| `px dep <ID> [ID ...] --needs <ID> [ID ...]` | Add dependencies |
| `px undo` | Revert last action |

### Today

Separate daily task list, outside of projects.

| Command | Description |
|---|---|
| `px todo "Task" [--duration MIN] [--every INTERVAL]` | Add a today task |
| `px todo` | Show today's list |
| `px todo done <number>` | Complete by number |
| `px todo clear` | Remove completed (keeps recurring) |
| `px todo clear --all` | Remove all (asks confirmation) |
| `px todo reset [--keep 2 5]` | New day: reset recurring, optionally keep specific tasks |

Recurrence: `daily`, `weekly`, `monthly`, `2d`, `4w`, `2m`, etc.

### Views

| Command | Description |
|---|---|
| `px list [--all] [--project "X" or ID]` | Browse tasks |
| `px status` | All projects overview |
| `px status <ID or "Name">` | Project detail with tree view |
| `px status <task-ID>` | Task detail |
| `px stats` | Productivity dashboard with streak |
| `px next [--top N]` | Best next task(s) to work on |

### Daily Workflow

| Command | Description |
|---|---|
| `px focus [ID ...]` | Set/view today's focus projects |
| `px day` | Interactive daily session |

### Sync

| Command | Description |
|---|---|
| `px start [--perso]` | `git pull` + import changes from `projects.md` |
| `px end [--perso]` | Export `projects.md` + `git commit` + `git push` |

`--perso` uses a personal SSH key (`~/.ssh/id_ed25519_personal`). Configure the path with `px init`.

### AI

Requires a Gemini API key — run `px init` or `px ai setup` to configure.

| Command | Description |
|---|---|
| `px ai` | Suggest next tasks (default) |
| `px ai next` | What should I work on next? |
| `px ai plan` | Full project plan (5–8 tasks) |
| `px ai expand <ID>` | Break a task into subtasks |
| `px ai clean <ID>` | Suggest improvements for a task |
| `px ai setup` | Setup guide |

### Archive

| Command | Description |
|---|---|
| `px archive --project <ID>` | Archive a project and its tasks |
| `px archive --task <ID>` | Archive a task and its subtasks |
| `px archive list` | Show archived items |
| `px archive restore <ID>` | Restore from archive |

### Other

| Command | Description |
|---|---|
| `px init` | First-time setup wizard |
| `px version` | Show current version |
| `px version --check` | Check if an update is available |
| `px version --update` | Update to latest version |
| `px clean [--report\|--auto]` | Find and fix data issues |
| `px web [--qr]` | Start web UI (add `--qr` for phone QR code) |
| `px web setup` | Web UI troubleshooting guide |
| `px completion --install` | Install PowerShell tab completion |
| `px help <command>` | Detailed help for any command |

---

## Daily Flow

```
Morning
  px start          → pull latest + import markdown changes
  px todo reset     → reset recurring tasks for the new day
  px focus 1 2      → pick 2–3 projects to focus on
  px day            → interactive session

During the day
  px todo "Meeting notes"   → quick today capture
  px quick "Random idea"    → capture to inbox (assign later)
  px done 1.3               → complete tasks

Evening
  px end            → export markdown + push to git
```

---

## How It Works

### ID System

IDs are hierarchical and project-scoped:

```
Project 1  →  tasks 1.1, 1.2, 1.3
              subtasks 1.2.1, 1.2.2
              sub-subtasks 1.2.1.1
Inbox      →  1, 2, 3 (no project prefix)
```

### Git Sync

`px end` exports everything to `data/projects.md`. Edit that file anywhere — on GitHub, your phone, another device — then `px start` imports the changes back.

What you can edit in `projects.md`:

- Toggle status: `[ ]` ↔ `[x]`
- Change titles, durations `(60min)`, deadlines `{2026-05-01}`
- Update dependencies `[needs 1.1, 1.2]`
- Add new tasks (lines without an ID get new IDs on import)
- Add new projects (new `# Header`)
- Delete projects (remove the `# Header` section)

### Update Notifications

`px` checks for updates in the background (once per day). If a newer version is available, you'll see a one-time notice on any command. `px end` always does a live check.

---

## Architecture

```
px-cli/
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── commands/
│   │   ├── index.ts
│   │   ├── init.ts
│   │   ├── add.ts, quick.ts, today.ts
│   │   ├── inbox.ts, edit.ts, done.ts
│   │   ├── dep.ts, undo.ts, clean.ts
│   │   ├── focus.ts, day.ts, next.ts
│   │   ├── list.ts, status.ts, stats.ts
│   │   ├── project.ts, archive.ts
│   │   ├── sync.ts, ai.ts
│   │   ├── version.ts, completion.ts
│   ├── ai/
│   │   ├── gemini.ts
│   │   ├── parser.ts
│   │   └── promptBuilder.ts
│   ├── models/index.ts
│   ├── utils/
│   │   ├── storage.ts
│   │   ├── versionCheck.ts
│   │   └── helpers.ts
│   └── web/index.html
├── data/
│   ├── data.json          ← all task/project data
│   ├── config.json        ← api keys, settings (gitignored)
│   └── projects.md        ← human-readable export
├── package.json
└── tsconfig.json
```

---

## License

ISC License — see [LICENSE.md](./LICENSE.md)

© 2026 XLS.studio
