/**
 * ARS Gatekeeper - v11.0 (Charter Compliant)
 * 憲章第2条に基づき、爆速判定・需要可視化・階層検索を実装
 */

const DISCLAIMER = "※本結果はAIによる鑑定であり、100%の正確性を保証するものではありません。最終的な判断は専門家にご確認ください。";

// Redis Helper (Hardened for v11.0)
const redis = async (command, ...args) => {
    let rawUrl = (process.env.KV_REST_API_URL || "").trim();
    let url = rawUrl.startsWith("http") ? rawUrl : "https://pretty-llama-117521.upstash.io";
    let rawToken = (process.env.KV_REST_API_TOKEN || "").trim();
    let token = rawToken.length > 10 ? rawToken : "gQAAAAAAAcsRAAIgcDIzMTUxOGQzNmY5Yzg0ZjE1YTA0OWE4YWRmNzc2N2E3NQ";

    // ★【要塞化】URL末尾のスラッシュを確実に排除してPOST
    const cleanUrl = url.replace(/\/$/, "");
    const res = await fetch(cleanUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify([command, ...args])
    });
    const data = await res.json();
    return data.result;
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const ghToken = process.env.GH_PAT;
    const owner = "naninunenomi";
    const repo = "ars-project";
    
    let { text, theme } = req.body;
    
    if (!text) return res.status(400).json({ error: "Text is required.", disclaimer: DISCLAIMER });

    try {
        // --- 1. 自己進化型分類ルーター (Auto-Classifier) ---
        if (!theme || theme === 'auto' || theme === '') {
            console.log(`[ARS] Auto-Classifier activated for text...`);
            
            // Redisから登録済みのテーマ一覧を取得
            const knowledgeBase = await redis('hgetall', 'ars_v12_knowledge') || {};
            let existingThemes = [];
            if (Array.isArray(knowledgeBase)) {
                for (let j = 0; j < knowledgeBase.length; j += 2) existingThemes.push(knowledgeBase[j]);
            } else {
                existingThemes = Object.keys(knowledgeBase);
            }

            const classifierPrompt = `あなたはAI専用の分類ゲートキーパーです。以下の【広告テキスト】を入力とし、既存のナレッジテーマ【既存テーマ一覧】からもっとも合致する法律違反監査用のテーマを選択せよ。
既存のどのテーマにも高精度（90%以上の確信度）で合致しない場合は、その広告テキストを監査するのにふさわしい【新しい具体的な法規テーマ名】を自動で定義せよ（例: 金融取引法に基づく『金融広告（金融商品取引法）』、資金決済法に基づく『暗号資産広告（資金決済法）』など）。

既存テーマ一覧:
${existingThemes.map(t => `- ${t}`).join('\n') || "(なし)"}

対象テキスト: "${text}"

返却値は必ず以下のJSONフォーマットにせよ。Markdownのマークアップ（\`\`\`json）などは一切含めず、純粋なJSONオブジェクト単体として返せ。
{
  "matched": true/false（既存テーマに合致した場合はtrue、新規テーマを自律定義した場合はfalse）,
  "theme": "選択した既存テーマ名、または新規に自動命名したテーマ名"
}`;

            const geminiClassifyRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: classifierPrompt }] }] })
            });
            const classifyData = await geminiClassifyRes.json();
            
            let classifyResult = { matched: false, theme: "広告鑑定（一般法）" };
            if (classifyData.candidates && classifyData.candidates.length > 0) {
                const responseText = classifyData.candidates[0].content.parts[0].text;
                const jsonMatch = responseText.match(/\{.*\}/s);
                classifyResult = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
            }

            theme = classifyResult.theme;
            console.log(`[ARS] Auto-Classifier result: matched=${classifyResult.matched}, theme=${theme}`);

            // 未知のテーマを検出した場合：即時リサーチを起動し、STUDYINGステータスを返す
            if (!classifyResult.matched || !existingThemes.includes(theme)) {
                console.log(`[ARS] Unknown theme detected: "${theme}". Initializing self-evolving research...`);
                
                // 新規テーマ検知：学習起動のトランザクションを記録
                const trxData = {
                    timestamp: Date.now(),
                    source: req.headers['x-client-id'] || 'Client-AI-Agent-X',
                    theme: theme,
                    amount: 0,
                    verdict: 'STUDYING',
                    risk_score: 0,
                    violation_codes: ['NEW_THEME_DETECTED'],
                    details_ja: `新規テーマ「${theme}」を自動検知。リサーチャーを起動し自己学習を開始しました。`,
                    status: 'STUDYING'
                };
                await redis('lpush', 'ars_transactions', encodeURIComponent(JSON.stringify(trxData)));
                await redis('ltrim', 'ars_transactions', 0, 49);
                
                // キューに登録
                await redis('zincrby', 'ars_v12_queue', 1, theme);
                
                if (ghToken) {
                    try {
                        await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${ghToken}`,
                                'Accept': 'application/vnd.github+json',
                                'X-GitHub-Api-Version': '2022-11-28',
                                'User-Agent': 'ARS-Fortress-v16'
                            },
                            body: JSON.stringify({ 
                                event_type: "ars-research-command",
                                client_payload: { topic: theme }
                            })
                        });
                    } catch (e) {
                        console.error("[ARS] GitHub Trigger Exception:", e);
                    }
                }

                return res.json({
                    status: "STUDYING",
                    theme: theme,
                    message: `New theme detected: "${theme}". Dispatched autonomous researcher to study this legal area.`,
                    disclaimer: DISCLAIMER
                });
            }
        }

        console.log(`[ARS] Processing valuation for theme: ${theme}`);
        
        // --- 憲章第4条-3: 階層型遡り検索 (Hierarchical Search) ---
        const themeParts = theme.split('/');
        let manual = null;
        let activeTheme = theme;

        for (let i = themeParts.length; i > 0; i--) {
            const currentPath = themeParts.slice(0, i).join('/');
            manual = await redis('hget', 'ars_v12_checklist', currentPath) || await redis('hget', 'ars_v12_knowledge', currentPath);
            if (manual) {
                activeTheme = currentPath;
                break;
            }
        }

        if (manual) {
            console.log(`[ARS] Knowledge found: ${activeTheme}. Starting valuation...`);
            
            // --- 憲章第2.1条: メタ認知（知能の自己採点） ＆ 日本語可視化拡張 ---
            const evalPrompt = `以下の【鑑定マニュアル】を用いて、この広告を鑑定せよ。
マニュアル:
${manual}
対象テキスト: "${text}"

必ず以下のJSONオブジェクト単体のみで回答せよ。Markdownのマークアップなどは一切含めず、パース可能な純粋なJSON文字列として回答せよ。
{ 
  "confidence": 0-100, 
  "gap": "マニュアルに不足している具体的な法的論点があれば1単語で記述。なければ空文字", 
  "verdict": "SAFE/RISKY/DANGER", 
  "risk_score": 0-100,
  "violation_codes": ["おとり広告ならRE_AD_BAIT、薬機法違反ならPH_AD_EXAGGERATEDなどの具体的な英字の違反コードの配列。SAFEなら空配列 []"],
  "reason": "English summary of the verdict",
  "details_ja": "監督およびクライクライアントAI向けの、親切で非常にわかりやすい具体的な法律違反解説（日本語）。どの法令のどの部分に、広告テキストのどの表現が違反しているのかを日本語で具体的に説明すること。"
}`;
            
            const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: evalPrompt }] }] })
            });
            const data = await geminiRes.json();
            
            if (data.candidates && data.candidates.length > 0) {
                const responseText = data.candidates[0].content.parts[0].text;
                const jsonMatch = responseText.match(/\{.*\}/s);
                const evalResult = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
                
                console.log(`[ARS] Knowledge Confidence: ${evalResult.confidence}%`);

                // 1. 課金＆売上本番反映
                const unitPrice = parseFloat(await redis('get', 'ars_unit_price') || "1.15");
                await redis('incrbyfloat', 'ars_total_revenue', unitPrice);
                
                const dateStr = new Date().toISOString().split('T')[0];
                await redis('hincrby', `ars_daily_stats:${dateStr}`, 'transactions', 1);
                await redis('hincrbyfloat', `ars_daily_stats:${dateStr}`, 'revenue', unitPrice);

                // 2. トランザクションレコードの保存 (日本語可視化対応)
                const trxData = {
                    timestamp: Date.now(),
                    source: req.headers['x-client-id'] || 'Client-AI-Agent-X',
                    theme: activeTheme,
                    amount: unitPrice,
                    verdict: evalResult.verdict,
                    risk_score: evalResult.risk_score || 0,
                    violation_codes: evalResult.violation_codes || [],
                    details_ja: evalResult.details_ja || evalResult.reason || '',
                    status: 'SUCCESS'
                };
                await redis('lpush', 'ars_transactions', encodeURIComponent(JSON.stringify(trxData)));
                await redis('ltrim', 'ars_transactions', 0, 49);

                // 3. インクリメンタル研究員の派遣チェック
                const currentStatus = await redis('hget', 'ars_v12_status', activeTheme);
                if (evalResult.confidence < 90 && ghToken && currentStatus !== 'STUDYING') {
                    console.log(`[ARS] Confidence low. Gap detected: ${evalResult.gap}. Dispatching Incremental Research...`);
                    try {
                        await redis('hset', 'ars_v12_status', activeTheme, 'STUDYING');
                        await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${ghToken}`,
                                'Accept': 'application/vnd.github+json',
                                'X-GitHub-Api-Version': '2022-11-28',
                                'User-Agent': 'ARS-Fortress-v16'
                            },
                            body: JSON.stringify({ 
                                event_type: "ars-research-command",
                                client_payload: { gap: evalResult.gap, topic: activeTheme }
                            })
                        });
                    } catch (e) {
                        console.error("[ARS] Incremental Dispatch Failed:", e);
                    }
                }
                
                return res.json({ 
                    status: "success",
                    verdict: evalResult.verdict,
                    risk_score: evalResult.risk_score || 0,
                    violation_codes: evalResult.violation_codes || [],
                    details_ja: evalResult.details_ja || evalResult.reason || '',
                    confidence: evalResult.confidence,
                    price: `${unitPrice} ARS`, 
                    source: manual === theme ? 'KNOWLEDGE_LIBRARY' : `HIERARCHICAL_MATCH (${activeTheme})`, 
                    disclaimer: DISCLAIMER,
                    model: "gemini-3-flash-preview"
                });
            } else {
                console.error("[ARS] Gemini Valuation Failed:", data);
                return res.json({ status: "STUDYING", message: "Valuation failed. Refining...", disclaimer: DISCLAIMER });
            }
        } else {
            console.log(`[ARS] No knowledge found. Dispatching Researcher...`);
            
            // トランザクション記録
            const trxData = {
                timestamp: Date.now(),
                source: req.headers['x-client-id'] || 'Client-AI-Agent-X',
                theme: activeTheme,
                amount: 0,
                verdict: 'STUDYING',
                risk_score: 0,
                violation_codes: ['NO_KNOWLEDGE_FOUND'],
                details_ja: `テーマ「${activeTheme}」の知識がまだありません。リサーチャーを起動し学習を開始しました。`,
                status: 'STUDYING'
            };
            await redis('lpush', 'ars_transactions', encodeURIComponent(JSON.stringify(trxData)));
            await redis('ltrim', 'ars_transactions', 0, 49);

            await redis('zincrby', 'ars_v12_queue', 1, activeTheme);
            
            if (ghToken) {
                try {
                    await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${ghToken}`,
                            'Accept': 'application/vnd.github+json',
                            'X-GitHub-Api-Version': '2022-11-28',
                            'User-Agent': 'ARS-Fortress-v14'
                        },
                        body: JSON.stringify({ event_type: "ars-research-command" })
                    });
                } catch (e) {
                    console.error("[ARS] GitHub Trigger Exception:", e);
                }
            }

            return res.json({
                status: "STUDYING",
                theme: activeTheme,
                message: `ARS Researcher has been dispatched for theme: "${activeTheme}". Deep research is in progress.`,
                disclaimer: DISCLAIMER
            });
        }
    } catch (e) {
        return res.status(500).json({ error: e.message, disclaimer: DISCLAIMER });
    }
};
