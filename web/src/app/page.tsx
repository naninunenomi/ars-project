import Link from "next/link";
import { Article, getFeaturedArticles, getRegularArticles } from "../lib/articles";

export default function Home() {
  const featured = getFeaturedArticles();
  const recent = getRegularArticles();

  // アーカイブ用に「年 → 月 → 記事」へグループ分け
  const byYear: Record<number, Record<number, Article[]>> = {};
  for (const a of recent) {
    const d = new Date(a.date);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    byYear[y] ??= {};
    byYear[y][m] ??= [];
    byYear[y][m].push(a);
  }
  const years = Object.keys(byYear).map(Number).sort((x, y) => y - x);

  return (
    <>
      <section className="hero">
        <div className="container">
          <span className="hero-tag">🎧 スマートに、聴くニュースの深掘り版</span>
          <h1>ニュースの裏側と、お金・経済を一歩深く。</h1>
          <p>
            忙しい人のための「kijicast（きじとじじ）」が、毎日のニュースをもう一歩深掘り。<br />
            耳で追ったその先を、文字でじっくり解説します。
          </p>
        </div>
      </section>

      <div className="container">
        {featured.length > 0 && (
          <section className="featured-section">
            <h2 className="section-title">✨ おすすめ・特集</h2>
            <div className="featured-grid">
              {featured.map((a) => (
                <Link key={a.id} href={`/articles/${a.id}`} className="featured-card">
                  <span className="label">特集</span>
                  <div className="title">{a.title}</div>
                  <div className="desc">{a.category}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <h2 className="section-title">最新の深掘り記事</h2>
        {recent.length === 0 ? (
          <p className="empty">まだ記事がありません。まもなく自動で公開されます。</p>
        ) : (
          <ul className="post-list">
            {recent.slice(0, 10).map((a) => (
              <li key={a.id}>
                <Link href={`/articles/${a.id}`} className="post-card">
                  <span className="cat">{a.category}</span>
                  <div className="title">{a.title}</div>
                  <div className="meta">{new Date(a.date).toLocaleDateString("ja-JP")}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {years.length > 0 && (
          <section className="archive">
            <h2 className="section-title">📚 過去記事アーカイブ</h2>
            {years.map((y) => (
              <div key={y}>
                <div className="archive-year">{y}年</div>
                {Object.keys(byYear[y])
                  .map(Number)
                  .sort((a, b) => b - a)
                  .map((m) => (
                    <details key={m}>
                      <summary>
                        {m}月（{byYear[y][m].length}件）
                      </summary>
                      <ul className="month-items">
                        {byYear[y][m].map((a) => (
                          <li key={a.id}>
                            <span className="d">{new Date(a.date).getDate()}日</span>
                            <Link href={`/articles/${a.id}`}>{a.title}</Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}
