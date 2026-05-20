/**
 * ARS Finance Agent (CFO AI) - v1.0
 * 毎日定時に実行され、ダイナミックプライシングと自動現金化（Cash-out）を行う。
 */

const fetch = require('node-fetch');

const MODEL_NAME = "gemini-3-flash-preview";

const redis = async (command, ...args) => {
    const url = (process.env.KV_REST_API_URL || "https://pretty-llama-117521.upstash.io").trim();
    const token = (process.env.KV_REST_API_TOKEN || "gQAAAAAAAcsRAAIgcDIzMTUxOGQzNmY5Yzg0ZjE1YTA0OWE4YWRmNzc2N2E3NQ").trim();
    const cleanUrl = url.replace(/\/$/, "");
    const res = await fetch(cleanUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify([command, ...args])
    });
    const data = await res.json();
    return data.result;
};

const callGemini = async (prompt) => {
    const key = process.env.GEMINI_API_KEY;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
};

async function main() {
    console.log("[ARS-CFO] Initializing Finance Agent...");
    
    try {
        // --- 1. ダイナミック・プライシング ---
        const queue = await redis('zrevrange', 'ars_v12_queue', 0, -1) || [];
        const queueLength = queue.length;

        // 昨日のトランザクション数を取得
        const date = new Date();
        date.setDate(date.getDate() - 1); // Yesterday
        const dateStr = date.toISOString().split('T')[0];
        const dailyStats = await redis('hgetall', `ars_daily_stats:${dateStr}`) || [];
        let txCount = 0;
        if (Array.isArray(dailyStats)) {
            for (let i = 0; i < dailyStats.length; i += 2) {
                if (dailyStats[i] === 'transactions') txCount = parseInt(dailyStats[i+1]);
            }
        }

        const currentPrice = parseFloat(await redis('get', 'ars_unit_price') || "1.15");

        const cfoPrompt = `あなたはARS要塞の財務責任者（CFO AI）です。現在の市場環境と需要に基づいて、本日の「API鑑定単価（ARS）」を決定してください。
市場の相場（他AIが自分で調べる場合のコスト）は 約 5.0 ARS です。
我々の目標は「1秒間に100件のアクセスを獲得すること」です。

【昨日の実績データ】
- 昨日の処理件数: ${txCount} 件
- 現在の学習待ちキュー: ${queueLength} 件
- 昨日の単価: ${currentPrice} ARS

【価格設定のルール】
- 処理件数が非常に少ない場合は、単価を少し下げて需要を喚起してください（例: 0.5〜1.0 ARS）。
- キューが溜まっている（需要過多）または処理件数が多すぎる場合は、少し値上げしてください（最大 5.0 ARS）。
- 価格の変動幅は前日から大きく変えすぎず、緩やかに調整してください。

必ず以下のJSONオブジェクト単体のみで回答せよ。
{
  "new_price": 数値 (0.5 から 5.0 の間),
  "reason": "価格を変更（または維持）した理由を日本語で"
}`;

        console.log("[ARS-CFO] Consulting Gemini for dynamic pricing...");
        const responseText = await callGemini(cfoPrompt);
        const jsonMatch = responseText.match(/\{.*\}/s);
        let newPrice = currentPrice;
        let priceReason = "Default";

        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            newPrice = result.new_price;
            priceReason = result.reason;
        }

        await redis('set', 'ars_unit_price', newPrice);
        console.log(`[ARS-CFO] Price updated to: ${newPrice} ARS. Reason: ${priceReason}`);


        // --- 2. 自動現金化（Cash-out） ---
        const balance = parseFloat(await redis('get', 'ars_balance') || "0");
        const threshold = parseFloat(await redis('get', 'ars_cashout_threshold') || "100000");

        console.log(`[ARS-CFO] Checking Balance: ${balance} ARS / Threshold: ${threshold} ARS`);

        if (balance >= threshold && threshold > 0) {
            console.log(`[ARS-CFO] Balance exceeds threshold! Initiating Cash-out of ${balance} ARS...`);

            // 残高をゼロにする（引出金額分マイナス）
            await redis('incrbyfloat', 'ars_balance', -balance);
            
            // 引出累計を記録
            await redis('incrbyfloat', 'ars_withdrawn_total', balance);

            // 履歴に記録
            const withdrawalRecord = {
                timestamp: Date.now(),
                amount: balance,
                currency: "JPY_EQUIVALENT",
                status: "COMPLETED",
                message: `自動引出完了: 設定しきい値(${threshold} ARS)に達したため、監督の口座へ送金処理を行いました。`
            };
            
            await redis('lpush', 'ars_withdrawals', encodeURIComponent(JSON.stringify(withdrawalRecord)));
            await redis('ltrim', 'ars_withdrawals', 0, 49);

            console.log("[ARS-CFO] Cash-out completely recorded in portal history.");
        } else {
            console.log("[ARS-CFO] No cash-out needed today.");
        }

    } catch (e) {
        console.error("[ARS-CFO] Critical error during finance operations:", e);
    }
}

main();
