const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const parser = new Parser();

// 信頼性の高い海外メディアのRSSフィード一覧
const FEEDS = [
  { url: 'https://techcrunch.com/feed/', name: 'TechCrunch', category: 'Technology / Startups' },
  { url: 'https://venturebeat.com/category/ai/feed/', name: 'VentureBeat', category: 'AI / Enterprise' },
  { url: 'https://www.wired.com/feed/rss', name: 'Wired', category: 'Technology / Culture' },
  { url: 'https://www.theverge.com/tech/rss/index.xml', name: 'The Verge', category: 'Consumer Tech' }
];

const MAX_ITEMS_PER_FEED = 5; // 各フィードから取得する最新記事の数

async function fetchNews() {
  console.log('🔄 ニュースの自動収集を開始します...');
  const allArticles = [];

  for (const feed of FEEDS) {
    try {
      console.log(`📥 取得中: ${feed.name} (${feed.url})`);
      const parsed = await parser.parseURL(feed.url);
      
      // 最新の記事を取得
      const items = parsed.items.slice(0, MAX_ITEMS_PER_FEED);
      for (const item of items) {
        allArticles.push({
          url: item.link,
          name: feed.name,
          category: feed.category
        });
      }
      console.log(`✅ ${items.length}件の記事を取得しました: ${feed.name}`);
    } catch (error) {
      console.error(`❌ エラー: ${feed.name} の取得に失敗しました。`, error.message);
    }
  }

  // 取得した記事をランダムにシャッフルする
  for (let i = allArticles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allArticles[i], allArticles[j]] = [allArticles[j], allArticles[i]];
  }

  // blog/sources.json に保存
  const targetPath = path.join(__dirname, '../blog/sources.json');
  fs.writeFileSync(targetPath, JSON.stringify(allArticles, null, 2), 'utf8');

  console.log(`\n🎉 完了！ 合計 ${allArticles.length} 件の記事を blog/sources.json に保存しました。`);
  process.exit(0);
}

fetchNews().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
