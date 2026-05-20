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

async function performScout() {
    console.log("[ARS] No more work found in queue. Initiating Scout Mission (Market Exploration)...");
    const queries = [
        "日本 広告 規制 違反 最新 2026",
        "消費者庁 措置命令 景表法 最新",
        "薬機法 違反事例 広告 最新 2026",
        "金融商品 広告 規制 違反 2026",
        "個人情報保護法 広告 2026 最新"
    ];
    const searchQuery = queries[Math.floor(Math.random() * queries.length)];
    
    const searchData = await callTavily(searchQuery);
    if (!searchData || !searchData.results || searchData.results.length === 0) return false;
    
    const searchSummary = searchData.results.map(r => `タイトル: ${r.title}\n要約: ${r.content}`).join("\n\n");
    const existingKeys = await redis('hkeys', 'ars_v12_knowledge') || [];
    const existingKeysStr = existingKeys.length > 0 ? existingKeys.join("、") : "（なし）";

    const analysisPrompt = `
あなたはARSの斥候AIです。最新のWeb検索結果から、ARSがまだ学習していない未知の法律規制テーマを発掘してください。
【既存の知識】${existingKeysStr}
【最新ニュース】
${searchSummary}

【指示】
既存の知識一覧に「存在しない」全く新しい規制テーマを最大2件抽出してください。
出力は以下のJSONフォーマットのみとしてください。
{
  "new_topics": ["新しいテーマ名1", "新しいテーマ名2"]
}`;

    const rawResponse = await callGemini(analysisPrompt);
    let analysis = { new_topics: [] };
    try {
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) analysis = JSON.parse(jsonMatch[0]);
    } catch (e) { return false; }

    let addedWork = false;
    if (analysis.new_topics && analysis.new_topics.length > 0) {
        for (const t of analysis.new_topics) {
            await redis('zadd', 'ars_v12_queue', Date.now(), t);
            console.log(`[Scout] ✅ Queued new topic for learning: ${t}`);
            addedWork = true;
        }
    }
    return addedWork;
}

async function main() {
    let isIncrementalRun = false;
    const gap = process.env.ARS_GAP;
    const targetTopic = process.env.ARS_TOPIC;
    
    if (gap && targetTopic) {
        isIncrementalRun = true;
    }

    while (true) {
        let topic = "";
        let existingManual = "";
        let isIncremental = false;

        try {
            if (isIncrementalRun) {
                topic = targetTopic;
                existingManual = await redis('hget', 'ars_v12_knowledge', topic) || "";
                isIncremental = true;
            } else {
                const queue = await redis('zrevrange', 'ars_v12_queue', 0, 0);
                if (queue && queue.length > 0) {
                    topic = queue[0];
                    existingManual = await redis('hget', 'ars_v12_knowledge', topic) || "";
                }
            }

            if (!topic) {
                if (isIncrementalRun) break;
                
                // 憲章第3.3条：やることがなければ、SNSからトレンドを拾い「先回り学習」を行う。
                const scoutFoundWork = await performScout();
                if (scoutFoundWork) {
                    continue; // 新しいテーマを見つけたので、ループを回してすぐに学習を開始する
                } else {
                    console.log("[ARS] Scout found no new trends. Exiting loop.");
                    break;
                }
            }
            
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
            console.error("CRITICAL ERROR DURING RESEARCH:", error);
        } finally {
            if (topic) {
                await redis('hdel', 'ars_v12_status', topic);
                console.log(`[ARS] Study-lock released for: ${topic}`);
            }
        }

        // 差分リサーチ（Incremental）の場合は1回で終了
        if (isIncrementalRun) {
            break;
        }
    }
}

main();
