/**
 * ARS Researcher Script - v16.2 (Search-Augmented Engine)
 * Tavily APIを利用した外部検索機能を搭載。
 * 「内部知識」と「最新のネット情報」を融合させ、真の全知全能を目指す。
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
    if (!key) {
        console.log("[Tavily] Key missing. Skipping external search.");
        return null;
    }
    console.log(`[Tavily] Searching for: ${query}`);
    try {
        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: key,
                query: query,
                search_depth: "advanced",
                max_results: 5
            })
        });
        return await res.json();
    } catch (e) {
        console.error("[Tavily ERROR]", e);
        return null;
    }
};

async function main() {
    console.log("ARS Researcher starting (v16.2 - Search-Augmented Mode)...");
    try {
        const gap = process.env.ARS_GAP;
        const targetTopic = process.env.ARS_TOPIC;
        let topic = "";
        let existingManual = "";
        let isIncremental = false;

        if (gap && targetTopic) {
            topic = targetTopic;
            existingManual = await redis('hget', 'ars_v12_knowledge', topic) || "";
            isIncremental = true;
        } else {
            const queue = await redis('zrevrange', 'ars_v12_queue', 0, 0);
            if (queue && queue.length > 0) topic = queue[0];
        }

        if (!topic) return console.log("No work found.");

        // --- 外部検索フェーズ ---
        let searchContext = "";
        const searchQuery = isIncremental ? `${topic} ${gap} 規制 ニュース 2026` : `${topic} 最新 法規制 2026 事例`;
        const searchData = await callTavily(searchQuery);
        
        if (searchData && searchData.results) {
            searchContext = "\n【最新の外部検索結果】\n" + searchData.results.map(r => `- ${r.title}: ${r.content} (${r.url})`).join("\n");
        }

        // --- リサーチフェーズ ---
        let prompt = "";
        if (isIncremental) {
            prompt = `あなたは法務コンプライアンスの専門家です。テーマ「${topic}」の既存マニュアルに、不足論点「${gap}」を追記せよ。
${searchContext}
【既存マニュアル】
${existingManual.substring(0, 3000)}...

指示：検索結果の最新事例を優先的に取り込み、既存の内容とマージして、人間が数日がかりで読み込むレベルの詳細な追記を行え。`;
        } else {
            prompt = `テーマ「${topic}」について、世界最高峰の法学者として極限まで詳細な産業グレードのリファレンスマニュアルを作成せよ。
${searchContext}
指示：検索結果に含まれる2026年の最新ニュースや規制動向を必ず反映させ、全知全能のバイブルを完成させよ。`;
        }

        const newKnowledge = await callGemini(prompt);

        if (newKnowledge && newKnowledge.length > 100) {
            let finalKnowledge = isIncremental 
                ? `${existingManual}\n\n---\n\n## 【自律拡張：${new Date().toISOString()}（外部検索適用）】\n### 追加論点：${gap}\n${newKnowledge}`
                : newKnowledge;
            
            // 出典の追記
            if (searchData && searchData.results) {
                finalKnowledge += "\n\n【参考文献・ソース】\n" + searchData.results.map(r => `- ${r.url}`).join("\n");
            }

            await redis('hset', 'ars_v12_knowledge', topic, finalKnowledge);
            
            // --- 憲章第2.1条: 高速鑑定用チェックリストの生成 ---
            const checklistPrompt = `以下の【鑑定マニュアル】を、1秒で判定可能な「超凝縮チェックリスト（300-500文字）」に要約せよ。
法的核心部分（何がアウトか、どう言い換えるべきか）のみを抽出し、無駄な修飾語を一切排除せよ。

【鑑定マニュアル】
${finalKnowledge.substring(0, 5000)}`;

            const checklist = await callGemini(checklistPrompt);
            if (checklist) {
                console.log(`Generated fast checklist (${checklist.length} chars)`);
                await redis('hset', 'ars_v12_checklist', topic, checklist);
            }

            if (!isIncremental) await redis('zrem', 'ars_v12_queue', topic);
            console.log(`Successfully updated knowledge for: ${topic}. Total length: ${finalKnowledge.length}`);
        }
    } catch (error) {
        console.error("CRITICAL ERROR:", error);
        process.exit(1);
    }
}

main();
