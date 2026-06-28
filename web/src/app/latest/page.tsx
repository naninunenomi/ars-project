import { getAllArticles } from "../../lib/articles";
import Link from "next/link";
import MermaidInit from "../../components/MermaidInit";

// noteの株情報の下に常設する「固定URL」。常に最新の深掘り記事を表示する。
// （Vercelは記事公開ごとに再ビルドされるため、/latest は常に最新になる）
export default function LatestPage() {
  const article = getAllArticles(false)[0];

  if (!article) {
    return (
      <div className="container">
        <p className="empty">まだ記事がありません。まもなく自動で公開されます。</p>
      </div>
    );
  }

  return (
    <div className="container">
      <Link href="/" className="back-link">← トップへ</Link>
      <p className="pr-note">※本ページはプロモーション（広告・アフィリエイトリンク）を含みます。</p>

      <div className="article-head">
        <span className="cat">{article.category}</span>
        <h1>{article.title}</h1>
        <div className="meta">{new Date(article.date).toLocaleDateString("ja-JP")}</div>
      </div>

      <MermaidInit />
      <div
        className="article-body"
        dangerouslySetInnerHTML={{ __html: article.content }}
      />
    </div>
  );
}
