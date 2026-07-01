/**
 * generate_deepdive.js
 * 毎日のニュース下書き → ①各社を検索(Tavily) → ②v2プロンプトで執筆(Gemini)
 *  → ③ARSで法務チェック(DANGERなら自動でリスク併記して再チェック) → ④記事JSONを出力
 *
 * 実行: DAILY_DRAFT 環境変数に下書き本文を入れて node scripts/generate_deepdive.js
 * 必要な鍵(環境変数): GEMINI_API_KEY, TAVILY_API_KEY
 */

const fs = require('fs');
const path = require('path');

const MODEL_NAME = 'gemini-2.5-flash';
const ARS_URL = 'https://ars-project.vercel.app/api/check.js';
const OUT_DIR = path.join(__dirname, '../web/src/data/articles');

// ---- Gemini（執筆・抽出用。JSONモードで確実にJSONを返させる）----
const callGemini = async (prompt) => {
  const key = process.env.GEMINI_API_KEY;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });
  const data = await res.json();
  if (!data.candidates) {
    console.error('[Gemini] no candidates:', JSON.stringify(data).slice(0, 600));
    return '';
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

// ---- Tavily（検索用）----
const callTavily = async (query) => {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, query, search_depth: 'advanced', max_results: 4 })
    });
    return await res.json();
  } catch (e) {
    console.error('[Tavily] error', e.message);
    return null;
  }
};

// ---- ARS（法務チェック）----
const callARS = async (text) => {
  try {
    const res = await fetch(ARS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 1800), theme: '投資広告' })
    });
    const d = await res.json();
    return { verdict: d.verdict || d.status, risk: d.risk_score };
  } catch (e) {
    console.error('[ARS] error', e.message);
    return { verdict: 'ERROR' };
  }
};

// JSONを緩く解析（配列[...]・オブジェクト{...}・```json```のどれでも拾う）
const parseJsonLoose = (s) => {
  if (!s) return null;
  const t = s.replace(/```json/gi, '').replace(/```/g, '').trim();
  const tries = [t];
  const obj = t.match(/\{[\s\S]*\}/); if (obj) tries.push(obj[0]);
  const arr = t.match(/\[[\s\S]*\]/); if (arr) tries.push(arr[0]);
  for (const x of tries) { try { return JSON.parse(x); } catch { /* next */ } }
  return null;
};
const stripHtml = (h) => (h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const V2_RULES = `
あなたは経済・ビジネスを「面白く深く」語る解説ライターであり、金融商品取引法・景品表示法を守るコンプラ番人。
株価の上下を当てる記事ではなく「登場企業が何者で、どんな取り組みをし、その連鎖で世の中がどう変わりそうか」を描く。
【この記事の主役】ニュースそのものの解説記事にしない。主役は、下書きの「ニュース関連株情報（関連株）」に挙がった企業たちの深掘り。ニュースは「各企業がなぜ今注目されるのか」を示す"入口・文脈"として冒頭と各社説明で触れつつ、記事の中心は関連株企業の正体・取り組み・独自見解・連鎖する未来に置くこと。
【厳守】1.株価の方向を断定しない(上がる/下がる/儲かる/買い 禁止、値動きは「注目される/思惑」程度)。
2.確証のない数字を創作しない。リサーチ結果にない具体数字は書かない。不確実は「〜とされる」。
3.各企業の説明に必ず「ただし〜のリスク/不確実」を一言添える(良い面だけにしない)。
4.特定銘柄の購入推奨と取れる表現を避ける。5.強調は「」『』。**は不可。冒頭と末尾に免責文。
【トーン】各段落に絵文字1つ以上、フランクな先輩口調。面白さは「会社の意外な正体」「点がつながる連想」「未来シナリオ」で。
【構成】1.導入フック 2.登場企業の正体(各社:どんな会社か[たとえ話]/最近の動き[リサーチ根拠]/ただし〜リスク/この記事ならではの独自見解1つ) 3.連鎖する未来(各社をつなぎ「だから世の中はこう変わるかも」を洞察として) 4.だから経済を耳で追うと面白い→ <a href='/articles/hub_mimi_audible'>特集</a> へ誘導 5.免責文(冒頭・末尾)。
免責文:「本記事は情報提供・読み物であり、特定銘柄の売買を推奨するものではありません。企業の取り組みや将来の見通しには筆者の見解を含み、正確性や実現を保証しません。投資判断はご自身の責任で。」`;

async function main() {
  const draft = (process.env.DAILY_DRAFT || '').trim();
  if (!draft) { console.error('🚨 DAILY_DRAFT が空です'); process.exit(1); }

  // ① 企業抽出
  console.log('① 企業を抽出中...');
  const listRaw = await callGemini(`次のニュース下書きの中の「ニュース関連株情報」や関連銘柄が列挙された部分（証券コード [^] や [$] が付いた箇所など。多くは下書きの後半にある）に注目し、そこに挙がっている企業を最大8件抽出してJSON配列だけを返せ。形式:[{"name":"企業名","ticker":"証券コード"}]。関連株の記載が見当たらない時のみ、本文の主要企業を抽出せよ。\n\n下書き:\n${draft.slice(0, 24000)}`);
  let companies = parseJsonLoose(listRaw);
  if (!Array.isArray(companies)) companies = [];
  if (companies.length === 0) {
    console.error('⚠️ 企業を抽出できませんでした。Geminiの返答（先頭）:', (listRaw || '(空)').slice(0, 300));
    console.error('   → 検索なしで、下書きとAIの知識だけで執筆を続けます。');
  } else {
    console.log('   抽出:', companies.map(c => c.name).join(', '));
  }

  // ② 各社リサーチ
  let research = '';
  if (companies.length > 0) {
    console.log('② 各社をネット検索中...');
    for (const c of companies) {
      const data = await callTavily(`${c.name} ${c.ticker || ''} 事業 最新 2026 取り組み IR`);
      if (data && data.results) {
        research += `\n【${c.name}】\n` + data.results.slice(0, 3).map(r => `- ${r.title}: ${r.content}`).join('\n');
      }
    }
  }

  // ③ 執筆
  console.log('③ 記事を執筆中...');
  const writePrompt = `${V2_RULES}\n\n【当日のニュース下書き（後半の関連株情報が主役）】\n${draft.slice(0, 24000)}\n\n【各企業のリサーチ結果】\n${research.slice(0, 8000)}\n\n次のJSONだけを返せ: {"title":"記事タイトル","content_html":"<p>...</p><h2>...</h2>... 本文をHTMLで"}`;
  let article = parseJsonLoose(await callGemini(writePrompt));
  if (!article || !article.content_html) { console.error('🚨 記事本文の生成に失敗しました'); process.exit(1); }

  // ④ ARSチェック（DANGERなら1回だけ書き直し）
  console.log('④ ARSで法務チェック中...');
  for (let i = 0; i < 2; i++) {
    const check = await callARS(stripHtml(article.content_html));
    console.log(`   ARS判定: ${check.verdict} (risk=${check.risk})`);
    if (check.verdict !== 'DANGER') break;
    if (i === 1) break;
    console.log('   DANGER→リスク併記を足して書き直し...');
    const fixed = parseJsonLoose(await callGemini(`次の記事はARSで「一方的・リスク記載不足」でDANGER判定でした。各企業の説明に「ただし〜のリスク/不確実」を一言ずつ加え、断定表現を全て避けて書き直せ。免責も冒頭末尾に。次のJSONだけを返せ:{"title":"...","content_html":"..."}\n\n記事:\n${JSON.stringify(article).slice(0, 12000)}`));
    if (fixed && fixed.content_html) article = fixed;
  }

  // ⑤ 記事JSONを出力
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  const stamp = jst.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const id = `article_${stamp}`;
  const out = {
    id,
    title: article.title || 'kijicast 深掘り',
    category: 'お金・経済の深掘り',
    source_url: 'https://note.com/kijicast',
    source_name: 'kijicast',
    date: now.toISOString(),
    draft: false,
    content: article.content_html
  };
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${id}.json`), JSON.stringify(out, null, 2), 'utf8');
  console.log(`✅ 記事を出力しました: ${id}.json`);
}

main();
