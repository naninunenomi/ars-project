/**
 * ARS Autopilot - v10.1 (Robust Edition)
 */

// Redis Helper (Direct Fetch)
const redis = async (command, ...args) => {
    // 優先順位: 1.環境変数 2.ハードコード(救済用)
    let url = process.env.KV_REST_API_URL || "https://pretty-llama-117521.upstash.io";
    let token = process.env.KV_REST_API_TOKEN || "gQAAAAAAAcsRAAIgcDIzMTUxOGQzNmY5Yzg0ZjE1YTA0OWE4YWRmNzc2N2E3NQ";

    const res = await fetch(`${url}/${command}/${args.join('/')}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    return data.result;
};

module.exports = async (req, res) => {
    const startTime = Date.now();
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
        const lastRun = await redis('get', 'ars_autopilot_last_run');
        if (lastRun && (startTime - Number(lastRun) < 10000)) {
            return res.json({ status: 'RESTING' });
        }
        await redis('set', 'ars_autopilot_last_run', startTime.toString());

        const marketSignal = await checkMarketSignal();
        const cycleStart = await redis('get', 'ars_maint_cycle_start');
        const DAY_MS = 24 * 60 * 60 * 1000;
        
        if (!cycleStart || (startTime - Number(cycleStart) > DAY_MS)) {
            await redis('set', 'ars_maint_cycle_start', startTime.toString());
            await redis('del', 'ars_maint_checked_items');
        }

        const allKnowledgeKeys = await redis('hkeys', 'ars_knowledge_base') || [];
        const checkedItems = await redis('smembers', 'ars_maint_checked_items') || [];
        const targetForMaint = allKnowledgeKeys.find(key => !checkedItems.includes(key));

        if (targetForMaint) {
            await redis('sadd', 'ars_maint_checked_items', targetForMaint);
            return res.json({ mode: 'MAINTENANCE', topic: targetForMaint, marketSignal });
        }

        let activeTopic = await redis('get', 'ars_active_research_topic');
        if (!activeTopic) {
            activeTopic = await redis('lpop', 'ars_learning_queue');
            if (activeTopic) await redis('set', 'ars_active_research_topic', activeTopic);
        }

        if (activeTopic) {
            await redis('hset', 'ars_knowledge_base', activeTopic, `鑑定基準: [AI学習済み: ${new Date().toLocaleDateString()}]`);
            await redis('del', 'ars_active_research_topic');
            return res.json({ mode: 'LEARNING', topic: activeTopic, marketSignal });
        }

        return res.json({ mode: 'IDLE', marketSignal });

    } catch (error) {
        return res.json({ status: 'ERROR', message: error.message });
    }
};

async function checkMarketSignal() {
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: "ARS市場監視員として、現在のAI広告法規制の動きを15文字以内で一言で。" }] }] })
        });
        const data = await res.json();
        return data.candidates[0].content.parts[0].text.trim();
    } catch { return "Market stable."; }
}
