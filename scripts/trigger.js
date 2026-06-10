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

async function triggerDify(article, currentDate) {
  console.log(`📡 Triggering Dify for: ${article.name} (${article.url})`);
  try {
    const response = await axios.post(DIFY_API_URL, {
      inputs: {
        url: article.url,
        source_name: article.name,
        source_about: article.category,
        current_date: currentDate
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
      // エラーの場合は無限ループを防ぐため、リトライせず破棄する（次の時間に別の新しい記事を探させる）
      return "ERROR";
    }

    if (responseText.includes("STALE")) {
      return "STALE";
    } else if (responseText.includes("STUDYING")) {
      return "STUDYING";
    } else {
      // 成功した場合、Difyの出力（記事本文）を抜き出してHTMLファイルとして保存する
      const outputs = output.data && output.data.outputs;
      if (outputs) {
        let articleContent = "";
        // outputsの中で一番文字数が長いものを「記事本文」とみなして取得
        for (const key in outputs) {
          if (typeof outputs[key] === 'string' && outputs[key].length > 100) {
            articleContent = outputs[key];
          }
        }
        
        if (articleContent) {
          const timestamp = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14); // YYYYMMDDHHMMSS
          const jsonFilename = path.join(__dirname, `../blog/articles/article_${timestamp}.json`);
          const webDataFilename = path.join(__dirname, `../web/src/data/articles/article_${timestamp}.json`);

          // HTMLから本文部分だけをざっくり抽出（<body>タグの中身）
          let bodyContent = articleContent;
          const bodyMatch = articleContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          if (bodyMatch && bodyMatch[1]) {
            bodyContent = bodyMatch[1];
          }

          // Next.js用にメタデータ付きのJSONとして保存
          const articleData = {
            id: `article_${timestamp}`,
            title: `${article.name} の最新ニュースと活用法`,
            category: article.category || "ニュース",
            source_url: article.url,
            source_name: article.name,
            date: new Date().toISOString(),
            draft: true, // プレビュー用の下書きフラグ（最初は非公開）
            content: bodyContent,
            raw_html: articleContent // 元データも念のため保持
          };
          
          // ディレクトリが存在しない場合は作成
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
    // API呼び出し自体が失敗した場合（503等）はSTUDYINGと同じ扱いにして次回リトライ
    return "STUDYING"; 
  }
}

async function main() {
  const state = loadState();
  const now = new Date();
  
  // 現在のJST時間を取得（UTC + 9時間）
  const jstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const currentHourJST = jstTime.getUTCHours();
  const dateStringJST = jstTime.toISOString().split('T')[0]; // YYYY-MM-DD in JST

  console.log(`🕒 Current Time (JST): ${dateStringJST} ${currentHourJST}:00`);

  let articleToProcess = state.pending_article;
  let isRetry = false;

  const isManualRun = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';

  // ウィンドウ判定 (朝の部: 8~11時台, 夜の部: 18~21時台)
  const isMorningWindow = currentHourJST >= 8 && currentHourJST <= 11;
  const isEveningWindow = currentHourJST >= 18 && currentHourJST <= 21;
  const currentWindow = isMorningWindow ? 'MORNING' : (isEveningWindow ? 'EVENING' : 'NONE');
  const currentWindowKey = `${dateStringJST}-${currentWindow}`;

  if (articleToProcess) {
    console.log("⚠️ Found a pending article from a previous STUDYING state. Retrying...");
    isRetry = true;
  } else {
    // 新規記事開始の判定
    let shouldStartNew = false;
    
    if (isManualRun) {
      console.log("👋 Manual run detected. Bypassing window lock!");
      shouldStartNew = true;
    } else if (currentWindow !== 'NONE') {
      // 現在のウィンドウ枠（例: 2026-06-07-MORNING）でまだ成功していなければスタート
      if (state.last_success_window_key !== currentWindowKey) {
        console.log(`🌟 Time to post a new article in the ${currentWindow} window! Picking a random source...`);
        shouldStartNew = true;
      }
    }

    if (shouldStartNew) {
      articleToProcess = pickRandomArticle();
      if (!articleToProcess) {
        console.error("No articles found in sources.json. Exiting.");
        process.exit(0);
      }
    } else {
      console.log("💤 No pending articles, and already completed (or outside) the current window. Exiting quickly.");
      process.exit(0); // 1秒で即帰宅！
    }
  }

  const dateStringReadable = `${jstTime.getFullYear()}年${jstTime.getMonth() + 1}月${jstTime.getDate()}日`;

  // Difyにリクエスト送信
  const result = await triggerDify(articleToProcess, dateStringReadable);

  if (result === "SUCCESS" || result === "STALE" || result === "ERROR") {
    if (result === "SUCCESS") console.log("✅ Article published successfully!");
    if (result === "STALE") console.log("⚠️ Article was STALE (too old). Skipping it.");
    if (result === "ERROR") console.log("⚠️ Article triggered an internal Dify error. Discarding to avoid infinite loop.");
    
    state.pending_article = null; // 保留を解除
    // 手動実行でなければ、成功したウィンドウを記録
    if (!isManualRun) {
      state.last_success_window_key = currentWindowKey;
    }
  } else if (result === "STUDYING") {
    console.log("⏳ ARS is STUDYING or API is busy. Saving state to retry in the next time slot.");
    state.pending_article = articleToProcess; // 保留状態として保存
  }

  // 状態を保存して終了
  saveState(state);
  console.log("💾 State saved.");
}

main();
