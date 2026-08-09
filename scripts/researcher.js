/**
 * ARS Researcher Script - v16.4 (Stabilized Self-Growing Engine)
 * リサーチ中の重複実行を防ぐ「STUDYING」ロック機能を搭載。
 * 憲章第6.1条（低コスト）に基づき、GitHub Actionsの無料枠を鉄壁防衛する。
 */

const MODEL_NAME = "gemini-2.5-flash";

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
    if (!data.candidates) {
        console.error("[ARS] Gemini API Error Response:", JSON.stringify(data, null, 2));
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
};

// 一次資料を優先する公式ドメイン（消費者庁/厚労省/金融庁/個人情報保護委員会/e-Gov法令/裁判所/警察庁/デジタル庁）
const OFFICIAL_DOMAINS = [
    "caa.go.jp", "mhlw.go.jp", "fsa.go.jp", "ppc.go.jp",
    "elaws.e-gov.go.jp", "e-gov.go.jp", "courts.go.jp", "npa.go.jp", "digital.go.jp"
];

// includeDomains を渡すと、その公式ドメインに限定して検索（＝一次資料ベース学習）。
// 公式で結果が得られない場合は、呼び出し側で一般Web検索にフォールバックする。
const callTavily = async (query, includeDomains = null) => {
    const key = process.env.TAVILY_API_KEY;
    if (!key) return null;
    try {
        // include_raw_content: 各結果の本文全体を取得（TavilyがPDFも解析して本文テキストを返す）
        const body = { api_key: key, query, search_depth: "advanced", max_results: 5, include_raw_content: true };
        if (includeDomains && includeDomains.length) body.include_domains = includeDomains;
        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await res.json();
    } catch (e) {
        console.error("[Tavily ERROR]", e);
        return null;
    }
};

// 検索結果を学習用テキストに整形。raw_content（PDF含む本文）があれば優先し、長すぎる分は切る。
const formatSources = (results) => (results || []).map(r => {
    const bodyText = (r.raw_content || r.content || "").substring(0, 3500);
    return `- ${r.title}（${r.url}）\n${bodyText}`;
}).join("\n\n");

// 【PDF直読み】PDFを直接DLし、Geminiのマルチモーダル解析で本文テキスト化する（Tavilyが解析しきれないPDF対策）。
// npmライブラリ不要。失敗は全て握りつぶして空文字を返し、学習を絶対に止めない。15MB超はスキップ。
const extractPdfViaGemini = async (url) => {
    try {
        if (!/\.pdf($|\?)/i.test(url)) return "";
        const res = await fetch(url);
        if (!res.ok) return "";
        const ct = res.headers.get('content-type') || "";
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 15 * 1024 * 1024) return "";           // 15MB超はスキップ
        if (!/pdf/i.test(ct) && !/\.pdf/i.test(url)) return ""; // 実体がPDFでなければスキップ
        const base64 = buf.toString('base64');
        const key = process.env.GEMINI_API_KEY;
        const gres = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [
                    { text: "この公式PDFから、日本の広告・表示規制に関する重要なルール・条文・ガイドライン・違反基準・判断要素を、漏れなく箇条書きで抽出せよ。本文に無い内容は補わない。" },
                    { inline_data: { mime_type: "application/pdf", data: base64 } }
                ]}]
            })
        });
        const gdata = await gres.json();
        return gdata.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (e) {
        console.error("[PDF Extract ERROR]", url, e.message);
        return "";
    }
};

// 検索結果のうち公式PDFを最大max件、直接DL＆Gemini解析して本文を得る（無料枠保護で既定1件）。
const extractPdfsFromResults = async (results, max = 1) => {
    const pdfs = (results || []).filter(r => /\.pdf($|\?)/i.test(r.url || "")).slice(0, max);
    let out = "";
    for (const r of pdfs) {
        const text = await extractPdfViaGemini(r.url);
        if (text && text.length > 50) {
            out += `\n\n【PDF直読み: ${r.title}（${r.url}）】\n${text.substring(0, 4000)}`;
        }
    }
    return out;
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

/**
 * 【2026-07 追加】鮮度更新（Freshness Refresh）
 * 実際に判定で使う"前線8棚"(ars_v12_frontline)のうち、最終確認日(ars_v12_verified_at)が
 * 最も古い1棚を選び、最新の法改正を反映して更新する。憲章「最も新鮮な鑑定」を実装で担保する。
 * 無料枠保護のため1起動につき1棚のみ。上書きせず"追記"方式で既存を絶対に失わない。
 * まず変更の有無を判定し、変更がある時だけ日付つきで追記。無ければ確認日のみ更新する。
 */
async function performFreshnessRefresh() {
    const frontline = await redis('lrange', 'ars_v12_frontline', 0, -1) || [];
    if (!frontline || frontline.length === 0) {
        console.log("[Freshness] 前線棚リスト(ars_v12_frontline)が空のためスキップ。");
        return false;
    }

    // 最終確認日が最も古い（または未確認の）棚を選ぶ
    let target = null, oldestTime = Infinity;
    for (const t of frontline) {
        const v = await redis('hget', 'ars_v12_verified_at', t);
        const time = v ? Date.parse(v) : 0; // 未確認は最古(=0)扱いで最優先
        if (time < oldestTime) { oldestTime = time; target = t; }
    }
    if (!target) return false;

    console.log(`[Freshness] 最古の棚を再検証: ${target}`);
    const existingManual = await redis('hget', 'ars_v12_knowledge', target) || "";

    let searchData = await callTavily(`${target} 法改正 ガイドライン改正 措置命令 2026`, OFFICIAL_DOMAINS);
    if (!searchData || !searchData.results || searchData.results.length === 0) {
        searchData = await callTavily(`${target} 法改正 新ガイドライン 違反事例 2026 最新`); // フォールバック：一般Web
    }
    let searchContext = "";
    if (searchData && searchData.results) {
        searchContext = "\n【最新の一次資料（本文抜粋・PDF含む）】\n" + formatSources(searchData.results);
        searchContext += await extractPdfsFromResults(searchData.results, 1); // 鮮度更新はPDF最大1件を直読み
    }

    // まず「既存マニュアルに未反映の重要な変更があるか」を判定させる（あるときだけ追記＝無料枠を無駄打ちしない）
    const prompt = `あなたは法令の鮮度チェック担当AIです。テーマ「${target}」について、既存マニュアルの記述と最新情報を比較してください。
既存マニュアルに【未反映の重要な変更】（法改正・新ガイドライン・新しい違反事例・運用変更）がある場合のみ changed=true とし、その変更点を簡潔にまとめてください。
既存の焼き直し・些末な言い換え・単なる具体例追加は changed=false としてください。
出力は純粋なJSONオブジェクト単体のみ（マークダウン囲み禁止）:
{ "changed": true/false, "summary": "changed=trueのときのみ。既存のどの記述がどう変わったかを含めた変更点の要約" }
${searchContext}
【既存マニュアル(冒頭)】
${existingManual.substring(0, 4000)}`;

    const raw = await callGemini(prompt);
    let result = { changed: false, summary: "" };
    try {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) result = JSON.parse(m[0]);
    } catch (e) {
        console.error("[Freshness] 判定JSONの解析に失敗。安全側=変更なし扱い。");
    }

    if (result.changed && result.summary && result.summary.length > 10) {
        // ★上書きせず"追記"：既存マニュアルは絶対に失わない（既存の差分リサーチと同じ方式）
        const today = new Date().toISOString().split('T')[0];
        let addend = `\n\n---\n## 【鮮度更新 ${today}】\n${result.summary}`;
        if (searchData && searchData.results) {
            addend += "\n【出典】\n" + searchData.results.map(r => `- ${r.url}`).join("\n");
        }
        const finalKnowledge = existingManual + addend;
        await redis('hset', 'ars_v12_knowledge', target, finalKnowledge);
        const checklist = await callGemini(`以下を300文字の高速鑑定用チェックリストに要約せよ。\n${finalKnowledge.substring(0, 5000)}`);
        if (checklist) await redis('hset', 'ars_v12_checklist', target, checklist);
        console.log(`[Freshness] ✅ 変更を追記＆確認: ${target}`);
    } else {
        console.log(`[Freshness] 変更なし。確認日のみ更新: ${target}`);
    }

    // 変更の有無に関わらず確認日は更新（次の起動では別の棚が最古になり、8棚を順に巡回する）
    await redis('hset', 'ars_v12_verified_at', target, new Date().toISOString());
    return true;
}

async function main() {
    let isIncrementalRun = false;
    let hasScoutedThisRun = false; // 無限スカウト（暴走）を防ぐためのフラグ
    let hasRefreshedThisRun = false; // 1起動につき鮮度更新は1回だけ
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

                // 【2026-07 改修】アイドル時は既存"前線8棚"の鮮度更新を最優先（1起動1回）。
                // 新テーマのスカウトは棚が十分揃ったため当面停止（無料枠を鮮度に集中・棚の乱立防止）。
                // ※再開したい場合は下のperformScout()ブロックのコメントを外す。
                if (!hasRefreshedThisRun) {
                    hasRefreshedThisRun = true;
                    await performFreshnessRefresh();
                }

                // if (!hasScoutedThisRun) {
                //     hasScoutedThisRun = true;
                //     const scoutFoundWork = await performScout();
                //     if (scoutFoundWork) continue;
                // }

                console.log("[ARS] Idle work done (freshness pass). Exiting loop.");
                break;
            }
            
            // --- ロック開始 ---
            await redis('hset', 'ars_v12_status', topic, 'STUDYING');
            console.log(`[ARS] Research started for: ${topic}`);

            // --- 外部検索フェーズ（一次資料＝公式ドメイン優先→無ければ一般Webにフォールバック） ---
            let searchContext = "";
            const searchQuery = isIncremental ? `${topic} ${gap} 規制 ガイドライン 2026` : `${topic} ガイドライン 法令 措置命令 2026`;
            let searchData = await callTavily(searchQuery, OFFICIAL_DOMAINS);
            if (!searchData || !searchData.results || searchData.results.length === 0) {
                searchData = await callTavily(searchQuery); // フォールバック：一般Web
            }
            if (searchData && searchData.results) {
                searchContext = "\n【参照した一次資料（本文抜粋・PDF含む）】\n" + formatSources(searchData.results);
                searchContext += await extractPdfsFromResults(searchData.results, 2); // 新規学習はPDF最大2件を直読み
            }

            // --- リサーチフェーズ（一次資料に基づく／推測禁止／出典明記） ---
            const SOURCE_RULE = `\n【厳守ルール】上記の一次資料・検索結果に基づいて記述し、参照した条文・ガイドライン名・URLを本文中に明記せよ。資料で確認できない内容は推測で補わず「未確認（要一次資料確認）」と正直に記せ。`;
            let prompt = isIncremental
                ? `テーマ「${topic}」の既存マニュアルに、不足論点「${gap}」を追記せよ。\n${searchContext}${SOURCE_RULE}\n【既存マニュアル】\n${existingManual.substring(0, 3000)}...\n最新事例を優先し、詳細な追記を行え。`
                : `テーマ「${topic}」について、日本の法令・公式ガイドラインに基づく詳細なリファレンスマニュアルを作成せよ。\n${searchContext}${SOURCE_RULE}\n2026年の最新の法改正・措置命令を反映し、違反コードと判定基準(SAFE/RISKY/DANGER)を含めよ。`;

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
            } else {
                console.error(`[ARS] Research failed or generated knowledge was too short. Removing from queue to prevent infinite loop.`);
                console.error(`[ARS] DEBUG: newKnowledge was:`, newKnowledge);
                if (!isIncremental) await redis('zrem', 'ars_v12_queue', topic);
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
