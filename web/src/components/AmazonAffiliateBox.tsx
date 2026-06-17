import Link from 'next/link';

const TRACKING_ID = 'automationnew-22';

// 記事のカテゴリ・タイトルから最適なAmazon検索キーワードを生成
function getAmazonKeyword(title: string, category: string): string {
  const text = `${title} ${category}`.toLowerCase();

  if (text.includes('ai') || text.includes('人工知能') || text.includes('chatgpt') || text.includes('gemini') || text.includes('claude')) {
    return 'AI ビジネス活用';
  }
  if (text.includes('プログラミング') || text.includes('python') || text.includes('javascript') || text.includes('コード')) {
    return 'プログラミング 入門書';
  }
  if (text.includes('セキュリティ') || text.includes('security') || text.includes('ハッキング')) {
    return '情報セキュリティ';
  }
  if (text.includes('スタートアップ') || text.includes('startup') || text.includes('起業') || text.includes('ベンチャー')) {
    return '起業 ビジネス書';
  }
  if (text.includes('クラウド') || text.includes('aws') || text.includes('azure') || text.includes('gcp')) {
    return 'クラウド インフラ';
  }
  if (text.includes('ロボット') || text.includes('自動化') || text.includes('automation')) {
    return '業務自動化 効率化';
  }
  if (text.includes('sns') || text.includes('twitter') || text.includes('instagram') || text.includes('tiktok')) {
    return 'SNS マーケティング';
  }
  if (text.includes('ev') || text.includes('電気自動車') || text.includes('tesla')) {
    return 'EV 電気自動車';
  }
  // デフォルト
  return 'テクノロジー ビジネス書';
}

interface AmazonAffiliateBoxProps {
  title: string;
  category: string;
}

export default function AmazonAffiliateBox({ title, category }: AmazonAffiliateBoxProps) {
  const keyword = getAmazonKeyword(title, category);
  const encodedKeyword = encodeURIComponent(keyword);
  const affiliateUrl = `https://www.amazon.co.jp/s?k=${encodedKeyword}&tag=${TRACKING_ID}`;

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
        📚 この記事に関連するおすすめ書籍・商品
      </p>
      <p style={{
        fontSize: '0.9rem',
        color: '#666',
        marginBottom: '16px',
      }}>
        「{keyword}」に関連するAmazonのアイテムをチェックしてみましょう。
      </p>
      <a
        href={affiliateUrl}
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
        Amazonで「{keyword}」を見る →
      </a>
    </div>
  );
}
