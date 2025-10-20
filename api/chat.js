import 'dotenv/config';
import { OpenAI } from 'openai';

// ---- 固定FAQ（あとでRAGに差し替え前提）----
const KB = [
  { title: "会社情報・事業内容", body: "local hack合同会社は岩手県釜石市を基盤に、地域企業のデジタル支援やオンラインスクール運営を行っています。" },
  { title: "生成AI/ChatGPT支援", body: "生成AI導入、プロンプト設計、GAS連携、運用SOPの設計まで伴走支援します。" },
  { title: "問い合わせ方法", body: "フォーム／メール受付。個人情報は最小限で、見積や法務は担当者が最終確認します。" }
];

// ---- システムプロンプト（運用ルール厳守）----
const SYSTEM_PROMPT = `
あなたは「local hack合同会社」の公式アシスタントです。ユーザーの質問に対して、以下を守って答えてください。
1) 回答は日本語で簡潔に（3〜5行）まとめる。
2) 回答の根拠となる社内資料（記事タイトルやFAQ）を末尾に箇条書きで提示する。
3) 分からないことは無理に推測せず「分からない」と答え、担当窓口への転送案内を行う。
4) 個人情報や機密事項は必ず入力しないよう案内する。
`;

// ---- CORSの許可（STUDIOの公開ドメインに置き換えが安全）----
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

export default async function handler(req, res) {
  // CORSヘッダ
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const userMessage = (body?.message || '').toString().slice(0, 2000);

    // まずはFAQ全文を渡す（PoC）。後でRAGに置換。
    const refs = KB.map(k => `・${k.title}`).join('\n');
    const text = KB.map(k => `【${k.title}】\n${k.body}`).join('\n\n');

    const userPrompt = `
【ユーザー質問】:
${userMessage}

【参考テキスト（社内FAQ抜粋）】:
${text}

上記のポリシーと参考を踏まえ、3〜5行で回答し、末尾に「根拠（タイトルのみ）」を箇条書きで示してください。
`;

    // ---- Responses API（出力はtext形式を想定）----
    const resp = await openai.responses.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ]
    });

    // SDK v4のResponsesは出力抽出用のユーティリティがあるが、ここではざっくり取得
    const answer =
      resp.output_text ||
      resp?.output?.[0]?.content?.[0]?.text ||
      '分からない';

    return res.status(200).json({ ok: true, answer, refs });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}

