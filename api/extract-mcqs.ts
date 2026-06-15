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

type ExtractRequestBody = {
  task?: 'extract-paper' | 'generate-from-lecture';
  questionCount?: number;
  fileName?: string;
  pageCount?: number;
  sourceType?: 'text' | 'images';
  text?: string;
  images?: string[];
};

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

const DEFAULT_MODEL = 'gemini-3.5-flash';
const MAX_TEXT_CHARS = 120_000;
const MAX_IMAGES = 10;
const MIN_LECTURE_QUESTION_COUNT = 5;
const MAX_LECTURE_QUESTION_COUNT = 50;

function parseBody(body: unknown): ExtractRequestBody {
  if (typeof body === 'string') {
    return JSON.parse(body) as ExtractRequestBody;
  }

  return (body ?? {}) as ExtractRequestBody;
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

function getInlineImagePart(imageUrl: string): GeminiPart {
  const match = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (!match) {
    throw new Error('An uploaded paper image was not in the expected format.');
  }

  return {
    inline_data: {
      mime_type: match[1],
      data: match[2],
    },
  };
}

function validateRequest(body: ExtractRequestBody) {
  if (body.sourceType === 'text') {
    if (!body.text?.trim()) {
      return 'No readable PDF text was received.';
    }

    return null;
  }

  if (body.sourceType === 'images') {
    if (!Array.isArray(body.images) || body.images.length === 0) {
      return 'No paper images were received.';
    }

    if (body.images.length > MAX_IMAGES) {
      return `Please upload ${MAX_IMAGES} pages or fewer.`;
    }

    return null;
  }

  return 'Unsupported extraction source.';
}

function getSafeLectureQuestionCount(questionCount: unknown) {
  if (typeof questionCount !== 'number' || !Number.isFinite(questionCount)) {
    return 10;
  }

  return Math.min(MAX_LECTURE_QUESTION_COUNT, Math.max(MIN_LECTURE_QUESTION_COUNT, Math.round(questionCount)));
}

function buildPrompt(task: ExtractRequestBody['task'], sourceLabel: string, questionCount: number) {
  if (task === 'generate-from-lecture') {
    return `${sourceLabel}.

Generate ${questionCount} multiple-choice questions for Entry Test Quiz using ONLY the uploaded lecture slide content.

Return ONLY MCQs in exactly this format:

Q: Question text
A: First option
B: Second option
C: Third option
D: Fourth option
ANSWER: A
REASON: Short explanation from the slide content when useful

Rules:
- Use only facts, definitions, examples, and concepts visible in the uploaded slides.
- Do not use outside knowledge, assumptions, or general textbook information.
- Generate exactly ${questionCount} MCQs if the slides contain enough material.
- If the slides do not contain enough material, generate the best possible number without inventing content.
- Include exactly four options for every question.
- Make distractors plausible but clearly wrong based on the slide content.
- Use ANSWER as one letter only: A, B, C, or D.
- Add REASON when it helps the student review the slide concept.
- Leave one blank line between questions.
- Do not add headings, numbering, markdown, summaries, or extra text.`;
  }

  return `${sourceLabel}.

Convert the paper into MCQs for Entry Test Quiz.

Return ONLY MCQs in exactly this format:

Q: Question text
A: First option
B: Second option
C: Third option
D: Fourth option
ANSWER: A
REASON: Short explanation when useful

Rules:
- Create only questions that have enough information to form four options.
- If an answer key is present, use it.
- If no answer key is present, solve the question and choose the best answer.
- Include exactly four options for every question.
- Use ANSWER as one letter only: A, B, C, or D.
- REASON is optional, but add a short reason when it helps review.
- Leave one blank line between questions.
- Do not add headings, numbering, markdown, or extra text.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).json({});
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST to extract MCQs from an uploaded paper.' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'AI extraction is not configured. Add GEMINI_API_KEY in your local .env file or Vercel Environment Variables.',
    });
  }

  try {
    const body = parseBody(req.body);
    const validationError = validateRequest(body);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const task = body.task === 'generate-from-lecture' ? 'generate-from-lecture' : 'extract-paper';
    const questionCount = getSafeLectureQuestionCount(body.questionCount);
    const sourceLabel =
      body.sourceType === 'text'
        ? `${task === 'generate-from-lecture' ? 'Lecture slide PDF text' : 'PDF text'} from ${
            body.fileName || 'uploaded file'
          }`
        : `${task === 'generate-from-lecture' ? 'Lecture slide images' : 'Paper images'} from ${
            body.fileName || 'uploaded file'
          }`;
    const parts: GeminiPart[] = [{ text: buildPrompt(task, sourceLabel, questionCount) }];

    if (body.sourceType === 'text') {
      parts.push({ text: body.text!.slice(0, MAX_TEXT_CHARS) });
    } else {
      body.images!.slice(0, MAX_IMAGES).forEach((imageUrl) => {
        parts.push(getInlineImagePart(imageUrl));
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
              parts,
            },
          ],
          generationConfig: {
            temperature: 0.2,
          },
        }),
      },
    );

    const responseBody = await geminiResponse.json();

    if (!geminiResponse.ok) {
      const errorMessage =
        typeof responseBody?.error?.message === 'string'
          ? responseBody.error.message
          : 'Gemini could not extract MCQs from this paper.';
      return res.status(geminiResponse.status).json({ error: errorMessage });
    }

    const mcqText = stripCodeFences(getGeminiOutputText(responseBody));
    if (!mcqText || !/^q\s*:/im.test(mcqText) || !/^answer\s*:/im.test(mcqText)) {
      return res.status(422).json({
        error: 'AI could not find quiz-ready MCQs in this paper. Try a clearer file or paste the questions manually.',
      });
    }

    return res.status(200).json({ mcqText });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unexpected paper extraction error.',
    });
  }
}
