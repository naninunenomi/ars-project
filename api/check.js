/**
 * ARS API Handler - Vercel Serverless Function
 * 景表法・ステマ判定API
 */

module.exports = async (req, res) => {
    // CORS対応（他のエージェントがどこからでも呼べるようにする）
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { text, priceInfo, agentId } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'Missing "text" in request body' });
    }

    // 判定ロジック（ARS Elite v1.2相当）
    let riskScore = 0;
    let findings = [];
    const labels = ["PR", "広告", "宣伝", "提供", "Promotion"];

    // 1. ステマチェック
    if (!labels.some(l => text.includes(l))) {
        riskScore += 50;
        findings.push("- [ステマ]: 広告表記(PR等)が不明瞭です。");
    }

    // 2. 二重価格チェック（簡易版）
    if (priceInfo && priceInfo.original) {
        if (priceInfo.durationInWeeks && priceInfo.durationInWeeks < 4) {
            riskScore += 40;
            findings.push("- [価格]: 8週間ルールを満たさない有利誤認のリスクがあります。");
        }
    }

    // レスポンス返却（1円決済シミュレーションを含む）
    res.status(200).json({
        service: "ARS Legal Audit Box",
        version: "1.2",
        status: "success",
        verdict: riskScore > 60 ? "CRITICAL" : riskScore > 20 ? "WARNING" : "SAFE",
        riskScore: riskScore,
        details: findings,
        billing: {
            amount: "1 JPY",
            currency: "JPY",
            status: "simulated-confirmed"
        },
        timestamp: new Date().toISOString()
    });
};
