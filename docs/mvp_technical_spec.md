# サーバーレス・プロトタイプ設計 (MVP: Minimum Viable Product)
## 〜「1円」を稼ぐための最小構成〜

この構成は、運用コストをほぼゼロ（0.01円以下）にしつつ、エージェントからのリクエストを処理して決済を行うための最小限の設計図です。

---

## 1. 使用技術 (Technology Stack)
- **Runtime**: Node.js (Vercel Functions または Google Cloud Functions)
- **Logic**: OpenAI API (景表法判定プロンプト)
- **Transaction**: Simulated Payment Log (まずはログへの記録から始め、後にStripe等のAPIへ接続)

---

## 2. 最小限のコード構成 (Prototype Code)

```javascript
// index.js (Google Cloud Functions想定)
const { OpenAI } = require("openai");
const openai = new OpenAI();

exports.arsCheckAgent = async (req, res) => {
    // 1. エージェントからのリクエストを受け取り
    const { adText, agentId } = req.body;

    // 2. 決済の「予約」 (シミュレーション)
    console.log(`[TRANSACTION] Agent: ${agentId} - Reserved: 1 JPY`);

    // 3. 景表法・ステマ判定の実行
    const completion = await openai.chat.completions.create({
        messages: [
            { role: "system", content: "あなたは景表法の専門家です。以下の広告文がステマ規制に抵触する可能性を0-100%で数値化してください。" },
            { role: "user", content: adText }
        ],
        model: "gpt-4o-mini", // コスト最優先モデル
    });

    const result = completion.choices[0].message.content;

    // 4. 決済の「確定」 (1円獲得の記録)
    console.log(`[REVENUE] Success! Collected 1 JPY from ${agentId}`);

    // 5. 結果の返却
    res.status(200).send({
        status: "success",
        rating: result,
        charge: "1 JPY"
    });
};
```

---

## 3. なぜ「1円」で成立するのか？
- **実行コスト**: GPT-4o-miniのトークン代は約0.05円。サーバーレス実行費は100万回再生まで無料。
- **利益率**: 1回のリクエスト（1円）に対して、経費が0.05円。残り**0.95円（95%）が利益**となります。
- **スケール**: このコードを一つの関数（箱）としてデプロイすれば、1秒間に100回呼ばれても、1,000回呼ばれても勝手に処理されます。

---

### 次のアクション
1. **監督（あなた）の承認**: 「このコードでテスト環境を作れ」と命じてください。
2. **データの投入**: 先ほどリストアップした消費者庁の「運用基準」をこのプロンプトに組み込み、精度を高めます。
