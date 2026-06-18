const fs = require('fs');
const path = require('path');
const axios = require('axios');

const STATE_FILE = path.join(__dirname, '../blog/state.json');
const SOURCES_FILE = path.join(__dirname, '../blog/sources.json');

const DIFY_API_URL = process.env.DIFY_API_URL || 'https://api.dify.ai/v1/workflows/run';
const DIFY_API_KEY = process.env.DIFY_API_KEY;

const MAX_ARTICLES_PER_DAY = 2; // 1日に生成する記事の最大数
const MAX_DIFY_CALLS_PER_DAY = 5; // 1日のDify呼び出し上限（Gemini無料枠保護）

if (!DIFY_API_KEY) {
  console.error("🚨 DIFY_API_KEY is not set.");
  process.exit(1);
}

// 状態を読み込む
function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (e) {
      console.error("Failed to parse state.json", e);
    }
  }
  return { pending_article: null, articles_today: 0, dify_calls_today: 0, last_count_date: null, processed_urls: [] };
}

// 状態を保存する
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// ランダムな記事をsources.jsonから選ぶ（処理済みのものを除く）
function pickRandomArticle(state) {
  if (!fs.existsSync(SOURCES_FILE)) {
    console.error("🚨 sources.json not found!");
    return null;
  }
  const sources = JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf8'));
  
  // 処理済みURLを除外
  const processedUrls = state.processed_urls || [];
  const availableSources = sources.filter(article => !processedUrls.includes(article.url));

  if (availableSources.length === 0) {
    console.log("⚠️ All articles in sources.json have already been processed.");
    return null;
  }
  return availableSources[Math.floor(Math.random() * availableSources.length)];
}

async function triggerDify(article, currentDate) {
  console.log(`📡 Triggering Dify for: ${article.name} (${article.url})`);
  try {
    const response = await axios.post(DIFY_API_URL, {
      inputs: {
        url: article.url,
        source_name: article.name,
        source_about: article.category,
        current_date: currentDate,
        rss_content: article.content || '',
        article_title: article.title || '',
      },
      response_mode: "blocking",
      user: "github-actions-bot"
    }, {
      headers: {
        'Authorization': `Bearer ${DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 300000 // 5分でタイムアウト
    });

    const output = response.data;
    const responseText = JSON.stringify(output);
    console.log("📥 Response received from Dify.");

    if (output.data && (output.data.status === "failed" || output.data.status === "error")) {
      console.error("❌ Dify Workflow failed internally:", output.data.error || output.data);
      return "ERROR";
    }

    if (responseText.includes("STALE")) {
      return "STALE";
    } else if (responseText.includes("STUDYING")) {
      return "STUDYING";
    } else {
      // 成功した場合、Difyの出力を抜き出してファイルとして保存する
      const outputs = output.data && output.data.outputs;
      if (outputs) {
        let articleContent = "";
        for (const key in outputs) {
          if (typeof outputs[key] === 'string' && outputs[key].length > 100) {
            articleContent = outputs[key];
          }
        }

        if (articleContent) {
          const timestamp = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14);
          const jsonFilename = path.join(__dirname, `../blog/articles/article_${timestamp}.json`);
          const webDataFilename = path.join(__dirname, `../web/src/data/articles/article_${timestamp}.json`);

          let bodyContent = articleContent;
          const bodyMatch = articleContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          if (bodyMatch && bodyMatch[1]) {
            bodyContent = bodyMatch[1];
          }

          // タイトルをDifyが生成したHTML内の<h1>から抽出する（より魅力的なタイトルになる）
          const h1Match = articleContent.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
          const extractedTitle = h1Match
            ? h1Match[1].replace(/<[^>]+>/g, '').trim()
            : `${article.name} の最新ニュースと活用法`;

          const articleData = {
            id: `article_${timestamp}`,
            title: extractedTitle,
            category: article.category || "ニュース",
            source_url: article.url,
            source_name: article.name,
            date: new Date().toISOString(),
            draft: false, // 公開記事として保存
            content: bodyContent,
            raw_html: articleContent
          };

          [jsonFilename, webDataFilename].forEach(f => {
            if (!fs.existsSync(path.dirname(f))) {
              fs.mkdirSync(path.dirname(f), { recursive: true });
            }
          });

          fs.writeFileSync(jsonFilename, JSON.stringify(articleData, null, 2), 'utf8');
          fs.writeFileSync(webDataFilename, JSON.stringify(articleData, null, 2), 'utf8');
          console.log(`✅ Saved generated article to ${jsonFilename}`);
          console.log(`✅ Also saved to web/src/data/articles for Vercel`);
        } else {
          console.log("⚠️ No valid article text found in Dify response outputs.");
        }
      }
      return "SUCCESS";
    }
  } catch (error) {
    console.error("❌ Dify API Error:", error.message);
    // 503等の一時的エラーもSTUDYING扱いにして次回リトライ
    return "STUDYING";
  }
}

async function main() {
  const state = loadState();
  const now = new Date();

  // 現在のJST日付を取得
  const jstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayJST = jstTime.toISOString().split('T')[0]; // YYYY-MM-DD

  console.log(`🕒 Current Time (JST): ${todayJST} ${jstTime.getUTCHours()}:${String(jstTime.getUTCMinutes()).padStart(2,'0')}`);

  // 日付が変わっていたら記事カウントとDify呼び出しカウントをリセット
  if (state.last_count_date !== todayJST) {
    console.log(`📅 New day detected (${todayJST}). Resetting counters.`);
    state.articles_today = 0;
    state.dify_calls_today = 0;
    state.last_count_date = todayJST;
  }

  const isManualRun = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';

  // --- Dify呼び出し上限チェック（Gemini無料枠保護）---
  if (!isManualRun && (state.dify_calls_today || 0) >= MAX_DIFY_CALLS_PER_DAY) {
    console.log(`🛑 Daily Dify call limit reached (${state.dify_calls_today}/${MAX_DIFY_CALLS_PER_DAY}). Skipping to protect Gemini quota.`);
    process.exit(0);
  }

  // --- 判定① pendingな記事がある？ ---
  if (state.pending_article) {
    console.log("⚠️ Found a pending article from a previous STUDYING/error state. Retrying...");
    state.dify_calls_today = (state.dify_calls_today || 0) + 1;
    const result = await triggerDify(state.pending_article, `${jstTime.getFullYear()}年${jstTime.getMonth() + 1}月${jstTime.getDate()}日`);

    if (result === "SUCCESS") {
      console.log("✅ Retry succeeded! Article published.");
      state.articles_today += 1;
      if (!state.processed_urls) state.processed_urls = [];
      state.processed_urls.push(state.pending_article.url); // ★ nullにする前にURLを記録
      state.pending_article = null;
    } else if (result === "STALE" || result === "ERROR") {
      console.log("⚠️ Pending article was STALE or ERROR. Discarding and freeing slot.");
      if (!state.processed_urls) state.processed_urls = [];
      state.processed_urls.push(state.pending_article.url); // ★ nullにする前にURLを記録
      state.pending_article = null;
    } else {
      console.log("⏳ Still STUDYING. Will retry at next 30-min slot.");
    }

    saveState(state);
    console.log(`💾 State saved. (Dify calls today: ${state.dify_calls_today}/${MAX_DIFY_CALLS_PER_DAY})`);
    return;
  }

  // --- 判定② 今日もう2記事作った？ ---
  if (!isManualRun && state.articles_today >= MAX_ARTICLES_PER_DAY) {
    console.log(`💤 Already generated ${MAX_ARTICLES_PER_DAY} articles today. Nothing to do.`);
    process.exit(0);
  }

  // --- 新規記事の処理 ---
  console.log(`📰 Starting new article (today: ${state.articles_today}/${MAX_ARTICLES_PER_DAY})...`);
  const article = pickRandomArticle(state);
  if (!article) {
    console.error("No unprocessed articles found in sources.json. Exiting.");
    process.exit(0);
  }

  const dateStringReadable = `${jstTime.getFullYear()}年${jstTime.getMonth() + 1}月${jstTime.getDate()}日`;
  state.dify_calls_today = (state.dify_calls_today || 0) + 1;
  const result = await triggerDify(article, dateStringReadable);

  if (result === "SUCCESS") {
    console.log("✅ Article published successfully!");
    state.articles_today += 1;
    state.pending_article = null;
    if (!state.processed_urls) state.processed_urls = [];
    state.processed_urls.push(article.url);
  } else if (result === "STALE") {
    console.log("⚠️ Article was STALE. Skipping (not counted, next run will try again).");
    if (!state.processed_urls) state.processed_urls = [];
    state.processed_urls.push(article.url);
  } else if (result === "ERROR") {
    console.log("⚠️ Internal Dify error. Discarding to avoid infinite loop.");
    if (!state.processed_urls) state.processed_urls = [];
    state.processed_urls.push(article.url);
  } else {
    console.log("⏳ STUDYING. Saving article as pending for next 30-min retry.");
    state.pending_article = article;
  }

  saveState(state);
  console.log(`💾 State saved. (Dify calls today: ${state.dify_calls_today}/${MAX_DIFY_CALLS_PER_DAY})`);
}

main();
