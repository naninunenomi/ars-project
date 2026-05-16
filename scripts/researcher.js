/**
 * ARS Researcher Script - v16.0 (Adaptive Self-Growing Engine)
 * 差分リサーチ（Incremental Research）に対応。
 * 既存の知識をベースに、不足している論点（Gap）だけをピンポイントで深掘りし、マニュアルを自己増殖させる。
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

const callGemini = async (prompt, useGrounding = false) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is missing.");
    const tools = useGrounding ? [{ googleSearchRetrieval: {} }] : [];
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools })
    });
    const data = await res.json();
    if (!data.candidates) {
        console.error("[Gemini ERROR]", JSON.stringify(data));
        return "";
    }
    return data.candidates[0].content?.parts?.[0]?.text || "";
};

async function main() {
    console.log("ARS Researcher starting (v16.0 - Adaptive Mode)...");
    try {
        const gap = process.env.ARS_GAP;
        const targetTopic = process.env.ARS_TOPIC;
        
        let topic = "";
        let existingManual = "";
        let isIncremental = false;

        // 差分リサーチモードの判定
        if (gap && targetTopic) {
            topic = targetTopic;
            existingManual = await redis('hget', 'ars_v12_knowledge', topic) || "";
            isIncremental = true;
            console.log(`[Incremental Mode] Topic: ${topic}, Gap: ${gap}`);
        } else {
            // 通常のリサーチ（キューから取得）
            const queue = await redis('zrevrange', 'ars_v12_queue', 0, 0);
            if (queue && queue.length > 0) {
                topic = queue[0];
                console.log(`[Standard Mode] Target topic: ${topic}`);
            }
        }

        if (!topic) {
            console.log("No work found.");
            return;
        }

        let researchPrompt = "";
        if (isIncremental) {
            researchPrompt = `あなたは法務コンプライアンスの専門家です。
現在、テーマ「${topic}」に関して以下の【既存マニュアル】がありますが、論点「${gap}」に関する情報が不足しています。

【既存マニュアル】
${existingManual.substring(0, 5000)}... (省略)

指示：
- 既存のマニュアルの内容と重複させず、「${gap}」という特定の論点に絞って、深淵かつ詳細な法的・倫理的分析を行え。
- この追記によって、マニュアルが「全知全能」に近づくように、妥協のない詳細さを提供せよ。
- 回答は、既存のマニュアルの末尾にそのまま追加できる形式（見出し等）で作成せよ。`;
        } else {
            researchPrompt = `テーマ「${topic}」について、世界最高峰の法学者として極限まで詳細な産業グレードのリファレンスマニュアルを作成せよ。
指示：
- 6つの層（民法、刑法、特別法、業界指針、判例、未来予測）で徹底分析せよ。
- 人間が数日がかりで読み込み、理解しきれないほどの圧倒的な情報密度を提供せよ。
- 要約は厳禁。全知全能のバイブルを完成させよ。`;
        }

        const newKnowledge = await callGemini(researchPrompt, false); // ※検索機能は現在制限中のためオフ

        if (newKnowledge && newKnowledge.length > 100) {
            const finalKnowledge = isIncremental 
                ? `${existingManual}\n\n---\n\n## 【自律拡張：${new Date().toISOString()}】\n### 追加論点：${gap}\n${newKnowledge}`
                : newKnowledge;

            console.log(`Generated knowledge length: ${newKnowledge.length}. Total length: ${finalKnowledge.length}`);
            await redis('hset', 'ars_v12_knowledge', topic, finalKnowledge);
            
            if (!isIncremental) {
                await redis('zrem', 'ars_v12_queue', topic);
            }
            console.log(`Successfully updated knowledge for: ${topic}`);
        } else {
            console.error("[CRITICAL] Research resulted in empty or too short response.");
            process.exit(1);
        }
    } catch (error) {
        console.error("CRITICAL ERROR:", error);
        process.exit(1);
    }
}

main();
