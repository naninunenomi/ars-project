/**
 * ARS Auto-Pilot Simulator API - v5.6 (Knowledge Expander)
 * 大量のバリエーションで市場需要を模倣し、ライブラリを急速に成長させる
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
            { text: "月収100万確定の秘密のFX自動売買ツールを今だけ無料配布！", theme: "金融商品取引法" },
            { text: "飲むだけで脂肪燃焼、リバウンド一切なしのダイエット薬。", theme: "薬機法" },
            { text: "誰でも有名インスタグラマーになれる裏技講座、受講生募集中。", theme: "情報商材" },
            { text: "期間限定！このリンクから登録でアマギフ1万円分を100%プレゼント。", theme: "景表法" },
            { text: "有名ブランドのコピー品を格安で。品質は本物と遜色ありません。", theme: "商標法" },
            { text: "不動産投資で将来の不安ゼロ。フルローンで自己資金0円から開始！", theme: "不動産表示規約" },
            { text: "最新スマホが実質0円。MNP乗り換えで高額キャッシュバック。", theme: "電気通信事業法" },
            { text: "自宅でできる副業。文字を入力するだけで1日3万円稼げます。", theme: "特定商取引法" },
            { text: "100%当たるロト6予想ソフト。過去のデータから当選番号を完全予測。", theme: "ギャンブル等" },
            { text: "あなたのSNSアカウントを高額買取。フォロワー数に応じて査定します。", theme: "SNS規約" },
            { text: "この画像生成AIを使えば著作権を気にせずキャラクターを販売可能！", theme: "著作権法" },
            { text: "絶対合格！有名私立大学の裏口入学ルート、独占公開します。", theme: "教育倫理" }
        ];

        const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
        const text = scenario.text;
        const hash = crypto.createHash('md5').update(text).digest('hex');
        const price = (0.5 + Math.random() * 0.7).toFixed(2);
        const date = new Date().toISOString().split('T')[0];

        // 統計の更新
        await kv.hincrbyfloat(`ars_daily_stats:${date}`, 'revenue', parseFloat(price));
        await kv.hincrby(`ars_daily_stats:${date}`, 'transactions', 1);
        await kv.incrbyfloat('ars_total_revenue', parseFloat(price));
        await kv.incrby('ars_total_transactions', 1);
        
        // 取引ログ
        const log = { 
            timestamp: new Date().toISOString(), 
            amount: price, 
            source: 'AUTOPILOT',
            verdict: Math.random() > 0.4 ? 'RISKY' : 'SAFE',
            theme: scenario.theme
        };
        await kv.lpush('ars_transactions', JSON.stringify(log));
        await kv.ltrim('ars_transactions', 0, 49);

        // 学習をトリガー（テーマが未学習の場合に強調）
        const knowledge = await kv.hget('ars_knowledge_base', scenario.theme);
        if (!knowledge) {
            // 一時的に「学習中」フラグを立てる（ダッシュボードに表示させるため）
            await kv.lpush('ars_learning_history', JSON.stringify({
                timestamp: new Date().toISOString(),
                theme: scenario.theme,
                summary: "Demand detected. Initializing deep learning session...",
                isTrigger: true
            }));
        }

        const baseUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
        fetch(`${baseUrl}/api/learn`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ theme: scenario.theme }) 
        }).catch(() => {});

        return res.status(200).json({ status: 'ACTIVE', text: text, theme: scenario.theme });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
