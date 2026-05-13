/**
 * ARS Researcher Script - v14.0 (GitHub Worker Edition)
 * 憲章第3条「自律研究員」：時間の制限なく深淵な知恵を紡ぎ出す。
 */

const MODEL_NAME = "gemini-2.0-flash";

// Redis Helper (Shared with Vercel)
const redis = async (command, ...args) => {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error("Redis Env Vars missing.");

    const encodedArgs = args.map(a => encodeURIComponent(a)).join('/');
    const res = await fetch(`${url}/${command}/${encodedArgs}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    return data.result;
};

// Gemini API Helper (with Deep Research)
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
    console.log("ARS Researcher starting...");
    
    try {
        // 1. 需要学習 (Demand-led Research)
        const queue = await redis('zrevrange', 'ars_v12_queue', 0, 0);
        if (queue && queue.length > 0) {
            const topic = queue[0];
            console.log(`Working on demand: ${topic}`);
            
            // 深層調査 (Time-unlimited)
            const researchPrompt = `「${topic}」について、最新の法規制、事例、リスク、および信頼されるための具体的表現案を徹底的に調査し、専門的なマニュアルを作成してください。情報は網羅的かつ詳細に記載すること。`;
            const knowledge = await callGemini(researchPrompt, true);
            
            // 図書館に保存
            await redis('hset', 'ars_v12_knowledge', topic, knowledge);
            await redis('zrem', 'ars_v12_queue', topic);
            console.log(`Knowledge saved for: ${topic}`);
            
        } else {
            console.log("No active demand. Checking maintenance...");
            // ここでメンテナンスやスカウティングを実装可能（憲章第3.2.2/3条）
        }

    } catch (error) {
        console.error("Researcher Error:", error);
        process.exit(1);
    }
}

main();
