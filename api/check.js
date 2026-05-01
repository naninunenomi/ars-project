/**
 * ARS API Handler - Persistence v1.5
 * 大量取引（バルク処理）に対応した高スケーリングモデル
 */

const restUrlKey = Object.keys(process.env).find(key => key.includes('_REST_API_URL'));
const restTokenKey = Object.keys(process.env).find(key => key.includes('_REST_API_TOKEN'));

if (restUrlKey && restTokenKey && !process.env.KV_REST_API_URL) {
    process.env.KV_REST_API_URL = process.env[restUrlKey];
    process.env.KV_REST_API_TOKEN = process.env[restTokenKey];
}
const { kv } = require('@vercel/kv'); 
const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    // --- Phase 9: AI-Wallet M2M 直接決済プロトコル ---
    const authHeader = req.headers.authorization;
    const txId = req.headers['x-payment-tx'];
    let payerType = "unknown";
    let currentBalance = 0;

    const { text, mode, priceInfo, count } = req.body;
    const trxCount = parseInt(count) || 1; 

    if (authHeader && authHeader.startsWith('Bearer ')) {
        // [Pattern A]: 既存のAPIキー認証（デバッグ用・テスト用）
        const apiKey = authHeader.split(' ')[1];
        const balance = await kv.get(`apikey:${apiKey}`);
        if (balance === null) return res.status(401).json({ error: 'Unauthorized: 無効なAPIキーです。' });
        currentBalance = parseInt(balance);
        if (currentBalance < trxCount) return res.status(402).json({ error: 'Payment Required: トークン残高不足です。' });
        
        currentBalance -= trxCount;
        await kv.set(`apikey:${apiKey}`, currentBalance);
        payerType = "Legacy API Key";
    } else if (txId) {
        // [Pattern B]: 真のM2M - 送金証明（TX ID）による直接決済
        const used = await kv.get(`ars_used_tx:${txId}`);
        if (used) return res.status(400).json({ error: 'Bad Request: この送金証明は既に使用されています。' });
        
        // 送金証明の検証（シミュレーション: 64文字の16進数）
        const isValidTx = /^[0-9a-fA-F]{64}$/.test(txId);
        if (!isValidTx) return res.status(400).json({ error: 'Bad Request: 無効な送金証明フォーマットです。' });

        await kv.set(`ars_used_tx:${txId}`, "used", { ex: 86400 });
        payerType = "M2M Direct (Wallet-to-Wallet)";
        currentBalance = "N/A (Direct Payment)";
    } else {
        // どちらもない場合は「AIへの支払い要求（Challenge）」を返す
        return res.status(402).json({
            error: "Payment Required",
            message: "ARS利用にはAIウォレットからの直接送金が必要です。",
            payment_protocol: "M2M-Direct-v1",
            instructions: {
                destination_wallet: "ARS_VAULT_SOL_71C...8fd", 
                amount: 1.0 * trxCount,
                currency: "ARS",
                required_header: "x-payment-tx",
                action: "上記アドレスへ送金後、TX Hashを x-payment-tx ヘッダーに添えて再送してください。"
            }
        });
    }
    // --- 関所通過 ---

    // 知識ベースの取得と動的判定ロジック
    let riskScore = 0;
    let findings = [];
    let auditLevel = mode || "standard";
    let isCached = false;

    if (!text) {
        return res.status(400).json({ error: 'Text is required' });
    }

    try {
        const textHash = crypto.createHash('md5').update(text).digest('hex');
        const cacheKey = `ars_cache:${textHash}`;
        
        // Tier 1: キャッシュ層（原価0円）
        const cachedResult = await kv.get(cacheKey);
        
        if (cachedResult) {
            const data = typeof cachedResult === 'string' ? JSON.parse(cachedResult) : cachedResult;
            riskScore = data.riskScore;
            findings = data.findings;
            isCached = true;
        } else {
            // Tier 2: AI精密審査層（LLM呼び出し）
            let rules = await kv.get('ars_knowledge:rules') || [];
            if (typeof rules === 'string') {
                try { rules = JSON.parse(rules); } catch(e) { rules = []; }
            }
            if (rules.length === 0) {
                rules = [{ id: "default_rule", lawName: "基本NGルール", ngKeywords: ["若返り", "10歳", "消えます", "絶対", "100%"] }];
            }

            if (!process.env.GEMINI_API_KEY) {
                // LLMがない場合のフォールバック（旧ロジック）
                for (const rule of rules) {
                    for (const keyword of rule.ngKeywords) {
                        if (text.includes(keyword)) {
                            riskScore = Math.max(riskScore, 85);
                            findings.push(`${rule.lawName}：禁止ワード「${keyword}」の使用を検知`);
                        }
                    }
                }
            } else {
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, { apiVersion: 'v1' });
                const prompt = `
あなたは世界最高峰の法務・コンプライアンス審査AIです。
以下の「広告・文章」が、現在の「学習済み法律・ルール」に違反していないかを精密に審査してください。

【対象文章】
${text}

【学習済み法律・ルール】
${JSON.stringify(rules, null, 2)}

必ず以下のJSONフォーマットのみで出力してください（マークダウンの装飾は不要です）。
{
  "isRisky": true/false,
  "riskScore": 0から100の数字（100が最も危険）、
  "findings": ["違反理由1", "違反理由2"] (安全な場合は空配列)
}
`;
                let llmResult;
                const modelsToTry = ["gemini-2.0-flash", "gemini-1.5-flash-latest", "gemini-1.5-flash", "gemini-pro"];
                let lastError;

                for (const modelName of modelsToTry) {
                    try {
                        const model = genAI.getGenerativeModel({ model: modelName });
                        llmResult = await model.generateContent(prompt);
                        if (llmResult) break;
                    } catch (e) {
                        lastError = e;
                        console.warn(`Audit Model ${modelName} failed, trying next...`);
                    }
                }
                
                if (!llmResult) throw lastError;
                
                const responseText = llmResult.response.text().trim().replace(/```json/g, '').replace(/```/g, '');
                const outputData = JSON.parse(responseText);
                
                riskScore = outputData.riskScore || (outputData.isRisky ? 85 : 0);
                findings = outputData.findings || [];
            }

            // 結果をKVにキャッシュ（1週間有効）
            await kv.set(cacheKey, JSON.stringify({ riskScore, findings }), { ex: 604800 });
        }
    } catch (e) {
        console.error("Knowledge base fetch or Gemini error:", e);
    }

    // 収益の計算 (薄利多売インフラモデル: 1回1円)
    const unitPrice = 1;
    const totalCurrentAmount = unitPrice * trxCount;

    try {
        // [DATABASE]: 実データの記録
        const totalTrx = await kv.incrby('ars_total_transactions', trxCount);
        const totalRevenue = await kv.incrby('ars_total_revenue', totalCurrentAmount);
        
        const now = new Date(Date.now() + (9 * 60 * 60 * 1000)); 
        const dateStr = now.toISOString().split('T')[0];
        const dailyKey = `ars_daily_stats:${dateStr}`;
        await kv.hincrby(dailyKey, 'revenue', totalCurrentAmount);
        await kv.hincrby(dailyKey, 'transactions', trxCount);

        // ログ保存
        await kv.lpush('ars_recent_logs', JSON.stringify({
            timestamp: new Date().toISOString(),
            amount: totalCurrentAmount,
            count: trxCount,
            mode: trxCount > 1 ? `bulk-${auditLevel}` : auditLevel,
            verdict: riskScore > 60 ? "CRITICAL" : "SAFE"
        }));
        await kv.ltrim('ars_recent_logs', 0, 99);

        res.status(200).json({
            service: "ARS Autonomous Gateway",
            payer: payerType,
            tier: isCached ? "Tier 1 (Cached: Cost $0)" : "Tier 2 (LLM Analyzed)",
            verdict: riskScore > 60 ? "CRITICAL" : "SAFE",
            riskScore: riskScore,
            findings: findings,
            processedCount: trxCount,
            billing: {
                unitPrice: unitPrice,
                amount: totalCurrentAmount,
                total_revenue: totalRevenue,
                total_transactions: totalTrx,
                remainingTokens: currentBalance
            }
        });
    } catch (dbError) {
        console.error("DB Error:", dbError);
        res.status(200).json({
            service: "ARS (Offline-Fallback)",
            verdict: riskScore > 60 ? "CRITICAL" : "SAFE",
            billing: { amount: totalCurrentAmount, status: "simulated" }
        });
    }
};
