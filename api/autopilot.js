/**
 * ARS Auto-Pilot Simulator API - v5.8 (Indestructible Mode)
 * エラー要因（内部fetch等）を完全に排除し、確実に数値を刻むことに特化
 */

const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
    // CORS対応
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // ステータスチェック（スイッチがONであることを確認）
        const isAutoPilotOn = await kv.get('ars_autopilot_status');
        if (!isAutoPilotOn && req.method !== 'POST') {
            return res.status(200).json({ status: 'IDLE' });
        }

        // 需要シナリオの定義
        const scenarios = [
            { text: "月収100万確定ツールの無料配布", theme: "情報商材" },
            { text: "飲むだけで10kg痩せるサプリメント", theme: "薬機法" },
            { text: "AIビットコイン運用、元本保証100%", theme: "金融商品取引法" },
            { text: "著作権フリー画像を自動生成して稼ぐ", theme: "著作権法" },
            { text: "不動産投資で自己資金ゼロ、将来安泰", theme: "不動産表示規約" }
        ];

        const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
        const price = (0.5 + Math.random() * 0.7).toFixed(2);
        const revenue = parseFloat(price);
        const date = new Date().toISOString().split('T')[0];

        // --- ATOMIC KV UPDATES ---
        // 外部fetchを一切使わず、KVへの直接書き込みのみで完結させる
        await kv.hincrbyfloat(`ars_daily_stats:${date}`, 'revenue', revenue);
        await kv.hincrby(`ars_daily_stats:${date}`, 'transactions', 1);
        await kv.incrbyfloat('ars_total_revenue', revenue);
        await kv.incrby('ars_total_transactions', 1);
        
        // 取引ログの記録
        const log = { 
            timestamp: new Date().toISOString(), 
            amount: price, 
            source: 'AUTO_ENGINE',
            verdict: Math.random() > 0.4 ? 'RISKY' : 'SAFE',
            theme: scenario.theme
        };
        await kv.lpush('ars_transactions', JSON.stringify(log));
        await kv.ltrim('ars_transactions', 0, 49);

        // 学習トリガーの記録（ここでもfetchを使わず、履歴に「需要あり」と書くだけにする）
        const knowledge = await kv.hget('ars_knowledge_base', scenario.theme);
        if (!knowledge) {
            await kv.lpush('ars_learning_history', JSON.stringify({
                timestamp: new Date().toISOString(),
                theme: scenario.theme,
                summary: "Autonomous detection: New market demand identified. Ready for boardroom analysis.",
                isTrigger: true
            }));
            await kv.ltrim('ars_learning_history', 0, 49);
        }

        // いかなる場合も200を返し、フロントエンドを止めない
        return res.status(200).json({ 
            success: true, 
            status: 'ACTIVE', 
            transaction: log 
        });

    } catch (error) {
        console.error("CRITICAL AUTO-PILOT ERROR:", error);
        // エラー時でもレスポンスを返し、フロントエンドのポーリングを継続させる
        return res.status(200).json({ success: false, error: "Atomic sync failed but engine remains alive" });
    }
};
