declare const process: {
  env: Record<string, string | undefined>;
};

type VercelRequest = {
  method?: string;
  body?: unknown;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

type FormatRequestBody = {
  text?: string;
};

const DEFAULT_MODEL = 'gemini-3.5-flash';
const MAX_AUTO_FORMAT_CHARS = 60_000;

function parseBody(body: unknown): FormatRequestBody {
  if (typeof body === 'string') {
    return JSON.parse(body) as FormatRequestBody;
  }

  return (body ?? {}) as FormatRequestBody;
}

function stripCodeFences(text: string) {
  return text
    .trim()
    .replace(/^```(?:text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function getGeminiOutputText(responseBody: unknown) {
  const body = responseBody as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
  };

  if (Array.isArray(body.candidates)) {
    return body.candidates
      .flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();
  }

  return '';
}

function buildFormatPrompt(text: string) {
  return `Convert this pasted quiz text into Entry Test Quiz MCQ format.

Output ONLY MCQs. Do not explain.

Required format:
Q: Question text
A: First option
B: Second option
C: Third option
D: Fourth option
ANSWER: A
REASON: Optional short explanation

Rules:
- Accept messy input from ChatGPT, Word/PDF copy, notes, or papers.
- Remove intro/outro text like "Here are your questions", "Sure", "Let me know", headings, numbering, code fences, and markdown.
- Remove markdown markers such as **bold**, *italic*, bullets, blockquotes, and extra symbols.
- Normalize labels such as q, question, a), (A), A., option A, 1), ans, correct, correct option, answer is.
- Preserve explanations from reason, explanation, solution, because, or rationale when present.
- Keep multiline question or explanation text when useful.
- Do not invent missing questions, options, or correct answers.
- If a question has no answer key, write ANSWER: ? so the app can ask the user to fix it.
- Every question must have Q, A, B, C, D, and ANSWER labels.
- Leave one blank line between questions.
- No headings, no numbering, no markdown, no extra text.

Pasted text:
${text.slice(0, MAX_AUTO_FORMAT_CHARS)}`;
}

function validateFormattedMcqs(mcqText: string) {
  if (!/^Q\s*:/im.test(mcqText)) {
    return 'Auto Format did not find any questions.';
  }

  if (!/^A\s*:/im.test(mcqText) || !/^B\s*:/im.test(mcqText) || !/^C\s*:/im.test(mcqText) || !/^D\s*:/im.test(mcqText)) {
    return 'Auto Format could not identify four options.';
  }

  if (!/^ANSWER\s*:/im.test(mcqText)) {
    return 'Auto Format could not identify answer labels.';
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).json({});
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST to auto-format MCQs.' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Auto Format is not configured. Add GEMINI_API_KEY in your local .env file or Vercel Environment Variables.',
    });
  }

  try {
    const body = parseBody(req.body);
    const sourceText = body.text?.trim() ?? '';

    if (!sourceText) {
      return res.status(400).json({ error: 'Paste question text before using Auto Format.' });
    }

    if (sourceText.length > MAX_AUTO_FORMAT_CHARS) {
      return res.status(413).json({
        error: `This paste is too large. Please keep it under ${Math.round(MAX_AUTO_FORMAT_CHARS / 1000)}k characters.`,
      });
    }

    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: buildFormatPrompt(sourceText) }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
          },
        }),
      },
    );

    const responseBody = await geminiResponse.json();

    if (!geminiResponse.ok) {
      const errorMessage =
        typeof responseBody?.error?.message === 'string'
          ? responseBody.error.message
          : 'Auto Format could not repair this paste right now.';
      return res.status(geminiResponse.status).json({ error: errorMessage });
    }

    const mcqText = stripCodeFences(getGeminiOutputText(responseBody));
    const validationError = validateFormattedMcqs(mcqText);

    if (validationError) {
      return res.status(422).json({ error: validationError });
    }

    return res.status(200).json({ mcqText });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unexpected Auto Format error.',
    });
  }
}
