# px — Project Execute CLI

Your personal project execution system.

## Setup

```bash
# Extract
tar xzf px-cli.tar.gz -C px-cli
cd px-cli

# Install & build
npm install
npx tsc

# Make it global (so you can type "px" anywhere)
npm link
```

## Daily Workflow

```bash
# 1. Create projects
px project add "Portfolio" --deadline 2026-05-01
px project add "Internship"

# 2. Add tasks
px add "Design homepage" --project "Portfolio" --duration 90
px add "Write CV" --project "Internship" --duration 45

# 3. Add subtasks
px add "Header layout" --parent 1
px add "Hero section" --parent 1

# 4. Add dependencies
px dep 3 --needs 2    # task 3 needs task 2 first

# 5. Quick capture (phone-friendly, no thinking required)
px quick "Fix that navbar bug"

# 6. Review inbox
px inbox

# 7. Focus on 2-3 projects for today
px focus 1 2

# 8. Start your day session (interactive!)
px day
```

## All Commands

| Command | What it does |
|---------|-------------|
| `px project add "Name"` | Create a project |
| `px project list` | List all projects |
| `px add "Task" --project "X"` | Add a task |
| `px quick "Task"` | Fast capture → inbox |
| `px inbox` | Review & assign inbox tasks |
| `px focus 1 2` | Set today's projects |
| `px day` | Interactive daily session |
| `px done <id>` | Complete a task |
| `px dep <id> --needs <id>` | Add dependency |
| `px list` | Browse tasks |
| `px status` | Project overview |
| `px status <id>` | Task detail |

## Sync to Phone

Your data lives in `data/data.json`. Push to a private Git repo:

```bash
cd px-cli
git init && git add -A && git commit -m "init"
# push to GitHub private repo
```

On your phone, use Termux (Android) or iSH (iOS) to clone and run `px quick`.
