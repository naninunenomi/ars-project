/**
 * ARS Researcher Script - v14.7 (Clean URL Edition)
 * URLの末尾スラッシュ問題を解決し、確実な配送を実現。
 */

const MODEL_NAME = "gemini-2.0-flash";

const redis = async (command, ...args) => {
    const rawUrl = (process.env.KV_REST_API_URL || "https://pretty-llama-117521.upstash.io").trim();
    const token = (process.env.KV_REST_API_TOKEN || "gQAAAAAAAcsRAAIgcDIzMTUxOGQzNmY5Yzg0ZjE1YTA0OWE4YWRmNzc2N2E3NQ").trim();
    
    // スラッシュを排除
    const cleanUrl = rawUrl.replace(/\/$/, "");
    
    console.log(`[Redis Command] ${command} ${args[0] || ""}...`);
    
    const res = await fetch(cleanUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify([command, ...args])
    });
    const data = await res.json();
    console.log(`[Redis Response]`, data);
    return data.result;
};

const callGemini = async (prompt, useGrounding = false) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is missing in GitHub Secrets.");
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

async function main() {
    console.log("ARS Researcher starting (v14.7)...");
    try {
        const queue = await redis('zrevrange', 'ars_v12_queue', 0, 0);
        console.log("Queue result:", queue);

        if (queue && queue.length > 0) {
            const topic = queue[0];
            console.log(`Target topic: ${topic}`);
            
            const researchPrompt = `「${topic}」について、最新の法規制、事例、リスク、および信頼されるための具体的表現案を徹底的に調査し、専門的なマニュアルを作成してください。情報は網羅的かつ詳細に記載すること。`;
            const knowledge = await callGemini(researchPrompt, true);
            
            console.log(`Generated knowledge length: ${knowledge.length}`);

            const hsetRes = await redis('hset', 'ars_v12_knowledge', topic, knowledge);
            console.log("HSET Result:", hsetRes);
            
            const zremRes = await redis('zrem', 'ars_v12_queue', topic);
            console.log("ZREM Result:", zremRes);
            
            console.log(`Successfully archived knowledge for: ${topic}`);
        } else {
            console.log("No work found in queue.");
        }
    } catch (error) {
        console.error("CRITICAL ERROR:", error);
        process.exit(1);
    }
}

main();
