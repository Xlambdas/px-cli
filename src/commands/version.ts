import https from "https";
import { execSync } from "child_process";
import { version as CURRENT_VERSION } from "../../package.json";

// Replace the two local functions with imports:
import { fetchLatestVersion, isNewer } from "../utils/versionCheck";

export async function versionCommand(args: string[]) {
    const check = args.includes("--check") || args.includes("-c");
    const update = args.includes("--update") || args.includes("-u");

    console.log(`px v${CURRENT_VERSION}`);

    // If neither check nor update → just print version
    if (!check && !update) return;

    console.log("Checking for updates...");

    const latest = await fetchLatestVersion();

    if (!latest) {
        console.log("Could not check latest version.");
        return;
    }

    const hasUpdate = isNewer(latest, CURRENT_VERSION);

    if ((check || update) && !hasUpdate) {
        console.log("✔ You are using the latest version.");
        return;
    }

    console.log(`\n⚠ New version available: v${latest}`);

    // Only check
    if (check && !update) {
        console.log(`Run: px version --update\n`);
        return;
    }

    // Update flow
    if (update) {
        console.log("\nUpdating px...");

        try {
            execSync("npm update -g px-cli", { stdio: "inherit" });
            console.log("\n✔ Update complete. Restart your terminal.\n");
        } catch {
            console.log("\n⚠ Update failed. Try manually:");
            console.log("npm update -g px-cli\n");
        }
    }
}