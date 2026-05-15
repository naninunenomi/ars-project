/**
 * ARS Researcher Script - v14.8 (Intelligence Diagnostic)
 * Geminiからの回答が「白紙」になる原因を特定するため、レスポンスを完全可視化。
 */

const MODEL_NAME = "gemini-3.1-flash";

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
            
            const researchPrompt = `「${topic}」について、最新の法規制、事例、リスク、および信頼されるための具体的表現案を徹底的に調査し、専門的なマニュアルを作成してください。情報は網羅的かつ詳細に記載すること。`;
            const knowledge = await callGemini(researchPrompt, true);
            
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
