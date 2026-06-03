const fs = require('fs');
const path = require('path');
const axios = require('axios'); // Requires axios in package.json

const STATE_FILE = path.join(__dirname, '../blog/state.json');
const SOURCES_FILE = path.join(__dirname, '../blog/sources.json');

const DIFY_API_URL = process.env.DIFY_API_URL || 'https://api.dify.ai/v1/workflows/run';
const DIFY_API_KEY = process.env.DIFY_API_KEY;

if (!DIFY_API_KEY) {
  console.error("🚨 DIFY_API_KEY is not set.");
  process.exit(1);
}

// 状態を読み込む関数
function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (e) {
      console.error("Failed to parse state.json", e);
    }
  }
  return { pending_article: null };
}

// 状態を保存する関数
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// ランダムな記事をsources.jsonから選ぶ
function pickRandomArticle() {
  if (!fs.existsSync(SOURCES_FILE)) {
    console.error("🚨 sources.json not found!");
    return null;
  }
  const sources = JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf8'));
  if (sources.length === 0) return null;
  return sources[Math.floor(Math.random() * sources.length)];
}

async function triggerDify(article) {
  console.log(`📡 Triggering Dify for: ${article.name} (${article.url})`);
  try {
    const response = await axios.post(DIFY_API_URL, {
      inputs: {
        url: article.url,
        source_name: article.name,
        source_about: article.category
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

    if (responseText.includes("STALE")) {
      return "STALE";
    } else if (responseText.includes("STUDYING")) {
      return "STUDYING";
    } else {
      return "SUCCESS";
    }
  } catch (error) {
    console.error("❌ Dify API Error:", error.message);
    // API呼び出し自体が失敗した場合（503等）はSTUDYINGと同じ扱いにして次回リトライ
    return "STUDYING"; 
  }
}

async function main() {
  const state = loadState();
  const now = new Date();
  
  // 現在のUTC時間を取得（JST = UTC + 9）
  const currentHourUTC = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();

  console.log(`🕒 Current Time (UTC): ${currentHourUTC}:${currentMinute}`);

  let articleToProcess = state.pending_article;
  let isRetry = false;

  if (articleToProcess) {
    console.log("⚠️ Found a pending article from a previous STUDYING state. Retrying...");
    isRetry = true;
  } else {
    // 新規記事のトリガー時間かどうかを判定
    // UTC 23:00 (JST 08:00) または UTC 09:00 (JST 18:00) の「ぴったり（0〜15分）」の場合のみ新規スタート
    const isNewArticleWindow = (currentHourUTC === 23 || currentHourUTC === 9) && currentMinute < 15;

    if (isNewArticleWindow) {
      console.log("🌟 Time to post a new article! Picking a random source...");
      articleToProcess = pickRandomArticle();
      if (!articleToProcess) {
        console.error("No articles found in sources.json. Exiting.");
        process.exit(0);
      }
    } else {
      console.log("💤 Not a new article window, and no pending articles. Exiting quickly to save free minutes!");
      process.exit(0); // 1秒で即帰宅！
    }
  }

  // Difyにリクエスト送信
  const result = await triggerDify(articleToProcess);

  if (result === "SUCCESS") {
    console.log("✅ Article published successfully!");
    state.pending_article = null; // 成功したので保留を解除
  } else if (result === "STALE") {
    console.log("⚠️ Article was STALE (too old). Skipping it.");
    state.pending_article = null; // STALEなので諦める
  } else if (result === "STUDYING") {
    console.log("⏳ ARS is STUDYING or API is busy. Saving state to retry in the next time slot.");
    state.pending_article = articleToProcess; // 保留状態として保存
  }

  // 状態を保存して終了
  saveState(state);
  console.log("💾 State saved.");
}

main();
