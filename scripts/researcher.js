/**
 * ARS Researcher Script - v14.3 (Large Data Edition)
 * 巨大なマニュアルを確実にRedisへ保存するため、POST方式を採用。
 */

const MODEL_NAME = "gemini-2.0-flash";

// Redis Helper (POST対応版)
const redis = async (command, ...args) => {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error("Redis Env Vars missing.");

    // POST方式で巨大なデータを安全に送信
    const res = await fetch(`${url}/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify([command, ...args])
    });
    const data = await res.json();
    return data.result;
};

// Gemini API Helper
const callGemini = async (prompt, useGrounding = false) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY missing.");
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
    console.log("ARS Researcher starting (v14.3)...");
    try {
        const queue = await redis('zrevrange', 'ars_v12_queue', 0, 0);
        if (queue && queue.length > 0) {
            const topic = queue[0];
            console.log(`Working on demand: ${topic}`);
            
            const researchPrompt = `「${topic}」について、最新の法規制、事例、リスク、および信頼されるための具体的表現案を徹底的に調査し、専門的なマニュアルを作成してください。情報は網羅的かつ詳細に記載すること。`;
            const knowledge = await callGemini(researchPrompt, true);
            
            // 巨大なマニュアルを確実に保存
            await redis('hset', 'ars_v12_knowledge', topic, knowledge);
            await redis('zrem', 'ars_v12_queue', topic);
            console.log(`Knowledge saved for: ${topic}`);
        } else {
            console.log("No active demand.");
        }
    } catch (error) {
        console.error("Researcher Error:", error);
        process.exit(1);
    }
}

main();
