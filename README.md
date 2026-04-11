# px — Project Execute CLI

A personal project & task management system built for speed, daily execution, and zero decision fatigue.

---

## Setup

```bash
cd px-cli
npm install
npx tsc
npm link
```

### Tab Completion (PowerShell)

```bash
px completion --install
```

If that doesn't work, paste this instead:

```powershell
px completion | Out-File -Append $PROFILE -Encoding utf8
```

Restart PowerShell after installing.

---

## Quick Start

```bash
# Create projects
px project add "Portfolio" --descr "Personal website" --deadline 2026-05-01
px project add "Internship" --descr "Find summer internships"

# Add tasks
px add "Design homepage" --project "Portfolio" --duration 90
px add "Write CV" --project "Internship" --duration 45

# Add subtasks
px add "Header layout" --parent 1.1
px add "Hero section" --parent 1.1

# Add dependencies
px dep 1.3 --needs 1.2

# Focus on 2-3 projects
px focus 1 2

# Start your day
px day
```

---

## All Commands

### Projects

| Command | What it does |
|---------|-------------|
| `px project add "Name" [--descr "X"] [--deadline DATE]` | Create a project |
| `px project list` | List all projects |

### Tasks

| Command | What it does |
|---------|-------------|
| `px add "Task" [--project "X"] [--parent ID] [--duration MIN] [--deadline DATE]` | Add a task |
| `px quick "Task"` | Fast capture → inbox |
| `px inbox` | Review & assign inbox tasks |
| `px edit <ID>` | Edit a task interactively |
| `px done <ID>` | Complete a task (cascades to subtasks) |
| `px dep <ID> [ID ...] --needs <ID> [ID ...]` | Add dependencies |
| `px undo` | Revert last action |

### Today (daily quick tasks)

| Command | What it does |
|---------|-------------|
| `px todo "Task" [--duration MIN] [--every INTERVAL]` | Add today task |
| `px todo` | Show today's list |
| `px todo done <number>` | Complete a today task |
| `px todo clear` | Remove completed (keeps recurring) |
| `px todo clear --all` | Remove ALL (asks confirmation) |
| `px todo reset [--keep 2 5]` | New day: reset recurring, keep specified |

Recurrence intervals: `daily`, `weekly`, `monthly`, or `<number><d|w|m>` (e.g. `2d`, `4w`, `2m`)

### Views

| Command | What it does |
|---------|-------------|
| `px list [--all] [--project "X" or ID]` | Browse tasks |
| `px status` | All projects overview |
| `px status <ID or "Name">` | Project detail (tree view) |
| `px status <task-ID>` | Task detail |
| `px stats` | Productivity dashboard |

### Daily Workflow

| Command | What it does |
|---------|-------------|
| `px focus [ID ID ...]` | Set/view today's projects |
| `px day` | Interactive daily session |

### AI Suggestions

| Command | What it does |
|---------|-------------|
| `px ai` | Suggest next tasks (default) |
| `px ai next` | What should I work on next? |
| `px ai plan` | Full project plan (5-8 tasks) |
| `px ai expand <ID>` | Break a task into subtasks |
| `px ai setup` | Setup guide for Gemini API |

Requires `GEMINI_API_KEY` — run `px ai setup` for instructions.

### Archive

| Command | What it does |
|---------|-------------|
| `px archive --project <ID>` | Archive a project + tasks |
| `px archive --task <ID>` | Archive a task + subtasks |
| `px archive list` | Show archived items |
| `px archive restore <ID>` | Restore from archive |

### Sync (Git)

| Command | What it does |
|---------|-------------|
| `px start` | Pull latest + import from projects.md |
| `px start --perso` | Same with personal SSH key |
| `px end` | Export projects.md + commit + push |
| `px end --perso` | Same with personal SSH key |

### Web UI (phone access)

| Command | What it does |
|---------|-------------|
| `px web` | Start web server |
| `px web --code` | Start + show QR code |
| `px web setup` | Troubleshooting guide |

### Other

| Command | What it does |
|---------|-------------|
| `px help <command>` | Detailed help for any command |
| `px completion --install` | Install tab completion |

---

## How It Works

### ID System

Tasks use hierarchical IDs based on their project:

- Project `1` → tasks `1.1`, `1.2`, `1.3`
- Subtasks of `1.2` → `1.2.1`, `1.2.2`
- Sub-subtasks of `1.2.1` → `1.2.1.1`
- Inbox tasks (no project) → simple numbers `1`, `2`, `3`

### Daily Flow

```
Morning:
  px start          → git pull + import markdown changes
  px todo reset     → reset recurring tasks
  px focus 1 2      → pick projects
  px day            → interactive session

During the day:
  px todo "Quick task"     → add to today
  px quick "Random idea"   → capture to inbox
  px done 1.3              → complete tasks

Evening:
  px end            → export markdown + git push
```

### Sync via Git

`px end` exports all projects/tasks to `data/projects.md` (human-readable).
You can edit this file on GitHub or any device.
`px start` imports changes back into `data.json`.

What you can edit in `projects.md`:

- Toggle status: `[ ]` ↔ `[x]`
- Change titles, durations `(60min)`, deadlines `{2026-05-01}`
- Change dependencies `[needs 1.1, 1.2]`
- Add new tasks (lines without an ID)
- Add new projects (new `# Header`)
- Delete projects (remove the `# Header` section)

### Web UI

Run `px web --code` and scan the QR code with your phone.
Features: quick capture, today tasks, project task checklist, stats.
Both CLI and web UI read/write the same `data.json`.

### AI Suggestions

Uses Google Gemini API (free tier). The AI:

- Reads your project context, existing tasks, and progress
- Asks 3 questions on first run (type, stage, goal) — saved forever
- Learns from what you accept vs reject
- Suggests actionable tasks (30min-2h each)

---

## Architecture

```
px-cli/
├── src/
│   ├── index.ts              # CLI router
│   ├── server.ts             # Express web server
│   ├── commands/
│   │   ├── add.ts            # px add
│   │   ├── quick.ts          # px quick
│   │   ├── today.ts          # px todo
│   │   ├── inbox.ts          # px inbox
│   │   ├── edit.ts           # px edit
│   │   ├── focus.ts          # px focus
│   │   ├── day.ts            # px day
│   │   ├── done.ts           # px done
│   │   ├── dep.ts            # px dep
│   │   ├── undo.ts           # px undo
│   │   ├── list.ts           # px list
│   │   ├── status.ts         # px status
│   │   ├── stats.ts          # px stats
│   │   ├── project.ts        # px project
│   │   ├── archive.ts        # px archive
│   │   ├── sync.ts           # px start / px end
│   │   ├── ai.ts             # px ai
│   │   └── completion.ts     # px completion
│   ├── ai/
│   │   ├── gemini.ts         # Gemini API caller
│   │   ├── parser.ts         # AI response parser
│   │   └── promptBuilder.ts  # Context-aware prompts
│   ├── models/
│   │   └── index.ts          # Data types + ID generation
│   ├── utils/
│   │   ├── storage.ts        # JSON read/write
│   │   └── helpers.ts        # Shared logic
│   └── web/
│       └── index.html        # Mobile web UI
├── data/
│   ├── data.json             # All data
│   └── projects.md           # Human-readable export
├── package.json
└── tsconfig.json
```
