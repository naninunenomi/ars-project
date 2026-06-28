import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "kijicast 深掘り｜ニュースの裏側と、お金・経済の深掘り解説",
  description:
    "忙しい人のための“読めて聞ける”ニュース「kijicast（きじとじじ）」の深掘り版。毎日のニュースから、経済・お金・キーワードを一歩深く、わかりやすく解説します。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <div className="container">
            <a href="/" className="logo">
              kiji<span className="accent">cast</span>
              <span className="sub">深掘り ｜ DEEP DIVE</span>
            </a>
            <nav className="nav">
              <a href="https://note.com/kijicast" target="_blank" rel="noopener noreferrer">note</a>
              <a href="https://open.spotify.com/episode/3yg5VtiStpKElxhUOje9Gb" target="_blank" rel="noopener noreferrer">Podcast</a>
            </nav>
          </div>
        </header>

        <main className="main-content">{children}</main>

        <footer className="site-footer">
          <div className="container">
            <div className="links">
              <a href="https://note.com/kijicast" target="_blank" rel="noopener noreferrer">きじとじじ（note）</a>
              <a href="https://open.spotify.com/episode/3yg5VtiStpKElxhUOje9Gb" target="_blank" rel="noopener noreferrer">Podcast（Spotify）</a>
            </div>
            <p className="copy">
              &copy; {new Date().getFullYear()} kijicast 深掘り ／ 本サイトはAIによる自動生成記事を含みます。内容の正確性には配慮していますが、最終判断はご自身でお願いします。
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
