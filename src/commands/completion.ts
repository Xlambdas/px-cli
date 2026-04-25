import { loadData } from "../utils/storage";

/**
    * px completion              → outputs PowerShell completion script
    * px completion --install    → adds it to your PowerShell profile
*/
export function completionCommand(args: string[]): void {
    const script = `

#╔═══════════════════════════════════════╗
#║        px CLI tab completion          ║
#╚═══════════════════════════════════════╝

Register-ArgumentCompleter -CommandName 'px','px.cmd','px.ps1' -Native -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $text = $commandAst.ToString()
    $parts = $text -split '\s+'
    $count = $parts.Length

    # If cursor is at a space after last word, we're completing the NEXT arg
    if ($text.Length -lt $cursorPosition -or $text[$cursorPosition - 1] -eq ' ') {
        $count++
        $wordToComplete = ''
    }

    $cmd = if ($count -gt 1) { $parts[1] } else { '' }

    $results = @()

    if ($count -le 2) {
        $results = @(
            'add','quick','todo','done','edit','dep','undo',
            'list','status','stats','focus','day','inbox',
            'project','ai','web','start','end','archive','help','completion'
        )
    } else {
        switch ($cmd) {
            'project'  { $results = @('add','list') }
            'ai'       { $results = @('next','plan','expand','setup') }
            'web'      { $results = @('--code','setup') }
            'todo'     { $results = @('done','clear','reset') }
            'archive'  { $results = @('--project','--task','list','restore') }
            'start'    { $results = @('--perso') }
            'end'      { $results = @('--perso') }
            'next'     { $results = @('--top') }
            'list'     { $results = @('--all','--project') }
            'add'      { $results = @('--project','--parent','--duration','--deadline') }
            'help'     { $results = @(
                            'add','quick','todo','done','edit','dep','undo',
                            'list','status','stats','focus','day','inbox',
                            'project','ai','web','start','end','archive'
            )}
            { $_ -in @('done','edit','status','dep','archive') } {
                $json = & px completion --ids 2>$null
                if ($json) { $results = $json | ConvertFrom-Json }
            }
            'focus' {
                $json = & px completion --project-ids 2>$null
                if ($json) { $results = $json | ConvertFrom-Json }
            }
        }
    }

    $results | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
}
#════════════════════════════════════════
`;

    if (args.includes("--install")) {
        const fs = require("fs");
        const os = require("os");
        const path = require("path");
        const readline = require("readline");

        const defaultProfileDir = path.join(os.homedir(), "Documents", "PowerShell");
        const defaultProfilePath = path.join(defaultProfileDir, "Microsoft.PowerShell_profile.ps1");

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

        rl.question(
            `  Where should the completion file be saved?\n  [default: ${defaultProfilePath}]: `,
            (answer: string) => {
                rl.close();

                const targetPath = answer.trim() || defaultProfilePath;
                const targetDir = path.dirname(targetPath);

                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }

                // Write (or append) the script to the chosen file
                const existing = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf-8") : "";
                if (existing.includes("Register-ArgumentCompleter -CommandName px")) {
                    console.log("  Already installed — nothing changed.");
                    return;
                }
                fs.appendFileSync(targetPath, "\n" + script + "\n");
                console.log(`  ✓ Completion script written to ${targetPath}`);

                // If the user picked a non-default location, dot-source it from the real profile
                if (path.resolve(targetPath) !== path.resolve(defaultProfilePath)) {
                    if (!fs.existsSync(defaultProfileDir)) {
                        fs.mkdirSync(defaultProfileDir, { recursive: true });
                    }
                    const profileContent = fs.existsSync(defaultProfilePath)
                        ? fs.readFileSync(defaultProfilePath, "utf-8")
                        : "";
                    const sourceLine = `. "${targetPath}"`;
                    if (!profileContent.includes(sourceLine)) {
                        fs.appendFileSync(defaultProfilePath, `\n${sourceLine}\n`);
                        console.log(`  ✓ Linked from PowerShell profile → ${defaultProfilePath}`);
                    } else {
                        console.log("  Profile already references this file — skipped.");
                    }
                }

                console.log("  Restart PowerShell to activate.");
            }
        );
        return;
    }

    // Internal: output task IDs as JSON for completion
    if (args.includes("--ids")) {
        const data = loadData();
        const ids = data.tasks.map((t) => t.id);
        console.log(JSON.stringify(ids));
        return;
    }

    // Internal: output project IDs as JSON for completion
    if (args.includes("--project-ids")) {
        const data = loadData();
        const ids = data.projects.map((p) => p.id);
        console.log(JSON.stringify(ids));
        return;
    }

    // Default: print the script
    console.log(script);
}