import https from "https";
import { version as CURRENT_VERSION } from "../../package.json";
import { loadConfig, saveConfig } from "./storage";

export function isNewer(latest: string, current: string): boolean {
    const l = latest.split(".").map(Number);
    const c = current.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        if ((l[i] || 0) > (c[i] || 0)) return true;
        if ((l[i] || 0) < (c[i] || 0)) return false;
    }
    return false;
}

export async function fetchLatestVersion(): Promise<string | null> {
    return new Promise((resolve) => {
        const req = https.get("https://registry.npmjs.org/px-cli/latest", (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try { resolve(JSON.parse(data).version); }
                catch { resolve(null); }
            });
        });
        req.on("error", () => resolve(null));
    });
}

/**
 * Called on every command startup.
 * Shows a one-time notification if there's a cached newer version,
 * then kicks off a background refresh (non-blocking).
 */
export function checkVersionOnce(): void {
    const config = loadConfig();
    const cached = config.lastVersionCheck;

    // Show once per new version using the cache from last background fetch
    if (cached && isNewer(cached.latestVersion, CURRENT_VERSION)) {
        if (config.notifiedUpdateVersion !== cached.latestVersion) {
            console.log(`\n  💡 px v${cached.latestVersion} available (you have v${CURRENT_VERSION}) — run: px version --update\n`);
            config.notifiedUpdateVersion = cached.latestVersion;
            saveConfig(config);
        }
    }

    // Background refresh every 24h — doesn't block process exit
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const lastCheck = cached?.checkedAt ? new Date(cached.checkedAt).getTime() : 0;
    if (Date.now() - lastCheck > ONE_DAY) {
        const req = https.get("https://registry.npmjs.org/px-cli/latest", (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try {
                    const cfg = loadConfig();
                    cfg.lastVersionCheck = {
                        checkedAt: new Date().toISOString(),
                        latestVersion: JSON.parse(data).version,
                    };
                    saveConfig(cfg);
                } catch { }
            });
        });
        req.on("error", () => { });
        req.socket?.unref();
        // req.unref(); // don't keep Node alive for this
    }
}

/**
 * Called at px end — always fetches live, always prints if newer.
 */
export async function checkVersionForEnd(): Promise<void> {
    const latest = await fetchLatestVersion();
    if (!latest) return;
    if (isNewer(latest, CURRENT_VERSION)) {
        console.log(`\n  💡 px v${latest} available (you have v${CURRENT_VERSION}) — run: px version --update\n`);
        const config = loadConfig();
        config.lastVersionCheck = { checkedAt: new Date().toISOString(), latestVersion: latest };
        config.notifiedUpdateVersion = latest;
        saveConfig(config);
    }
}