import Link from "next/link";
import { getAllArticles } from "../../lib/articles";

export default function PreviewPage() {
  // Fetch ALL articles including drafts
  const articles = getAllArticles(true);
  const drafts = articles.filter(a => a.draft);
  const published = articles.filter(a => !a.draft);

  return (
    <div className="container" style={{ padding: "60px 20px" }}>
      <h1 style={{ marginBottom: "20px" }}>🔒 管理者用プレビュー画面</h1>
      <p style={{ marginBottom: "40px", color: "var(--text-body)" }}>
        このページは公開前の下書き記事（Draft）を確認するための画面です。
        記事を本公開するには、対象ファイルの <code>draft: true</code> を <code>false</code> に変更してコミットしてください。
      </p>

      <h2 style={{ color: "#ef4444", marginBottom: "20px", borderBottom: "2px solid #ef4444", paddingBottom: "10px" }}>
        下書き一覧（{drafts.length}件）
      </h2>
      
      <div style={{ display: "grid", gap: "15px", marginBottom: "60px" }}>
        {drafts.length === 0 ? (
          <p>下書きの記事はありません。</p>
        ) : (
          drafts.map(article => (
            <div key={article.id} className="card" style={{ padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span className="badge" style={{ background: "#fee2e2", color: "#ef4444", borderColor: "#fca5a5", marginBottom: "10px" }}>下書き</span>
                <h3 style={{ fontSize: "1.2rem", margin: "5px 0" }}>{article.title}</h3>
                <p style={{ fontSize: "0.9rem", color: "var(--text-light)" }}>ファイル名: {article.id}.json</p>
              </div>
              <Link href={`/articles/${article.id}`} className="btn-primary" style={{ padding: "8px 20px" }}>
                プレビューを見る
              </Link>
            </div>
          ))
        )}
      </div>

      <h2 style={{ color: "var(--brand-primary)", marginBottom: "20px", borderBottom: "2px solid var(--border-light)", paddingBottom: "10px" }}>
        公開済み一覧（{published.length}件）
      </h2>
      
      <div style={{ display: "grid", gap: "15px" }}>
        {published.length === 0 ? (
          <p>公開済みの記事はありません。</p>
        ) : (
          published.map(article => (
            <div key={article.id} className="card" style={{ padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span className="badge" style={{ background: "#dcfce7", color: "#16a34a", borderColor: "#bbf7d0", marginBottom: "10px" }}>公開中</span>
                <h3 style={{ fontSize: "1.2rem", margin: "5px 0" }}>{article.title}</h3>
              </div>
              <Link href={`/articles/${article.id}`} style={{ color: "var(--brand-primary)", fontWeight: "bold" }}>
                記事を見る →
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
