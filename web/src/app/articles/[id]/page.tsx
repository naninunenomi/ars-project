import { getArticleById, getAllArticles } from "../../../lib/articles";
import { notFound } from "next/navigation";
import Link from "next/link";
import MermaidInit from "../../../components/MermaidInit";

// Generate static parameters for build time
export function generateStaticParams() {
  const articles = getAllArticles(true); // Include drafts so they are built but hidden
  return articles.map((article) => ({ id: article.id }));
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const article = getArticleById(resolvedParams.id);

  if (!article) {
    notFound();
  }

  return (
    <div className="container">
      <Link href="/" className="back-link">← トップへ</Link>
      <p className="pr-note">※本ページはプロモーション（広告・アフィリエイトリンク）を含みます。</p>

      <div className="article-head">
        <span className="cat">{article.category}</span>
        {article.draft && (
          <span className="cat" style={{ color: "#ef4444", marginLeft: 8 }}>下書き</span>
        )}
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
