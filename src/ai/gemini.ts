import * as https from "https";

export function callGemini(apiKey: string, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
        });

        const options = {
            hostname: "generativelanguage.googleapis.com",
            path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            method: "POST",
            headers: { "Content-Type": "application/json" },
        };

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        reject(new Error(parsed.error.message));
                    } else {
                        resolve(parsed.candidates[0].content.parts[0].text);
                    }
                } catch {
                    reject(new Error("Invalid API response"));
                }
            });
        });

        req.on("error", reject);
        req.write(body);
        req.end();
    });
}