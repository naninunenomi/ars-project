/**
 * ARS Gatekeeper - v11.0 (Charter Compliant)
 * 憲章第2条に基づき、爆速判定・需要可視化・階層検索を実装
 */

const DISCLAIMER = "※本結果はAIによる鑑定であり、100%の正確性を保証するものではありません。最終的な判断は専門家にご確認ください。";

// Redis Helper (Hardened for v11.0)
const redis = async (command, ...args) => {
    let rawUrl = (process.env.KV_REST_API_URL || "").trim();
    let url = rawUrl.startsWith("http") ? rawUrl : "https://pretty-llama-117521.upstash.io";
    let rawToken = (process.env.KV_REST_API_TOKEN || "").trim();
    let token = rawToken.length > 10 ? rawToken : "gQAAAAAAAcsRAAIgcDIzMTUxOGQzNmY5Yzg0ZjE1YTA0OWE4YWRmNzc2N2E3NQ";
    const encodedArgs = args.map(a => encodeURIComponent(a)).join('/');
    const res = await fetch(`${url}/${command}/${encodedArgs}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    return data.result;
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { text, theme } = req.body;
    
    if (!text || !theme) return res.status(400).json({ error: "Text and Theme are required.", disclaimer: DISCLAIMER });

    try {
        // --- 憲章第4条-3: 階層型遡り検索 (Hierarchical Search) ---
        const themeParts = theme.split('/');
        let manual = null;
        let activeTheme = theme;

        // 具体的なテーマから順に親カテゴリへ遡ってマニュアルを探す
        for (let i = themeParts.length; i > 0; i--) {
            const currentPath = themeParts.slice(0, i).join('/');
            manual = await redis('hget', 'ars_v12_knowledge', currentPath);
            if (manual) {
                activeTheme = currentPath;
                break;
            }
        }

        const unitPrice = await redis('get', 'ars_unit_price') || "1.15";

        if (manual) {
            // --- 憲章第2条-1: 即断即決 ---
            const prompt = `以下の【鑑定マニュアル】を絶対基準として広告を鑑定せよ。\nマニュアル:\n${manual}\n対象テキスト: "${text}"\nJSONのみで回答: { "verdict": "SAFE/RISKY/DANGER", "reason": "理由" }`;
            
            const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await geminiRes.json();
            
            if (data.candidates && data.candidates.length > 0) {
                const responseText = data.candidates[0].content.parts[0].text;
                const jsonMatch = responseText.match(/\{.*\}/s);
                const result = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
                
                return res.json({ 
                    ...result, 
                    price: `${unitPrice} ARS`, 
                    source: manual === theme ? 'KNOWLEDGE_LIBRARY' : `HIERARCHICAL_MATCH (${activeTheme})`, 
                    disclaimer: DISCLAIMER,
                    model: "gemini-2.5-flash"
                });
            }
        } else {
            // --- 憲章第2.2条: 非同期キックスタート（GitHubへの指令） ---
            await redis('zincrby', 'ars_v12_queue', 1, theme);
            
            // ★【要塞化】GitHub Actions 研究員を起動する
            const owner = "n-kyohei"; // リポジトリの所有者
            const repo = "ars-project"; // リポジトリ名
            const ghToken = process.env.GH_PAT; // GitHub Personal Access Token
            
            if (ghToken) {
                try {
                    // GitHub APIへ指令を送信（非同期）
                    fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${ghToken}`,
                            'Accept': 'application/vnd.github+json',
                            'X-GitHub-Api-Version': '2022-11-28'
                        },
                        body: JSON.stringify({ event_type: "ars-research-command" })
                    });
                } catch (e) {
                    console.error("GitHub Trigger Error:", e);
                }
            }

            return res.json({
                status: "STUDYING",
                message: `ARS Researcher has been dispatched for theme: "${theme}". Deep research is in progress.`,
                disclaimer: DISCLAIMER
            });
        }
    } catch (e) {
        return res.status(500).json({ error: e.message, disclaimer: DISCLAIMER });
    }
};
