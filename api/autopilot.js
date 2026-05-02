/**
 * ARS Auto-Pilot Simulator API
 * 自律的に需要（広告やトレンド）を模倣し、鑑定所へ流し込む
 */

const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // オートパイロットがONの場合のみ動作
    const isAutoPilotOn = await kv.get('ars_autopilot_status');
    if (!isAutoPilotOn && req.method !== 'POST') {
        return res.status(200).json({ status: 'OFF', message: 'Auto-Pilot is currently disabled.' });
    }

    try {
        // シミュレートする広告フレーズのリスト
        const scenarios = [
            "スマホでポチポチするだけで月収100万円確定！未経験でも100%稼げます。",
            "このサプリを飲むだけで1週間で10kg減！食事制限一切なしの奇跡の成分。",
            "最新のAIが自動でビットコインを増やし続けます。元本保証でリスクゼロ。",
            "著作権フリーの画像を自動生成して、そのまま販売して不労所得。今すぐ登録！",
            "たった3回の施術でシミが完全に消える。厚生労働省も認めた最新技術。",
            "誰でも簡単に芸能人と繋がれる秘密のSNS。期間限定で入会金無料。"
        ];

        const text = scenarios[Math.floor(Math.random() * scenarios.length)];
        
        // 自分自身の鑑定APIを叩く
        const baseUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
        const checkRes = await fetch(`${baseUrl}/api/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, mode: 'autonomous' })
        });

        const result = await checkRes.json();

        return res.status(200).json({
            status: 'ACTIVE',
            discoveredDemand: text,
            result: result
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
