/**
 * ARS Manager - v11.0 (Charter Compliant)
 * 憲章第3条「8秒の誓い」と「3段階リレー方式学習」を完全実装
 */

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

const callGemini = async (prompt, useGrounding = false) => {
    const model = useGrounding ? "gemini-2.5-flash" : "gemini-2.5-flash"; // Grounding対応モデル
    const body = {
        contents: [{ parts: [{ text: prompt }] }]
    };
    if (useGrounding) {
        body.tools = [{ google_search: {} }];
    }
    
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates[0].content.parts[0].text;
};

module.exports = async (req, res) => {
    const startTime = Date.now();
    const VOW_LIMIT = 8000; // 【8秒の誓い】

    try {
        // 1. 24時間メンテナンスのチェック
        const lastMaint = await redis('get', 'ars_last_maint_time') || 0;
        const now = Date.now();
        
        // 2. リレー状態の取得
        let state = await redis('hgetall', 'ars_research_state');
        let topic = state?.topic;
        let step = state ? parseInt(state.step) : -1;

        // --- ルーチン判定ロジック (憲章第3.2条) ---
        if (step === -1) {
            // 需要（付箋）があるか確認
            const [topTheme] = await redis('zrevrange', 'ars_learning_queue', 0, 0);
            
            if (topTheme) {
                topic = topTheme;
                step = 0;
                await redis('hset', 'ars_research_state', 'topic', topic, 'step', "0", 'data', "");
            } else if (now - lastMaint > 86400000) {
                // 24時間経っていたらメンテナンス（既存知識の1つを再学習）へ
                const keys = await redis('hkeys', 'ars_knowledge_base');
                if (keys && keys.length > 0) {
                    topic = keys[Math.floor(Math.random() * keys.length)];
                    step = 0;
                    await redis('set', 'ars_last_maint_time', now.toString());
                    await redis('hset', 'ars_research_state', 'topic', topic, 'step', "0", 'data', "MAINTENANCE");
                }
            } else {
                // 需要もメンテもなければ「市場パトロール（スカウティング）」
                // ※将来実装。今は待機。
                return res.json({ status: "IDLE", message: "No demand or maintenance tasks." });
            }
        }

        // --- 8秒リレー実行ループ ---
        const host = req.headers.host;
        const selfUrl = `https://${host}/api/autopilot.js`;

        while (Date.now() - startTime < VOW_LIMIT) {
            if (step === 0) {
                // 【Step 0: 方針決定】
                const result = `Initiating research for: ${topic}`;
                await redis('hset', 'ars_research_state', 'step', "1", 'data', result);
                
                // 次を予約
                fetch(selfUrl).catch(() => {});
                
                return res.json({ status: "PROGRESS", topic, step: 1, message: "Research plan initialized." });
            } else if (step === 1) {
                // 【Step 1: 深層リサーチ（Google Grounding）】
                const deepPrompt = `「${topic}」について、最新の法規制（景表法、薬機法等）、公的機関の摘発事例、市場での詐欺手口、消費者の不満、および信頼される表現基準をネットで徹底的に調査し、詳細なレポートを作成してください。`;
                const researchResult = await callGemini(deepPrompt, true);
                await redis('hset', 'ars_research_state', 'step', "2", 'data', researchResult);
                
                // 次を予約
                fetch(selfUrl).catch(() => {});
                
                return res.json({ status: "PROGRESS", topic, step: 2, message: "Deep research completed. Data gathered." });
            } else if (step === 2) {
                // 【Step 2: 巨大マニュアルの生成と保存】
                const synthPrompt = `以下の調査データを基に、ARS鑑定窓口用の【3,000文字超の構造化鑑定マニュアル】を作成してください。\n\nデータ:\n${state?.data || ""}\n\n構成:\n# 概要\n## 関連法規と公的基準\n## 具体的NG表現と事例（詳細）\n## 改善案と信頼構築ガイド\n## 鑑定用チェックリスト\n\n圧倒的な情報量で出力してください。`;
                const manual = await callGemini(synthPrompt, false);
                
                await redis('hset', 'ars_knowledge_base', topic, manual);
                await redis('del', 'ars_research_state');
                await redis('zrem', 'ars_learning_queue', topic);
                
                return res.json({ status: "COMPLETED", topic, message: "Massive manual generated and saved." });
            } else {
                // やるべきことが無ければ即終了
                return res.json({ status: "IDLE", message: "No active relay step." });
            }
        }

        return res.json({ status: "VOW_TIMEOUT", topic, step, message: "Self-withdrawn at 8s mark. Progress saved." });

    } catch (e) {
        return res.json({ error: e.message });
    }
};
