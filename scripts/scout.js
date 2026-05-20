/**
 * ARS Scout Script - v1.0 (Proactive Learning Agent)
 * 憲章第3.3条「市場開拓」の体現。
 * 誰にも頼まれていないのに、自律的にWebをパトロールして
 * 未知の法律ドメインを先回り学習キューに追加する「斥候AI」。
 * 
 * 動作：
 * 1. Tavilyで最新の広告規制トレンドを検索
 * 2. Geminiが「未知テーマ」と「既存知識の鮮度切れ」を抽出
 * 3. ars_v12_queue に自動追加（上限 MAX_NEW_TOPICS/回）
 * 4. 既存知識の差分更新が必要な場合は差分リサーチをトリガー
 */

const MODEL_NAME = "gemini-2.0-flash";
const MAX_NEW_TOPICS = 3; // 1回のスカウトで追加する最大テーマ数

// ---- Redis クライアント ----
const redis = async (command, ...args) => {
    const url = (process.env.KV_REST_API_URL || "").trim().replace(/\/$/, "");
    const token = (process.env.KV_REST_API_TOKEN || "").trim();
    if (!url || !token) throw new Error("[Scout] Redis credentials missing.");
    const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify([command, ...args])
    });
    const data = await res.json();
    return data.result;
};

// ---- Gemini 呼び出し ----
const callGemini = async (prompt) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("[Scout] GEMINI_API_KEY missing.");
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${key}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
    );
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
};

// ---- Tavily Web検索 ----
const callTavily = async (query) => {
    const key = process.env.TAVILY_API_KEY;
    if (!key) {
        console.warn("[Scout] TAVILY_API_KEY missing. Skipping web search.");
        return null;
    }
    const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, query, search_depth: "advanced", max_results: 7 })
    });
    return await res.json();
};

// ---- メイン ----
async function main() {
    console.log("[Scout] === ARS Scout Agent Started ===");
    const startTime = new Date().toISOString();

    // 検索クエリのローテーション（日付ベースで自動切替）
    const dayOfWeek = new Date().getDay();
    const queries = [
        "日本 広告 規制 違反 最新 2026",
        "消費者庁 措置命令 景表法 最新",
        "薬機法 違反事例 広告 最新 2026",
        "AI 広告 コンプライアンス 規制 2026",
        "金融商品 広告 規制 違反 2026",
        "個人情報保護法 広告 2026 最新",
        "GDPR FTC advertising compliance violation 2026"
    ];
    // 朝実行か夜実行かで異なるクエリを使う
    const hour = new Date().getUTCHours();
    const queryIndex = (dayOfWeek * 2 + (hour < 12 ? 0 : 1)) % queries.length;
    const searchQuery = queries[queryIndex];
    console.log(`[Scout] Search query: "${searchQuery}"`);

    // 1. Tavilyで最新トレンドを検索
    const searchData = await callTavily(searchQuery);
    if (!searchData || !searchData.results || searchData.results.length === 0) {
        console.log("[Scout] No search results. Exiting.");
        return;
    }
    const searchSummary = searchData.results
        .map(r => `タイトル: ${r.title}\n要約: ${r.content}\nURL: ${r.url}`)
        .join("\n\n---\n\n");

    // 2. 現在の知識一覧を取得
    const existingKeys = await redis('hkeys', 'ars_v12_knowledge') || [];
    const existingKeysStr = existingKeys.length > 0
        ? existingKeys.join("、")
        : "（まだ何も学習していない）";

    // 3. Geminiに「未知テーマ」と「鮮度切れ」の抽出を依頼
    const analysisPrompt = `
あなたはARS（自律型法律鑑定要塞）の斥候AIです。
以下の最新ニュース・記事を分析し、JSON形式で回答してください。

【ARSが現在持っている知識一覧】
${existingKeysStr}

【最新のWeb検索結果】
${searchSummary}

【指示】
1. 上記の記事から「法律・規制・コンプライアンス」に関するテーマを抽出する
2. ARSの知識一覧に「存在しない」新テーマを最大${MAX_NEW_TOPICS}件リストアップする
3. ARSの知識一覧に「存在するが、最新情報で更新が必要」なテーマと、その差分内容（gap）を最大2件リストアップする

【回答フォーマット（必ずJSONのみ返すこと）】
{
  "new_topics": ["テーマA", "テーマB"],
  "refresh_topics": [
    {"topic": "既存テーマ名", "gap": "追加すべき最新情報や新判例の要約"},
    {"topic": "既存テーマ名2", "gap": "追加すべき最新情報の要約"}
  ]
}
`.trim();

    const rawResponse = await callGemini(analysisPrompt);
    console.log("[Scout] Gemini raw response:", rawResponse);

    // 4. JSONをパース
    let analysis = { new_topics: [], refresh_topics: [] };
    try {
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            analysis = JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.error("[Scout] JSON parse error:", e);
    }

    // 5. 新テーマをキューに追加
    const newTopics = (analysis.new_topics || []).slice(0, MAX_NEW_TOPICS);
    if (newTopics.length > 0) {
        console.log(`[Scout] Adding ${newTopics.length} new topics to queue:`, newTopics);
        for (const topic of newTopics) {
            // スコアは現在時刻（Unix秒）。新しいほど優先度高
            await redis('zadd', 'ars_v12_queue', Date.now(), topic);
            console.log(`[Scout] ✅ Queued new topic: "${topic}"`);
        }
    } else {
        console.log("[Scout] No new topics found. Knowledge base is up to date.");
    }

    // 6. 差分更新が必要な既存テーマをキューに追加（差分情報付き）
    const refreshTopics = (analysis.refresh_topics || []).slice(0, 2);
    if (refreshTopics.length > 0) {
        console.log(`[Scout] ${refreshTopics.length} topics need refresh:`, refreshTopics.map(t => t.topic));
        for (const item of refreshTopics) {
            // 差分情報をRedisに一時保存（researcher.jsが読み込む）
            await redis('hset', 'ars_v12_refresh_gaps', item.topic, item.gap);
            // キューに追加（スコアをわずかに低く設定し、新テーマより後回しに）
            await redis('zadd', 'ars_v12_queue', Date.now() - 1000, `[REFRESH] ${item.topic}`);
            console.log(`[Scout] 🔄 Queued refresh for: "${item.topic}" | Gap: ${item.gap}`);
        }
    } else {
        console.log("[Scout] No refresh needed for existing topics.");
    }

    // 7. スカウトログをRedisに記録
    const log = {
        timestamp: startTime,
        query: searchQuery,
        new_topics: newTopics,
        refresh_topics: refreshTopics.map(t => t.topic)
    };
    await redis('lpush', 'ars_scout_log', JSON.stringify(log));
    await redis('ltrim', 'ars_scout_log', 0, 49); // 直近50件のみ保持

    console.log("[Scout] === Scout Mission Complete ===");
    console.log(`[Scout] Summary: +${newTopics.length} new, ${refreshTopics.length} refresh queued.`);
}

main().catch(e => {
    console.error("[Scout] FATAL ERROR:", e);
    process.exit(1);
});
