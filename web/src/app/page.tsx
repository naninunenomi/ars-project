import styles from "./page.module.css";
import Link from "next/link";
import { getAllArticles } from "../lib/articles";

// Home page shows both published and drafted articles when in dev (or when a preview mechanism is built)
// Since the user wants to preview safely, let's fetch ALL articles if we want a preview mode, 
// but for the public page, only published. For now, let's include drafts if process.env.NODE_ENV === 'development'.
// Actually, since this is a static site and we want a hidden preview, we can just display drafts on the home page during development, or build a separate /preview route.
// Let's just fetch published ones here, and maybe we build a /preview page later.

export default function Home() {
  // Fetch only published articles
  const articles = getAllArticles(false);

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.aiBadge}>
            <span className="robot-icon">✨</span>
            100% AI Generated Media
          </div>
          <h1 className={styles.heroTitle}>
            最新海外ニュース速報 ＆<br />
            <span className="text-gradient">気になるあれこれ自動収集</span>
          </h1>
          <p className={styles.heroSubtitle}>
            AIが24時間365日、世界中の最新トレンドやニュースを収集・翻訳。
            ビジネスマン向けに「どう活用すべきか」を分かりやすく解説します。
          </p>
          <div style={{ marginTop: "40px" }}>
            <Link href="#latest" className="btn-primary">
              最新記事を読む
            </Link>
          </div>
        </div>
      </section>

      <section id="latest" className="container">
        <h2 className={styles.sectionTitle}>最新の記事</h2>
        <div className={styles.grid}>
          {articles.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#666', gridColumn: '1 / -1' }}>
              現在公開されている記事はありません。新しい記事がAIによって自動生成されるのをお待ちください！
            </p>
          ) : (
            articles.map((article) => (
              <article key={article.id} className={`card ${styles.articleCard}`}>
                <div className={styles.articleCategory}>
                  <span className="badge">{article.category}</span>
                </div>
                <h3 className={styles.articleTitle}>
                  <Link href={`/articles/${article.id}`}>{article.title}</Link>
                </h3>
                <p className={styles.articleExcerpt}>
                  {article.source_name} からの最新ニュースを元にAIが考察・解説します。
                </p>
                <div className={styles.articleMeta}>
                  <span>{new Date(article.date).toLocaleDateString('ja-JP')}</span>
                  <Link href={`/articles/${article.id}`} className={styles.readMore}>続きを読む →</Link>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </>
  );
}
