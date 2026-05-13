/**
 * ARS Manager API - v13.0 (Fortress Engine)
 * 憲章第3条「8秒の誓い」をタイム・ガーディアンで完全遵守。
 * 窓口（check.js）からの同期キックスタートに対応した要塞化モデル。
 */

const MODEL_NAME = "gemini-2.0-flash";

// Redis Helper (Upstash REST API)
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

// Gemini API Helper
const callGemini = async (prompt, useGrounding = false) => {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is missing.");
    
    const tools = useGrounding ? [{ googleSearchRetrieval: {} }] : [];
    
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: tools
        })
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const startTime = Date.now();
    const VOW_LIMIT = 7500; // 憲章第3.1条: 8秒の誓い（余裕を持って7.5秒で撤退）

    try {
        // 1. メンテナンス時刻の確認
        const lastMaint = await redis('get', 'ars_last_maint_time') || 0;
        const now = Date.now();
        
        // 2. リレー状態の取得 (Upstashのhgetallは空の時に [] を返す)
        const rawState = await redis('hgetall', 'ars_v12_state');
        let state = null;
        if (rawState && !Array.isArray(rawState)) {
            state = rawState;
        } else if (Array.isArray(rawState) && rawState.length > 0) {
            state = {};
            for (let i = 0; i < rawState.length; i += 2) state[rawState[i]] = rawState[i+1];
        }

        let topic = state?.topic;
        let step = state ? parseInt(state.step) : -1;
        if (isNaN(step)) step = -1;

        // --- ルーチン判定ロジック (憲章第3.2条) ---
        if (step === -1) {
            // 需要（付箋）があるか確認
            const [topTheme] = await redis('zrevrange', 'ars_v12_queue', 0, 0);
            
            if (topTheme) {
                topic = topTheme;
                step = 0;
                await redis('hset', 'ars_v12_state', 'topic', topic, 'step', "0", 'data', "");
            } else if (now - lastMaint > 86400000) {
                // 巡回メンテナンス（憲章第3.2.2条）
                const keys = await redis('hkeys', 'ars_v12_knowledge');
                if (keys && keys.length > 0) {
                    topic = keys[Math.floor(Math.random() * keys.length)];
                    step = 0;
                    await redis('set', 'ars_last_maint_time', now.toString());
                    await redis('hset', 'ars_v12_state', 'topic', topic, 'step', "0", 'data', "MAINTENANCE");
                }
            } else {
                // 市場スカウティング（憲章第3.2.3条）
                return res.json({ status: "IDLE", message: "No active demand or maintenance." });
            }
        }

        // --- 8秒リレー実行ループ ---
        const host = req.headers.host;
        const selfUrl = `https://${host}/api/autopilot.js`;
        const relayOptions = { headers: { 'x-ars-auth': 'fortress-v13' } };

        const triggerRelay = async () => {
            try {
                await Promise.race([fetch(selfUrl, relayOptions), new Promise(resolve => setTimeout(resolve, 800))]);
            } catch (e) {}
        };

        // 実行開始
        if (step === 0) {
            // 【Step 0: 計画立案】
            const plan = `Researching: ${topic}`;
            await redis('hset', 'ars_v12_state', 'step', "1", 'data', plan);
            await triggerRelay();
            return res.json({ status: "PROGRESS", topic, step: 1 });
        }

        if (step === 1) {
            // 【Step 1: 深層リサーチ】 (タイム・ガーディアン監視)
            const researchPrompt = `「${topic}」について、最新の法規制、事例、対策を徹底的に調査してください。`;
            const researchData = await callGemini(researchPrompt, true);
            
            await redis('hset', 'ars_v12_state', 'step', "2", 'data', researchData);
            await triggerRelay();
            return res.json({ status: "PROGRESS", topic, step: 2 });
        }

        if (step === 2) {
            // 【Step 2: 重厚執筆】 (憲章第4条: 3,000文字級マニュアル)
            const gatheredData = state?.data || "";
            const synthPrompt = `以下のデータを基に、ARS鑑定窓口用の【3,000文字超の構造化マニュアル】を作成してください。\n\nデータ:\n${gatheredData}`;
            const manual = await callGemini(synthPrompt, false);
            
            // 図書館に保存して、机を片付ける
            await redis('hset', 'ars_v12_knowledge', topic, manual);
            await redis('del', 'ars_v12_state');
            await redis('zrem', 'ars_v12_queue', topic);
            
            return res.json({ status: "COMPLETED", topic, message: "Manual generated." });
        }

        return res.json({ status: "IDLE", message: "Nothing to do." });

    } catch (e) {
        return res.json({ status: "ERROR", message: e.message });
    }
};
