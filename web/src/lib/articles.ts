import fs from 'fs';
import path from 'path';

export interface Article {
  id: string;
  title: string;
  category: string;
  source_url: string;
  source_name: string;
  date: string;
  draft: boolean;
  content: string;
}

// JSONファイルが入るディレクトリ（手動作成・trigger.js経由）
const JSON_ARTICLES_DIR = path.join(process.cwd(), 'src/data/articles');

// DifyがGitHub API経由で直接保存するHTMLファイルのディレクトリ
// Vercelビルド時に prebuild スクリプトで src/data/articles/ にコピーされるため、同じディレクトリを読む
const HTML_ARTICLES_DIR = path.join(process.cwd(), 'src/data/articles');

/** 記事本文の共通クリーンアップ処理 */
function cleanArticleContent(content: string): string {
  // ダミー広告・フッターを削除
  content = content.replace(/<div class="ad-section"[\s\S]*?<\/div>/gi, '');
  content = content.replace(/この記事を読んで自動化を始めたくなった方へ[\s\S]*?ConoHa/gi, '');
  content = content.replace(/© 202[0-9] Automation News\. All rights reserved\./gi, '');
  content = content.replace(/<hr\s*\/?>\s*$/i, '');

  // 長いURLのテキストを「引用元を見る」に置換（スマホでの横はみ出し対策）
  // <a href="...">https://long-url...</a> → <a href="...">引用元を見る</a>
  content = content.replace(
    /<a(\s[^>]*)?>https?:\/\/[^<]{20,}<\/a>/gi,
    (match) => {
      const hrefMatch = match.match(/href="([^"]+)"/);
      const href = hrefMatch ? hrefMatch[1] : '#';
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">引用元を見る</a>`;
    }
  );

  return content;
}

/** HTMLファイルからメタデータと本文を抽出する */
function parseHtmlArticle(fileName: string, fileContents: string): Article | null {
  try {
    // タイトル: <h1> タグから取得
    const h1Match = fileContents.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : fileName.replace('.html', '');

    // 引用元URL: <a href="..."> 内の href を取得
    const urlMatch = fileContents.match(/引用元.*?href="([^"]+)"/);
    const source_url = urlMatch ? urlMatch[1] : '';

    // ソース名: 引用元ソース: の後のテキスト
    const sourceMatch = fileContents.match(/引用元ソース.*?<\/strong>\s*(.*?)<br/);
    const source_name = sourceMatch ? sourceMatch[1].replace(/<[^>]+>/g, '').trim() : title;

    // 日付: ファイル名 article_YYYYMMDD_HHMMSS から抽出
    const dateMatch = fileName.match(/article_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
    let date = new Date().toISOString();
    if (dateMatch) {
      date = new Date(
        `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T${dateMatch[4]}:${dateMatch[5]}:${dateMatch[6]}+09:00`
      ).toISOString();
    }

    // カテゴリ: デフォルトは「テクノロジー」
    const category = 'テクノロジー';

    // 本文: <body> タグ全体（なければファイル全体）
    const bodyMatch = fileContents.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const rawContent = bodyMatch ? bodyMatch[1] : fileContents;
    const content = cleanArticleContent(rawContent);

    return {
      id: fileName.replace('.html', ''),
      title,
      category,
      source_url,
      source_name,
      date,
      draft: false,
      content,
    };
  } catch (e) {
    console.error(`Error parsing HTML file ${fileName}`, e);
    return null;
  }
}

/** JSONファイルからArticleを読み込む */
function loadJsonArticles(includeDrafts: boolean): Article[] {
  if (!fs.existsSync(JSON_ARTICLES_DIR)) return [];

  return fs.readdirSync(JSON_ARTICLES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(fileName => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(JSON_ARTICLES_DIR, fileName), 'utf8'));
        const article = data as Article;

        // 古い記事のタイトルが「〇〇 の最新ニュースと活用法」形式なら、本文のh1から再取得を試みる
        const isGenericTitle = article.title && /の最新ニュースと活用法$/.test(article.title);
        if (isGenericTitle && article.content) {
          const h1Match = article.content.match(/<h1[^>]*>([\/\s\S]*?)<\/h1>/i);
          if (h1Match) {
            const extracted = h1Match[1].replace(/<[^>]+>/g, '').trim();
            if (extracted && extracted.length > 5) article.title = extracted;
          }
        }

        // 本文のURLも長さ修正を適用
        if (article.content) {
          article.content = cleanArticleContent(article.content);
        }

        return article;
      } catch {
        return null;
      }
    })
    .filter((a): a is Article => a !== null)
    .filter(a => includeDrafts || !a.draft);
}

/** HTMLファイル（Dify直接保存）からArticleを読み込む */
function loadHtmlArticles(): Article[] {
  if (!fs.existsSync(HTML_ARTICLES_DIR)) return [];

  return fs.readdirSync(HTML_ARTICLES_DIR)
    .filter(f => f.endsWith('.html'))
    .map(fileName => {
      try {
        const contents = fs.readFileSync(path.join(HTML_ARTICLES_DIR, fileName), 'utf8');
        return parseHtmlArticle(fileName, contents);
      } catch {
        return null;
      }
    })
    .filter((a): a is Article => a !== null);
}

export function getAllArticles(includeDrafts: boolean = false): Article[] {
  const jsonArticles = loadJsonArticles(includeDrafts);
  const htmlArticles = loadHtmlArticles(); // HTMLは常に公開扱い

  // IDが重複しないようにマージ（JSON優先）
  const jsonIds = new Set(jsonArticles.map(a => a.id));
  const uniqueHtmlArticles = htmlArticles.filter(a => !jsonIds.has(a.id));

  return [...jsonArticles, ...uniqueHtmlArticles]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getArticleById(id: string): Article | null {
  return getAllArticles(true).find(a => a.id === id) || null;
}
