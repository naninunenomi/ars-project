const TRACKING_ID = 'automationnew-22';

// カテゴリ・タイトルに応じてAmazonのベストセラーランキングページへ誘導する
// 確実に商品が存在するトップレベルカテゴリのURLを使用

interface RankingConfig {
  url: string;
  label: string;
  description: string;
  emoji: string;
}

function getRankingConfig(title: string, category: string): RankingConfig {
  const text = `${title} ${category}`.toLowerCase();

  // AI・機械学習・ChatGPT系 → コンピュータ・IT書籍
  if (
    text.includes('ai') || text.includes('人工知能') ||
    text.includes('chatgpt') || text.includes('gemini') ||
    text.includes('claude') || text.includes('llm') ||
    text.includes('機械学習') || text.includes('生成ai')
  ) {
    return {
      url: `https://www.amazon.co.jp/gp/bestsellers/books/466282/?tag=${TRACKING_ID}`,
      label: 'AI・コンピュータ書籍 売れ筋ランキングを見る',
      description: 'AIの波に乗り遅れないために。今最も読まれているIT・AI関連書籍のランキングです。',
      emoji: '🤖',
    };
  }

  // スタートアップ・起業・副業・個人開発 → ビジネス書全般（確実に商品あり）
  if (
    text.includes('スタートアップ') || text.includes('startup') ||
    text.includes('起業') || text.includes('独立') ||
    text.includes('副業') || text.includes('フリーランス') ||
    text.includes('個人開発') || text.includes('saas') ||
    text.includes('product hunt') || text.includes('hacker news')
  ) {
    return {
      url: `https://www.amazon.co.jp/gp/bestsellers/books/466284/?tag=${TRACKING_ID}`,
      label: '副業・起業 ビジネス書 売れ筋ランキングを見る',
      description: '副業・起業を始めたい方へ。今最も読まれているビジネス書のランキングです。',
      emoji: '🚀',
    };
  }

  // プログラミング・開発系 → コンピュータ・IT書籍
  if (
    text.includes('プログラミング') || text.includes('python') ||
    text.includes('javascript') || text.includes('コード') ||
    text.includes('開発') || text.includes('エンジニア')
  ) {
    return {
      url: `https://www.amazon.co.jp/gp/bestsellers/books/466282/?tag=${TRACKING_ID}`,
      label: 'プログラミング・IT書籍 売れ筋ランキングを見る',
      description: 'プログラミングを学びたい方へ。今最も売れているIT書籍のランキングです。',
      emoji: '💻',
    };
  }

  // マーケティング・SNS・集客系 → ビジネス書全般
  if (
    text.includes('マーケティング') || text.includes('sns') ||
    text.includes('twitter') || text.includes('instagram') ||
    text.includes('集客') || text.includes('ブランド')
  ) {
    return {
      url: `https://www.amazon.co.jp/gp/bestsellers/books/466284/?tag=${TRACKING_ID}`,
      label: 'マーケティング・ビジネス書 売れ筋ランキングを見る',
      description: 'ビジネスをもっと伸ばしたい方へ。今最も読まれているビジネス書のランキングです。',
      emoji: '📣',
    };
  }

  // セキュリティ・プライバシー系 → コンピュータ・IT書籍
  if (
    text.includes('セキュリティ') || text.includes('security') ||
    text.includes('ハッキング') || text.includes('プライバシー')
  ) {
    return {
      url: `https://www.amazon.co.jp/gp/bestsellers/books/466282/?tag=${TRACKING_ID}`,
      label: 'IT・セキュリティ書籍 売れ筋ランキングを見る',
      description: 'デジタル時代のリスク管理を学びたい方へ。今最も読まれているIT書籍のランキングです。',
      emoji: '🔐',
    };
  }

  // 自動化・業務効率化系 → ビジネス書全般
  if (
    text.includes('自動化') || text.includes('automation') ||
    text.includes('効率化') || text.includes('業務') ||
    text.includes('ツール') || text.includes('workflow')
  ) {
    return {
      url: `https://www.amazon.co.jp/gp/bestsellers/books/466284/?tag=${TRACKING_ID}`,
      label: 'ビジネス効率化 売れ筋ランキングを見る',
      description: '仕事をもっとラクにしたい方へ。今最も読まれているビジネス効率化の書籍です。',
      emoji: '⚡',
    };
  }

  // ガジェット・デバイス・ハードウェア系 → 家電ベストセラー（確実に商品あり）
  if (
    text.includes('ガジェット') || text.includes('デバイス') ||
    text.includes('iphone') || text.includes('android') ||
    text.includes('カメラ') || text.includes('ev') ||
    text.includes('電気自動車')
  ) {
    return {
      url: `https://www.amazon.co.jp/gp/bestsellers/electronics/?tag=${TRACKING_ID}`,
      label: '家電・ガジェット 売れ筋ランキングを見る',
      description: '最新ガジェットをチェックしたい方へ。今最も売れている家電・デジタル製品のランキングです。',
      emoji: '📱',
    };
  }

  // デフォルト → 和書全体のベストセラー（必ず商品あり）
  return {
    url: `https://www.amazon.co.jp/gp/bestsellers/books/?tag=${TRACKING_ID}`,
    label: 'ビジネス・IT書籍 売れ筋ランキングを見る',
    description: '今最も読まれているビジネス・テクノロジー書籍のランキングです。',
    emoji: '📚',
  };
}

interface AmazonAffiliateBoxProps {
  title: string;
  category: string;
}

export default function AmazonAffiliateBox({ title, category }: AmazonAffiliateBoxProps) {
  const config = getRankingConfig(title, category);

  return (
    <div style={{
      marginTop: '40px',
      padding: '24px',
      background: 'linear-gradient(135deg, #fff8f0 0%, #fff3e0 100%)',
      border: '1px solid #ffcc80',
      borderRadius: '12px',
    }}>
      <p style={{
        fontSize: '0.75rem',
        color: '#999',
        marginBottom: '12px',
        textTransform: 'uppercase',
        letterSpacing: '1px',
      }}>
        PR / 広告
      </p>
      <p style={{
        fontSize: '1rem',
        fontWeight: '600',
        marginBottom: '8px',
        color: '#333',
      }}>
        {config.emoji} この記事に関連するおすすめ書籍・商品
      </p>
      <p style={{
        fontSize: '0.9rem',
        color: '#666',
        marginBottom: '16px',
      }}>
        {config.description}
      </p>
      <a
        href={config.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          background: '#FF9900',
          color: '#fff',
          fontWeight: '700',
          borderRadius: '8px',
          textDecoration: 'none',
          fontSize: '0.95rem',
        }}
      >
        {config.label} →
      </a>
    </div>
  );
}
