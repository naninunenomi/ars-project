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

// Get the path to the blog/articles directory relative to the web project
const ARTICLES_DIR = path.join(process.cwd(), '../blog/articles');

export function getAllArticles(includeDrafts: boolean = false): Article[] {
  if (!fs.existsSync(ARTICLES_DIR)) {
    return [];
  }

  const fileNames = fs.readdirSync(ARTICLES_DIR).filter(file => file.endsWith('.json'));
  
  const articles = fileNames.map(fileName => {
    const filePath = path.join(ARTICLES_DIR, fileName);
    const fileContents = fs.readFileSync(filePath, 'utf8');
    
    try {
      const data = JSON.parse(fileContents);
      return data as Article;
    } catch (e) {
      console.error(`Error parsing JSON from file ${fileName}`, e);
      return null;
    }
  })
  .filter((article): article is Article => article !== null) // filter out nulls
  .filter(article => includeDrafts ? true : !article.draft) // filter drafts
  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // sort by date

  return articles;
}

export function getArticleById(id: string): Article | null {
  const articles = getAllArticles(true);
  return articles.find(article => article.id === id) || null;
}
