require('dotenv').config();
const topic = "広告鑑定（一般法）";
async function test() {
    const key = process.env.GEMINI_API_KEY;
    const prompt = `テーマ「${topic}」について、世界最高峰の法学者として極限まで詳細なリファレンスマニュアルを作成せよ。\n\n2026年の最新ニュースを反映させ、全知全能のバイブルを完成させよ。`;
    console.log("Sending prompt...");
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}
test();
