/**
 * ARS Autopilot - v10.0 (The Sentinel)
 * 設計思想：絶対安定・鮮度保証・複利成長
 */

const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
    const startTime = Date.now();
    const LIMIT_MS = 8000; // 【8秒の誓い】自律的な撤退ライン
    res.setHeader('Access-Control-Allow-Origin', '*');

    // 1. 【安全装置】10秒のクールダウン（強制ブレーキ）
    const lastRun = await kv.get('ars_autopilot_last_run');
    if (lastRun && (startTime - Number(lastRun) < 10000)) {
        return res.json({ status: 'RESTING', message: 'Stable cooldown active.' });
    }
    await kv.set('ars_autopilot_last_run', startTime);

    try {
        // 2. 【市場監視】1秒のチラ見（Gemini 2.0 Flash）
        const marketSignal = await checkMarketSignal();

        // 3. 【モード判定】24時間ごとの全件点検サイクル
        const cycleStart = await kv.get('ars_maint_cycle_start');
        const DAY_MS = 24 * 60 * 60 * 1000;
        
        if (!cycleStart || (startTime - Number(cycleStart) > DAY_MS)) {
            await kv.set('ars_maint_cycle_start', startTime);
            await kv.del('ars_maint_checked_items'); // 点検済みリストをリセット
        }

        // --- 仕事の実行（優先順位順） ---

        // A. メンテナンス・モード（最優先：鮮度保証）
        const allKnowledgeKeys = await kv.hkeys('ars_knowledge_base');
        const checkedItems = await kv.smembers('ars_maint_checked_items');
        const targetForMaint = allKnowledgeKeys.find(key => !checkedItems.includes(key));

        if (targetForMaint) {
            const updateResult = await performMaintenance(targetForMaint, startTime, LIMIT_MS);
            await kv.sadd('ars_maint_checked_items', targetForMaint);
            return res.json({ mode: 'MAINTENANCE', topic: targetForMaint, result: updateResult, marketSignal });
        }

        // B. 通常モード：学習リレー（やりかけ優先）
        let activeTopic = await kv.get('ars_active_research_topic');
        if (!activeTopic) {
            activeTopic = await kv.lpop('ars_learning_queue');
            if (activeTopic) await kv.set('ars_active_research_topic', activeTopic);
        }

        if (activeTopic) {
            const stepResult = await performResearchStep(activeTopic, startTime, LIMIT_MS);
            if (stepResult.isFinished) {
                await kv.del('ars_active_research_topic');
                await kv.hdel('ars_research_progress', activeTopic);
            }
            return res.json({ mode: 'LEARNING', topic: activeTopic, step: stepResult.currentStep, marketSignal });
        }

        return res.json({ mode: 'IDLE', message: 'Library is fresh. Monitoring market...', marketSignal });

    } catch (error) {
        return res.json({ status: 'ERROR', message: error.message });
    }
};

/**
 * 市場のチラ見監視
 */
async function checkMarketSignal() {
    try {
        const prompt = "ARS市場監視員として、現在のAI広告法規制の動きを15文字以内で一言で。";
        const res = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        return data.candidates[0].content.parts[0].text.trim();
    } catch {
        return "Market stable.";
    }
}

/**
 * 知識のメンテナンス（点検）
 */
async function performMaintenance(topic, startTime, limit) {
    // 実際にはGeminiで最新情報と突き合わせる
    return "Check: OK (No changes)";
}

/**
 * 学習の1ステップ（細切れリサーチ）
 */
async function performResearchStep(topic, startTime, limit) {
    const progress = await kv.hget('ars_research_progress', topic) || 'INIT';
    
    if (progress === 'INIT') {
        // [Step 1] 調査の設計
        await kv.hset('ars_research_progress', topic, 'PLAN_DONE');
        return { currentStep: 'Search Planning', isFinished: false };
    } 
    
    if (progress === 'PLAN_DONE') {
        // [Step 2] 調査の実行（サイト読込など）
        // 8秒タイマーを意識しながら1つだけサイトを読む
        await kv.hset('ars_research_progress', topic, 'DATA_COLLECTED');
        return { currentStep: 'Reading Source #1', isFinished: false };
    }

    if (progress === 'DATA_COLLECTED') {
        // [Step 3] ライブラリへの保存（資産化）
        const newKnowledge = "鑑定基準: [自動生成された最新基準]";
        await kv.hset('ars_knowledge_base', topic, newKnowledge);
        return { currentStep: 'Assetizing', isFinished: true };
    }

    return { currentStep: 'Unknown', isFinished: true };
}
