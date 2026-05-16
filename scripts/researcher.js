/**
 * ARS Researcher Script - v16.4 (Stabilized Self-Growing Engine)
 * リサーチ中の重複実行を防ぐ「STUDYING」ロック機能を搭載。
 * 憲章第6.1条（低コスト）に基づき、GitHub Actionsの無料枠を鉄壁防衛する。
 */

const MODEL_NAME = "gemini-3-flash-preview";

const redis = async (command, ...args) => {
    const url = (process.env.KV_REST_API_URL || "https://pretty-llama-117521.upstash.io").trim();
    const token = (process.env.KV_REST_API_TOKEN || "gQAAAAAAAcsRAAIgcDIzMTUxOGQzNmY5Yzg0ZjE1YTA0OWE4YWRmNzc2N2E3NQ").trim();
    const cleanUrl = url.replace(/\/$/, "");
    const res = await fetch(cleanUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify([command, ...args])
    });
    const data = await res.json();
    return data.result;
};

const callGemini = async (prompt) => {
    const key = process.env.GEMINI_API_KEY;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
};

const callTavily = async (query) => {
    const key = process.env.TAVILY_API_KEY;
    if (!key) return null;
    try {
        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: key, query, search_depth: "advanced", max_results: 5 })
        });
        return await res.json();
    } catch (e) {
        console.error("[Tavily ERROR]", e);
        return null;
    }
};

async function main() {
    let topic = "";
    try {
        const gap = process.env.ARS_GAP;
        const targetTopic = process.env.ARS_TOPIC;
        let isIncremental = false;
        let existingManual = "";

        if (gap && targetTopic) {
            topic = targetTopic;
            existingManual = await redis('hget', 'ars_v12_knowledge', topic) || "";
            isIncremental = true;
        } else {
            const queue = await redis('zrevrange', 'ars_v12_queue', 0, 0);
            if (queue && queue.length > 0) topic = queue[0];
        }

        if (!topic) return console.log("No work found.");
        
        // --- ロック開始 ---
        await redis('hset', 'ars_v12_status', topic, 'STUDYING');
        console.log(`[ARS] Research started for: ${topic}`);

        // --- 外部検索フェーズ ---
        let searchContext = "";
        const searchQuery = isIncremental ? `${topic} ${gap} 規制 ニュース 2026` : `${topic} 最新 法規制 2026 事例`;
        const searchData = await callTavily(searchQuery);
        if (searchData && searchData.results) {
            searchContext = "\n【最新の外部検索結果】\n" + searchData.results.map(r => `- ${r.title}: ${r.content} (${r.url})`).join("\n");
        }

        // --- リサーチフェーズ ---
        let prompt = isIncremental 
            ? `テーマ「${topic}」の既存マニュアルに、不足論点「${gap}」を追記せよ。\n${searchContext}\n【既存マニュアル】\n${existingManual.substring(0, 3000)}...\n最新事例を優先し、人間が数日がかりで読み込むレベルの詳細な追記を行え。`
            : `テーマ「${topic}」について、世界最高峰の法学者として極限まで詳細なリファレンスマニュアルを作成せよ。\n${searchContext}\n2026年の最新ニュースを反映させ、全知全能のバイブルを完成させよ。`;

        const newKnowledge = await callGemini(prompt);

        if (newKnowledge && newKnowledge.length > 100) {
            let finalKnowledge = isIncremental 
                ? `${existingManual}\n\n---\n\n## 【自律拡張：${new Date().toISOString()}（外部検索適用）】\n### 追加論点：${gap}\n${newKnowledge}`
                : newKnowledge;
            
            if (searchData && searchData.results) {
                finalKnowledge += "\n\n【参考文献・ソース】\n" + searchData.results.map(r => `- ${r.url}`).join("\n");
            }

            await redis('hset', 'ars_v12_knowledge', topic, finalKnowledge);
            
            // 高速チェックリスト生成
            const checklist = await callGemini(`以下の聖典を300文字の高速鑑定用チェックリストに要約せよ。\n${finalKnowledge.substring(0, 5000)}`);
            if (checklist) await redis('hset', 'ars_v12_checklist', topic, checklist);

            if (!isIncremental) await redis('zrem', 'ars_v12_queue', topic);
            console.log(`[ARS] Research completed for: ${topic}`);
        }
    } catch (error) {
        console.error("CRITICAL ERROR:", error);
    } finally {
        // --- ロック解除 ---
        if (topic) {
            await redis('hdel', 'ars_v12_status', topic);
            console.log(`[ARS] Study-lock released for: ${topic}`);
        }
    }
}

main();
