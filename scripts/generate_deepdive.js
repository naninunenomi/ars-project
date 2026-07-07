/**
 * generate_deepdive.js
 * 毎日のニュース下書き → ①各社を検索(Tavily) → ②v2プロンプトで執筆(Gemini)
 *  → ③ARSで法務チェック(DANGERなら自動でリスク併記して再チェック) → ④記事JSONを出力
 *
 * 下書き: DAILY_DRAFT(手動) または DRAFT_DOC_URL(Googleドキュメント) から取得
 * 必要な鍵: GEMINI_API_KEY, TAVILY_API_KEY
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 無料枠が多い gemini-3-flash-preview を優先し、使えなければ gemini-2.5-flash に自動フォールバック
let MODELS = (process.env.GEMINI_MODELS || 'gemini-3-flash-preview,gemini-2.5-flash').split(',').map((s) => s.trim()).filter(Boolean);
const ARS_URL = 'https://ars-project.vercel.app/api/check.js';
const OUT_DIR = path.join(__dirname, '../web/src/data/articles');
const STATE_FILE = path.join(__dirname, '../blog/deepdive_state.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Gemini ----
// gemini-3-flash(無料枠1日1500回)を優先。空応答/上限/非対応なら別モデルに切替。
// 429(1分あたり上限)は約62秒待って再試行。404/400(モデル非対応)はそのモデルを外す。
const geminiOnce = async (model, prompt, generationConfig) => {
  const key = process.env.GEMINI_API_KEY;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig })
  });
  return res.json();
};

const callGemini = async (prompt, { json = false, maxTokens = 8192 } = {}) => {
  const generationConfig = { maxOutputTokens: maxTokens };
  if (json) generationConfig.responseMimeType = 'application/json';
  for (let round = 0; round < 3; round++) {
    let hit429 = false;
    for (const model of [...MODELS]) {
      // 思考OFFの指定書式はモデル世代で異なる（3系=thinkingLevel、2.5系=thinkingBudget）
      const thinkingConfig = model.startsWith('gemini-3') ? { thinkingLevel: 'minimal' } : { thinkingBudget: 0 };
      const data = await geminiOnce(model, prompt, { ...generationConfig, thinkingConfig });
      if (data.candidates) {
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) return text;
        console.error(`[Gemini:${model}] 空応答 finishReason=`, data.candidates[0].finishReason);
        continue; // 別モデルへ
      }
      const code = data.error?.code;
      console.error(`[Gemini:${model}] error ${code}: ${(data.error?.message || '').slice(0, 140)}`);
      if (code === 429) { hit429 = true; continue; }                     // 上限→別モデル/後で待つ
      if (code === 404 || code === 400) MODELS = MODELS.filter((m) => m !== model); // 非対応→外す
    }
    if (MODELS.length === 0) { console.error('[Gemini] 使えるモデルがありません'); return ''; }
    if (hit429 && round < 2) { console.log('[Gemini] 上限のため約62秒待って再試行...'); await sleep(62000); continue; }
    return '';
  }
  return '';
};

// ---- Tavily ----
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
  } catch (e) { console.error('[Tavily] error', e.message); return null; }
};

// ---- ARS ----
const callARS = async (text) => {
  try {
    const res = await fetch(ARS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 1800), theme: '投資広告' })
    });
    const d = await res.json();
    return { verdict: d.verdict || d.status, risk: d.risk_score };
  } catch (e) { console.error('[ARS] error', e.message); return { verdict: 'ERROR' }; }
};

const parseJsonLoose = (s) => {
  if (!s) return null;
  const t = s.replace(/```json/gi, '').replace(/```/g, '').trim();
  const tries = [t];
  const obj = t.match(/\{[\s\S]*\}/); if (obj) tries.push(obj[0]);
  const arr = t.match(/\[[\s\S]*\]/); if (arr) tries.push(arr[0]);
  for (const x of tries) { try { return JSON.parse(x); } catch { /* next */ } }
  return null;
};

// 「TITLE: ...」＋「===BODY===」＋HTML本文 を分解（長文でも壊れにくい形式）
const parseTitleBody = (raw) => {
  if (!raw) return null;
  const t = raw.replace(/```html/gi, '').replace(/```/g, '').trim();
  const marker = '===BODY===';
  const idx = t.indexOf(marker);
  if (idx >= 0) {
    const head = t.slice(0, idx);
    const body = t.slice(idx + marker.length).trim();
    return { title: (head.match(/TITLE:\s*(.+)/)?.[1] || '').trim(), content: body };
  }
  const tm = t.match(/TITLE:\s*(.+)/);
  if (tm) return { title: tm[1].trim(), content: t.replace(/TITLE:\s*.+(\r?\n)?/, '').trim() };
  return { title: '', content: t };
};

const stripHtml = (h) => (h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const V2_RULES = `
あなたは経済・ビジネスを「面白く深く」語る解説ライターであり、金融商品取引法・景品表示法を守るコンプラ番人。
株価の上下を当てる記事ではなく「登場企業が何者で、どんな取り組みをし、その連鎖で世の中がどう変わりそうか」を描く。
【この記事の主役】ニュースそのものの解説記事にしない。主役は、下書きの「ニュース関連株情報（関連株）」に挙がった企業たちの深掘り。ニュースは「各企業がなぜ今注目されるのか」を示す入口・文脈として触れつつ、記事の中心は関連株企業の正体・取り組み・独自見解・連鎖する未来に置くこと。
【厳守】1.株価の方向を断定しない(上がる/下がる/儲かる/買い 禁止、値動きは「注目される/思惑」程度)。
2.確証のない数字を創作しない。リサーチ結果にない具体数字は書かない。不確実は「〜とされる」。
3.各企業の説明に必ず「ただし〜のリスク/不確実」を一言添える(良い面だけにしない)。
4.特定銘柄の購入推奨と取れる表現を避ける。5.強調は「」『』。**は不可。冒頭と末尾に免責文。
【トーン】各段落に絵文字1つ以上、フランクな先輩口調。面白さは「会社の意外な正体」「点がつながる連想」「未来シナリオ」で。
【構成】1.導入フック 2.登場企業の正体(各社ごとに小見出しを付ける。小見出しは「企業名（証券コード）――ひとことキャッチ」の形にすること。要素のラベル『ただし〜リスク』『最近の動き』等をそのまま小見出しにしてはいけない。本文の中に、どんな会社か[たとえ話]・最近の動き[リサーチ根拠]・リスクや不確実な点・独自見解1つ、を自然に織り込む) 3.連鎖する未来 4.だから経済を耳で追うと面白い→ <a href='/articles/hub_mimi_audible'>特集</a> へ誘導 5.免責文(冒頭・末尾)。
免責文:「本記事は情報提供・読み物であり、特定銘柄の売買を推奨するものではありません。企業の取り組みや将来の見通しには筆者の見解を含み、正確性や実現を保証しません。投資判断はご自身の責任で。」`;

const OUT_FORMAT = `\n\n【出力形式（厳守）】1行目に「TITLE: 記事タイトル」。2行目に「===BODY===」。3行目以降に記事本文をHTML(<p>や<h2>等)で書く。JSONやMarkdownコードブロックにはしない。タイトルに日付や「○月○日号」は入れないこと（日付はシステムが自動で付けます）。`;

async function main() {
  // 下書きの取得
  const isManual = !!(process.env.DAILY_DRAFT || '').trim();
  let draft = (process.env.DAILY_DRAFT || '').trim();
  if (!draft && process.env.DRAFT_DOC_URL) {
    try {
      console.log('Googleドキュメントから下書きを読み込み中...');
      const res = await fetch(process.env.DRAFT_DOC_URL);
      draft = (await res.text());
    } catch (e) { console.error('[Doc] 読み込み失敗', e.message); }
  }
  draft = (draft || '').replace(/^﻿/, '').trim();
  if (!draft || draft.length < 100) { console.log('⏭ 下書きが空か短すぎます。今回はスキップします。'); process.exit(0); }

  // 二重投稿ふせぎ
  const hash = crypto.createHash('sha256').update(draft).digest('hex').slice(0, 16);
  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { /* 初回 */ }
  if (!isManual && state.lastHash === hash) { console.log('⏭ 下書きに変化なし。公開済みのためスキップします。'); process.exit(0); }

  // ① 企業抽出
  console.log('① 企業を抽出中...');
  const listRaw = await callGemini(`次のニュース下書きの中の「ニュース関連株情報」や関連銘柄が列挙された部分（証券コード [^] や [$] が付いた箇所など。多くは下書きの後半にある）に注目し、そこに挙がっている企業を最大8件抽出してJSON配列だけを返せ。形式:[{"name":"企業名","ticker":"証券コード"}]。関連株の記載が見当たらない時のみ、本文の主要企業を抽出せよ。\n\n下書き:\n${draft.slice(0, 24000)}`, { json: true, maxTokens: 2048 });
  let companies = parseJsonLoose(listRaw);
  if (!Array.isArray(companies)) companies = [];
  if (companies.length === 0) console.error('⚠️ 企業を抽出できず。検索なしで執筆します。返答:', (listRaw || '(空)').slice(0, 200));
  else console.log('   抽出:', companies.map(c => c.name).join(', '));

  // ② 各社リサーチ
  let research = '';
  if (companies.length > 0) {
    console.log('② 各社をネット検索中...');
    for (const c of companies) {
      const data = await callTavily(`${c.name} ${c.ticker || ''} 事業 最新 2026 取り組み IR`);
      if (data && data.results) research += `\n【${c.name}】\n` + data.results.slice(0, 3).map(r => `- ${r.title}: ${r.content}`).join('\n');
    }
  }

  // ③ 執筆（JSONではなくHTML直接。枠を広げ、考え込みを無効化）
  console.log('③ 記事を執筆中...');
  const raw = await callGemini(`${V2_RULES}\n\n【当日のニュース下書き（後半の関連株情報が主役）】\n${draft.slice(0, 24000)}\n\n【各企業のリサーチ結果】\n${research.slice(0, 8000)}${OUT_FORMAT}`, { maxTokens: 16384 });
  let parsed = parseTitleBody(raw);
  if (!parsed || !parsed.content || parsed.content.length < 150) {
    console.error('🚨 記事本文の生成に失敗しました。Geminiの返答(先頭):', (raw || '(空)').slice(0, 400));
    process.exit(1);
  }
  let title = parsed.title || 'kijicast 深掘り';
  let content = parsed.content;

  // ④ ARSチェック（DANGERなら1回だけ書き直し）
  console.log('④ ARSで法務チェック中...');
  for (let i = 0; i < 2; i++) {
    const check = await callARS(stripHtml(content));
    console.log(`   ARS判定: ${check.verdict} (risk=${check.risk})`);
    if (check.verdict !== 'DANGER') break;
    if (i === 1) break;
    console.log('   DANGER→リスク併記を足して書き直し...');
    const fixRaw = await callGemini(`次の記事はARSで「一方的・リスク記載不足」でDANGER判定でした。各企業の説明に「ただし〜のリスク/不確実」を一言ずつ加え、断定表現を全て避けて書き直せ。免責も冒頭末尾に。${OUT_FORMAT}\n\n【タイトル】${title}\n【本文HTML】\n${content.slice(0, 14000)}`, { maxTokens: 16384 });
    const fixed = parseTitleBody(fixRaw);
    if (fixed && fixed.content && fixed.content.length > 150) { title = fixed.title || title; content = fixed.content; }
  }

  // ⑤ 記事JSONを出力
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  const stamp = jst.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const id = `article_${stamp}`;
  // タイトル先頭に「処理した日（JST）＝発行日」を付ける。AIが日付を入れていたら除去して付け直す。
  const mmdd = `${jst.getMonth() + 1}/${jst.getDate()}`;
  title = title.replace(/^[【\[]?\s*(?:20\d{2}[\/.年-])?\d{1,2}[\/.月-]\d{1,2}日?号?\s*[】\]]?[\s　：:]*/, '').trim();
  title = `【${mmdd}号】${title}`;
  const out = { id, title, category: 'お金・経済の深掘り', source_url: 'https://note.com/kijicast', source_name: 'kijicast', date: now.toISOString(), draft: false, content };
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${id}.json`), JSON.stringify(out, null, 2), 'utf8');
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastHash: hash, lastId: id, updated: new Date().toISOString() }, null, 2), 'utf8');
  console.log(`✅ 記事を出力しました: ${id}.json`);
}

main();
