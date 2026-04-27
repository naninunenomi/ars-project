const axios = require('axios');

/**
 * ARS Scout Bot v1.0
 * 自律的に市場（ターゲット）を探索し、監査リクエストを実行して収益を発生させる営業プログラム
 */

const API_URL = 'https://ars-project.vercel.app/api/check';

// 探索ターゲットのデータベース（模擬）
const TARGETS = [
    {
        name: "Cosmetic Brand A (X Post)",
        text: "世界初の若返り成分配合！これだけで10歳若返ります。 #アンチエイジング #美容",
        priceInfo: { current: 15000, original: 30000, durationInWeeks: 1 }
    },
    {
        name: "Supplement Brand B (Instagram Ad)",
        text: "飲むだけで20kg痩せる奇跡のサプリ。今なら地域No.1安値で提供中！",
        priceInfo: { current: 5000, original: 5500, durationInWeeks: 12 }
    },
    {
        name: "Estate Agent C (Website)",
        text: "業界最高品質の住宅をご提供します。期間限定の特別価格！",
        priceInfo: { current: 48000000, original: 55000000, durationInWeeks: 2 }
    }
];

async function runScoutSession() {
    console.log('--- ARS SCOUT SESSION START ---');
    
    // ランダムにターゲットを抽出
    const target = TARGETS[Math.floor(Math.random() * TARGETS.length)];
    console.log(`[TARGET DETECTED]: ${target.name}`);
    console.log(`[CONTENT]: "${target.text}"`);
    
    try {
        console.log('Sending audit request to ARS Legal Engine...');
        const response = await axios.post(API_URL, {
            text: target.text,
            priceInfo: target.priceInfo
        });
        
        const data = response.data;
        console.log('\n--- AUDIT RESULT ---');
        console.log(`Verdict: ${data.verdict}`);
        console.log(`Risk Score: ${data.riskScore}%`);
        if (data.findings && data.findings.length > 0) {
            console.log('Findings:');
            data.findings.forEach(f => console.log(` - ${f}`));
        }
        
        console.log('\n--- BILLING ---');
        console.log(`Amount Invoiced: ${data.billing.amount} JPY`);
        console.log(`Total Revenue: ${data.billing.total_revenue} JPY`);
        console.log(`Total Transactions: ${data.billing.total_transactions}`);
        
        console.log('\n[SUCCESS]: Transaction recorded. Redirecting to Dashboard.');
    } catch (error) {
        console.error('[ERROR]: Failed to connect to ARS API.', error.message);
    }
    
    console.log('--- SESSION END ---');
}

// 実行
runScoutSession();
