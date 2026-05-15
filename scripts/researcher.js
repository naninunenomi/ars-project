/**
 * ARS Researcher Script - v14.8 (Intelligence Diagnostic)
 * Geminiからの回答が「白紙」になる原因を特定するため、レスポンスを完全可視化。
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
    if (!key) throw new Error("GEMINI_API_KEY is missing in GitHub Secrets.");
    const tools = useGrounding ? [{ googleSearchRetrieval: {} }] : [];
    
    console.log(`[Gemini] Calling ${MODEL_NAME} (Grounding: ${useGrounding})...`);
    
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            tools: tools
        })
    });
    
    const data = await res.json();
    
    // 【詳細ログ】白紙回答の原因を特定する
    if (!data.candidates || data.candidates.length === 0) {
        console.error("[Gemini ERROR] No candidates returned. Full Response:", JSON.stringify(data));
        return "";
    }
    
    const text = data.candidates[0].content?.parts?.[0]?.text || "";
    if (!text) {
        console.warn("[Gemini WARNING] Candidate exists but text is empty. FinishReason:", data.candidates[0].finishReason);
        console.warn("Full Candidate Info:", JSON.stringify(data.candidates[0]));
    }
    
    return text;
};

async function main() {
    console.log("ARS Researcher starting (v14.8)...");
    try {
        const queue = await redis('zrevrange', 'ars_v12_queue', 0, 0);
        if (queue && queue.length > 0) {
            const topic = queue[0];
            console.log(`Target topic: ${topic}`);
            
            const researchPrompt = `テーマ「${topic}」について、世界最高峰の法学者、規制当局、およびコンプライアンス責任者のコンソーシアムとして、極限まで詳細かつ多層的な法的・倫理的分析を実施し、産業グレードのリファレンスマニュアルを作成せよ。
分析は以下の「6つの層」で徹底的に行うこと：
1. 民法・消費者契約法上の責任
2. 刑法（詐欺等）および行政罰の対象範囲
3. 該当分野の特別法（金商法、薬機法、景表法等）の詳細な解釈
4. 業界団体による自主規制・ガイドラインの網羅
5. 過去10年の重要判例とグレーゾーンの徹底分析
6. 今後5年以内に予想される規制動向と、それに対する「要塞としての防御策」

指示：
- 決して要約するな。人間が数日がかりで読み込み、理解しきれないほどの圧倒的な情報密度と詳細さを提供せよ。
- あらゆるエッジケース（例外事例）を列挙し、その法的リスクを詳細に論じよ。
- 「なぜその表現が危険なのか」を、科学的・法的根拠に基づき、深淵なレベルで記述せよ。
- あなたの知能の限界まで情報を凝縮・拡張し、このテーマに関する世界で唯一の、そして究極のバイブルを完成させよ。`;
            const knowledge = await callGemini(researchPrompt, false);
            
            if (knowledge && knowledge.length > 100) {
                console.log(`Generated knowledge length: ${knowledge.length}`);
                await redis('hset', 'ars_v12_knowledge', topic, knowledge);
                await redis('zrem', 'ars_v12_queue', topic);
                console.log(`Successfully archived knowledge for: ${topic}`);
            } else {
                console.error(`[CRITICAL] Research failed or knowledge too short (${knowledge.length} chars). Not saving.`);
                process.exit(1); // 失敗として終了させる
            }
        } else {
            console.log("No work found in queue.");
        }
    } catch (error) {
        console.error("CRITICAL ERROR:", error);
        process.exit(1);
    }
}

main();
