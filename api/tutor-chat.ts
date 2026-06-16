declare const process: {
  env: Record<string, string | undefined>;
};

type OptionKey = 'A' | 'B' | 'C' | 'D';
type ReviewStatus = 'correct' | 'incorrect' | 'not-attempted';

type VercelRequest = {
  method?: string;
  body?: unknown;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

type TutorRequestBody = {
  question?: string;
  options?: Record<OptionKey, string>;
  correctAnswer?: OptionKey;
  selectedAnswer?: OptionKey;
  status?: ReviewStatus;
  explanation?: string;
  userMessage?: string;
  messages?: Array<{ role?: 'user' | 'assistant'; text?: string }>;
};

const DEFAULT_MODEL = 'gemini-3.5-flash';
const MAX_HISTORY_MESSAGES = 8;

function parseBody(body: unknown): TutorRequestBody {
  if (typeof body === 'string') {
    return JSON.parse(body) as TutorRequestBody;
  }

  return (body ?? {}) as TutorRequestBody;
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

function validateRequest(body: TutorRequestBody) {
  if (!body.question?.trim()) {
    return 'Question text is missing.';
  }

  if (!body.options || !body.correctAnswer || !body.options[body.correctAnswer]) {
    return 'Question options or correct answer are missing.';
  }

  if (!body.userMessage?.trim()) {
    return 'Ask a question before sending.';
  }

  return null;
}

function buildTutorPrompt(body: TutorRequestBody) {
  const options = body.options!;
  const selectedAnswer = body.selectedAnswer
    ? `${body.selectedAnswer}: ${options[body.selectedAnswer]}`
    : 'No answer selected';
  const correctAnswer = `${body.correctAnswer}: ${options[body.correctAnswer!]}`;
  const history = (body.messages ?? [])
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => `${message.role === 'assistant' ? 'Tutor' : 'Student'}: ${message.text ?? ''}`)
    .join('\n');

  return `You are an exam-practice AI Tutor inside Entry Test Quiz.

Help the student understand one MCQ. Be concise, clear, and supportive.

Question:
${body.question}

Options:
A: ${options.A}
B: ${options.B}
C: ${options.C}
D: ${options.D}

Student selected: ${selectedAnswer}
Correct answer: ${correctAnswer}
Status: ${body.status ?? 'unknown'}
Provided explanation: ${body.explanation || 'No explanation was provided.'}

Recent chat:
${history || 'No previous chat.'}

Student message:
${body.userMessage}

Rules:
- Keep the answer short by default.
- If the student asks for a hint, give a clue without revealing the final answer first.
- If the student asks for steps, explain in 2 to 5 numbered steps with short labels, like "1. Key idea:".
- If the student asks why their answer is wrong, compare the selected answer with the correct answer.
- If the student asks to verify reasoning, evaluate the reasoning and correct only the mistaken part.
- Do not introduce unrelated topics.
- Use simple language for entry-test practice.
- Prefer plain text in a natural chatbot tone.
- Do not write full sentences in uppercase.
- Do not use Markdown bold, italic, headings, tables, or decorative formatting.
- End with one short check question only when it helps.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).json({});
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST to ask the AI Tutor.' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'AI Tutor is not configured. Add GEMINI_API_KEY in your local .env file or Vercel Environment Variables.',
    });
  }

  try {
    const body = parseBody(req.body);
    const validationError = validateRequest(body);

    if (validationError) {
      return res.status(400).json({ error: validationError });
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
              parts: [{ text: buildTutorPrompt(body) }],
            },
          ],
          generationConfig: {
            temperature: 0.25,
          },
        }),
      },
    );

    const responseBody = await geminiResponse.json();

    if (!geminiResponse.ok) {
      const errorMessage =
        typeof responseBody?.error?.message === 'string'
          ? responseBody.error.message
          : 'AI Tutor could not answer right now.';
      return res.status(geminiResponse.status).json({ error: errorMessage });
    }

    const reply = getGeminiOutputText(responseBody);
    if (!reply) {
      return res.status(422).json({ error: 'AI Tutor did not return a helpful answer. Try again.' });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unexpected AI Tutor error.',
    });
  }
}
