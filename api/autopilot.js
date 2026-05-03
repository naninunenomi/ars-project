/**
 * ARS Auto-Pilot Simulator API - v5.7 (Profit Priority)
 * 取引記録を最優先し、学習機能の遅延に左右されないように設計
 */

const { kv } = require('@vercel/kv');
const crypto = require('crypto');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    try {
        const isAutoPilotOn = await kv.get('ars_autopilot_status');
        if (!isAutoPilotOn && req.method !== 'POST') {
            return res.status(200).json({ status: 'OFF' });
        }

        const scenarios = [
            { text: "月収100万確定！秘密のツール無料配布中。", theme: "情報商材" },
            { text: "飲むだけで1週間で10kg減。リバウンドなし。", theme: "薬機法" },
            { text: "最新AIがビットコインを増やし続けます。元本保証。", theme: "金融商品取引法" },
            { text: "たった3回でシミが完全に消える最新技術。", theme: "景表法" },
            { text: "著作権フリー画像を自動生成して販売。不労所得確定！", theme: "著作権法" }
        ];

        const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
        const price = (0.5 + Math.random() * 0.7).toFixed(2);
        const revenue = parseFloat(price);
        const date = new Date().toISOString().split('T')[0];

        // --- PROFIT RECORDING (CRITICAL) ---
        // 失敗してもリトライするか、確実に実行されるように順番を前に持ってくる
        await Promise.all([
            kv.hincrbyfloat(`ars_daily_stats:${date}`, 'revenue', revenue),
            kv.hincrby(`ars_daily_stats:${date}`, 'transactions', 1),
            kv.incrbyfloat('ars_total_revenue', revenue),
            kv.incrby('ars_total_transactions', 1)
        ]);
        
        const log = { 
            timestamp: new Date().toISOString(), 
            amount: price, 
            source: 'AUTOPILOT_AUTO_TRX',
            verdict: Math.random() > 0.4 ? 'RISKY' : 'SAFE',
            theme: scenario.theme
        };
        await kv.lpush('ars_transactions', JSON.stringify(log));
        await kv.ltrim('ars_transactions', 0, 49);

        // --- ASYNC LEARNING TRIGGER (NON-BLOCKING) ---
        const baseUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
        // 非同期で実行し、親のレスポンスをブロックしない
        const learningTrigger = async () => {
            try {
                const knowledge = await kv.hget('ars_knowledge_base', scenario.theme);
                if (!knowledge) {
                    await kv.lpush('ars_learning_history', JSON.stringify({
                        timestamp: new Date().toISOString(),
                        theme: scenario.theme,
                        summary: "New Demand. Starting deep learning...",
                        isTrigger: true
                    }));
                    await fetch(`${baseUrl}/api/learn`, { 
                        method: 'POST', 
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ theme: scenario.theme }) 
                    });
                }
            } catch (e) { console.error("Learning Trigger Failed", e); }
        };
        learningTrigger(); // Fire and forget

        return res.status(200).json({ success: true, text: scenario.text, price: price });

    } catch (error) {
        console.error("Autopilot Engine Fatal Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
