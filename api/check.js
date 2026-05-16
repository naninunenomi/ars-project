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

    // ★【要塞化】URL末尾のスラッシュを確実に排除してPOST
    const cleanUrl = url.replace(/\/$/, "");
    const res = await fetch(cleanUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify([command, ...args])
    });
    const data = await res.json();
    return data.result;
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const ghToken = process.env.GH_PAT;
    const owner = "naninunenomi";
    const repo = "ars-project";
    
    const { text, theme } = req.body;
    
    if (!text || !theme) return res.status(400).json({ error: "Text and Theme are required.", disclaimer: DISCLAIMER });

    try {
        console.log(`[ARS] Request received for theme: ${theme}`);
        
        // --- 憲章第4条-3: 階層型遡り検索 (Hierarchical Search) ---
        const themeParts = theme.split('/');
        let manual = null;
        let activeTheme = theme;

        console.log(`[ARS] Looking for knowledge library...`);
        for (let i = themeParts.length; i > 0; i--) {
            const currentPath = themeParts.slice(0, i).join('/');
            // --- 憲章第2.1条: 高速鑑定用チェックリストを優先 ---
            manual = await redis('hget', 'ars_v12_checklist', currentPath) || await redis('hget', 'ars_v12_knowledge', currentPath);
            if (manual) {
                activeTheme = currentPath;
                break;
            }
        }

        if (manual) {
            console.log(`[ARS] Knowledge found: ${activeTheme}. Starting valuation...`);
            const unitPrice = await redis('get', 'ars_unit_price') || "1.15";
            
            // --- 憲章第2.1条: メタ認知（知能の自己採点） ---
            const evalPrompt = `以下の【鑑定マニュアル】を用いて、この広告を100%の自信を持って鑑定できるか判定せよ。
マニュアル:
${manual}
対象テキスト: "${text}"

JSONのみで回答せよ。もしマニュアルに今回の商材や論点に関する具体的な言及が足りない場合、confidenceを90未満にし、gapに「不足している具体的な法的論点」を1単語で記述せよ。
{ "confidence": 0-100, "gap": "不足している論点", "verdict": "SAFE/RISKY/DANGER", "reason": "理由" }`;
            
            const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: evalPrompt }] }] })
            });
            const data = await geminiRes.json();
            
            if (data.candidates && data.candidates.length > 0) {
                const responseText = data.candidates[0].content.parts[0].text;
                const jsonMatch = responseText.match(/\{.*\}/s);
                const evalResult = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
                
                console.log(`[ARS] Knowledge Confidence: ${evalResult.confidence}%`);

                // 知識が不十分（90%未満）なら差分リサーチを起動
                if (evalResult.confidence < 90 && ghToken) {
                    console.log(`[ARS] Confidence low. Gap detected: ${evalResult.gap}. Dispatching Incremental Research...`);
                    try {
                        await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${ghToken}`,
                                'Accept': 'application/vnd.github+json',
                                'X-GitHub-Api-Version': '2022-11-28',
                                'User-Agent': 'ARS-Fortress-v16'
                            },
                            body: JSON.stringify({ 
                                event_type: "ars-research-command",
                                client_payload: { gap: evalResult.gap, topic: activeTheme }
                            })
                        });
                    } catch (e) {
                        console.error("[ARS] Incremental Dispatch Failed:", e);
                    }
                }
                
                return res.json({ 
                    ...evalResult, 
                    price: `${unitPrice} ARS`, 
                    source: manual === theme ? 'KNOWLEDGE_LIBRARY' : `HIERARCHICAL_MATCH (${activeTheme})`, 
                    disclaimer: DISCLAIMER,
                    model: "gemini-3-flash-preview"
                });
            }
 else {
                console.error("[ARS] Gemini Valuation Failed:", data);
                return res.json({ status: "STUDYING", message: "Valuation failed. Refining...", disclaimer: DISCLAIMER });
            }
        } else {
            console.log(`[ARS] No knowledge found. Dispatching Researcher...`);
            await redis('zincrby', 'ars_v12_queue', 1, theme);
            
            if (ghToken) {
                try {
                    const triggerRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${ghToken}`,
                            'Accept': 'application/vnd.github+json',
                            'X-GitHub-Api-Version': '2022-11-28',
                            'User-Agent': 'ARS-Fortress-v14'
                        },
                        body: JSON.stringify({ event_type: "ars-research-command" })
                    });
                    console.log(`[ARS] Researcher Dispatch Status: ${triggerRes.status}`);
                } catch (e) {
                    console.error("[ARS] GitHub Trigger Exception:", e);
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
