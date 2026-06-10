import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "最新海外ニュース速報＆気になるあれこれ自動収集",
  description: "AIが海外の最新ニュースや気になるトレンドを24時間365日自動で収集・翻訳し、ビジネスマン向けに分かりやすく解説する次世代型メディアです。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <div className="container">
            <a href="/" className="logo">
              <span className="robot-icon">🤖</span>
              Automation News
            </a>
            <p className="subtitle">最新海外ニュース速報＆気になるあれこれ自動収集</p>
          </div>
        </header>
        <main className="main-content">
          {children}
        </main>
        <footer className="site-footer">
          <div className="container">
            <p>&copy; {new Date().getFullYear()} Automation News. This site is fully automated by AI.</p>
            <p style={{ marginTop: "10px" }}>
              <a href="/preview" style={{ color: "var(--text-light)", fontSize: "0.8rem", textDecoration: "underline" }}>管理者用プレビュー画面</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
