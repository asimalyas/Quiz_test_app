import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import profileImageUrl from './asim-profile.png';
import './App.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type OptionKey = 'A' | 'B' | 'C' | 'D';
type Screen = 'paste' | 'quiz' | 'results';
type ReviewStatus = 'correct' | 'incorrect' | 'not-attempted';
type ResultFilter = 'all' | ReviewStatus;
type TimerMode = 'per-question' | 'full-test';
type AiImportTask = 'extract-paper' | 'generate-from-lecture';
type QuestionSource = 'manual' | 'paper-ai' | 'lecture-ai' | 'chatgpt';
type PdfExtractionStatus = 'idle' | 'extracting' | 'formatting' | 'ready' | 'error';
type AutoFormatStatus = 'idle' | 'formatting' | 'ready' | 'error';
type TutorRole = 'user' | 'assistant';
type TutorStatus = 'idle' | 'thinking' | 'error';

type Question = {
  id: string;
  prompt: string;
  options: Record<OptionKey, string>;
  answer: OptionKey;
  explanation?: string;
};

type ParseResult = {
  questions: Question[];
  errors: string[];
};

type QuizSession = {
  screen: Screen;
  questions: Question[];
  answers: Record<string, OptionKey>;
  timeSpent: Record<string, number>;
  timerMode: TimerMode;
  perQuestionSeconds?: number;
  fullTestSeconds?: number;
  remainingFullTestSeconds?: number;
  currentIndex: number;
  questionStartedAt: number;
  skippedQuestionIds: string[];
  activeSkippedQuestionId?: string;
  fullTestEndsAt?: number;
  completedAt?: number;
};

type PdfExtractionState = {
  status: PdfExtractionStatus;
  message: string;
  fileName?: string;
};

type TutorMessage = {
  id: string;
  role: TutorRole;
  text: string;
};

type TutorQuestionContext = {
  question: Question;
  index: number;
  status: ReviewStatus;
  selected?: OptionKey;
};

type AutoFormatState = {
  status: AutoFormatStatus;
  message: string;
  sourceText?: string;
  formattedText?: string;
};

const PROFILE_IMAGE_SRC = profileImageUrl;
const STORAGE_KEY = 'entry-test-quiz-session';
const LEGACY_STORAGE_KEY = 'hat-quick-quiz-session';
const DEFAULT_PER_QUESTION_SECONDS = 60;
const DEFAULT_FULL_TEST_SECONDS = 30 * 60;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_PDF_PAGES = 10;
const MAX_IMAGE_FILES = 10;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_LONG_EDGE = 1600;
const MIN_TEXT_EXTRACTION_CHARS = 120;
const MIN_LECTURE_QUESTION_COUNT = 5;
const MAX_LECTURE_QUESTION_COUNT = 50;
const MAX_AUTO_FORMAT_CHARS = 60_000;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PER_QUESTION_OPTIONS = [30, 45, 60, 90, 120];
const FULL_TEST_OPTIONS = [5, 10, 15, 30, 45, 60].map((minutes) => minutes * 60);
const NO_EXPLANATION_TEXT = 'No explanation was added for this question.';
const TUTOR_QUICK_ACTIONS = [
  'Give me a hint',
  'Explain step by step',
  'Why is my answer wrong?',
  'Verify my reasoning',
  'Give a similar example',
];
const CHATGPT_PROMPT = `Generate entry-test MCQs for the topic and number of questions that I provide.

Use exactly this format:

Q: Write the question here
A: First option
B: Second option
C: Third option
D: Fourth option
ANSWER: A
REASON: Add a short explanation only when useful

Rules:
- Provide exactly four options.
- Include only one correct answer.
- REASON is optional. Add it only for questions that need explanation.
- Leave one blank line between questions.
- Do not add headings, numbering, or extra text.
- Output only the MCQs so I can paste them directly into my quiz app.`;

const sampleQuestions = `Q: The sum of exterior angles of any polygon is:
A: 180
B: 270
C: 360
D: 540
ANSWER: C
REASON: The exterior angles of every polygon add up to one complete turn, which is 360 degrees.

q: Which test is commonly used for graduate admissions in Pakistan?
a: HAT
b: SAT Subject Test
c: GAT
d: IELTS
answer: C
explanation: GAT is commonly used for graduate admissions and scholarship screening.
It may appear in different versions depending on the program.

Q: What is 25 percent of 240?
A: 40
B: 60
C: 80
D: 100
ANSWER: B
REASON: 25 percent means one-fourth. One-fourth of 240 is 60.

Q: The synonym of "rapid" is:
A: Slow
B: Quick
C: Late
D: Weak
ANSWER: B`;

const emptyAnswers: Record<string, OptionKey> = {};

function makeQuestionId(index: number, prompt: string) {
  return `${index + 1}-${prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 36)}`;
}

function parseQuestions(input: string): ParseResult {
  const errors: string[] = [];
  const questions: Question[] = [];
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  let current:
    | {
        startLine: number;
        prompt?: string;
        options: Partial<Record<OptionKey, string>>;
        answer?: string;
        explanationLines: string[];
      }
    | null = null;
  let collectingExplanation = false;

  const finishCurrent = () => {
    if (!current) {
      return;
    }

    const questionNumber = questions.length + 1;
    const context = `Question starting on line ${current.startLine}`;
    const answer = current.answer?.trim().toUpperCase();
    const optionKeys: OptionKey[] = ['A', 'B', 'C', 'D'];
    const explanation = current.explanationLines.join('\n').trim();

    if (!current.prompt) {
      errors.push(`${context}: missing Q text.`);
    }

    optionKeys.forEach((key) => {
      if (!current?.options[key]) {
        errors.push(`${context}: missing option ${key}.`);
      }
    });

    if (!answer) {
      errors.push(`${context}: missing ANSWER.`);
    } else if (!optionKeys.includes(answer as OptionKey)) {
      errors.push(`${context}: ANSWER must be A, B, C, or D.`);
    }

    if (
      current.prompt &&
      optionKeys.every((key) => current?.options[key]) &&
      answer &&
      optionKeys.includes(answer as OptionKey)
    ) {
      questions.push({
        id: makeQuestionId(questionNumber - 1, current.prompt),
        prompt: current.prompt,
        options: {
          A: current.options.A!.trim(),
          B: current.options.B!.trim(),
          C: current.options.C!.trim(),
          D: current.options.D!.trim(),
        },
        answer: answer as OptionKey,
        explanation: explanation || undefined,
      });
    }
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lineNumber = index + 1;

    if (!line) {
      return;
    }

    const match = line.match(/^(q|a|b|c|d|answer|reason|explanation)\s*:\s*(.*)$/i);
    if (!match) {
      if (current && collectingExplanation) {
        current.explanationLines.push(line);
        return;
      }

      errors.push(
        `Line ${lineNumber}: expected a label like Q:, A:, B:, C:, D:, ANSWER:, REASON:, or EXPLANATION:.`,
      );
      return;
    }

    const label = match[1].toUpperCase();
    const value = match[2].trim();

    if (!value) {
      errors.push(`Line ${lineNumber}: ${label}: cannot be empty.`);
    }

    if (label === 'Q') {
      finishCurrent();
      current = { startLine: lineNumber, prompt: value, options: {}, explanationLines: [] };
      collectingExplanation = false;
      return;
    }

    if (!current) {
      errors.push(`Line ${lineNumber}: found ${label}: before a Q: line.`);
      collectingExplanation = false;
      return;
    }

    if (label === 'ANSWER') {
      if (current.answer) {
        errors.push(`Line ${lineNumber}: duplicate ANSWER label.`);
      }
      current.answer = value;
      collectingExplanation = false;
      return;
    }

    if (label === 'REASON' || label === 'EXPLANATION') {
      current.explanationLines.push(value);
      collectingExplanation = true;
      return;
    }

    const optionLabel = label as OptionKey;
    if (current.options[optionLabel]) {
      errors.push(`Line ${lineNumber}: duplicate option ${optionLabel}.`);
    }
    current.options[optionLabel] = value;
    collectingExplanation = false;
  });

  finishCurrent();

  if (!input.trim()) {
    errors.push('Paste at least one question before starting the test.');
  } else if (questions.length === 0 && errors.length === 0) {
    errors.push('No complete questions were found.');
  }

  return { questions, errors };
}

function normalizeSession(parsed: QuizSession & { timePerQuestion?: number }): QuizSession | null {
  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    return null;
  }

  const timerMode = parsed.timerMode ?? 'per-question';
  const perQuestionSeconds = parsed.perQuestionSeconds ?? parsed.timePerQuestion ?? DEFAULT_PER_QUESTION_SECONDS;
  const fullTestSeconds = parsed.fullTestSeconds ?? DEFAULT_FULL_TEST_SECONDS;
  const fullTestEndsAt =
    parsed.fullTestEndsAt ??
    (timerMode === 'full-test' ? Date.now() + (parsed.remainingFullTestSeconds ?? fullTestSeconds) * 1000 : undefined);
  const remainingFullTestSeconds =
    timerMode === 'full-test'
      ? Math.max(0, Math.ceil(((fullTestEndsAt ?? Date.now()) - Date.now()) / 1000))
      : undefined;

  return {
    screen: parsed.screen ?? 'paste',
    questions: parsed.questions,
    answers: parsed.answers ?? {},
    timeSpent: parsed.timeSpent ?? {},
    timerMode,
    perQuestionSeconds,
    fullTestSeconds,
    remainingFullTestSeconds,
    currentIndex: parsed.currentIndex ?? 0,
    questionStartedAt: parsed.questionStartedAt ?? Date.now(),
    skippedQuestionIds: parsed.skippedQuestionIds ?? [],
    activeSkippedQuestionId: parsed.activeSkippedQuestionId,
    fullTestEndsAt,
    completedAt: parsed.completedAt,
  };
}

function loadSession(): QuizSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return normalizeSession(JSON.parse(raw) as QuizSession);
  } catch {
    return null;
  }
}

function saveSession(session: QuizSession | null) {
  localStorage.removeItem(LEGACY_STORAGE_KEY);

  if (!session) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function getReviewStatus(question: Question, answers: Record<string, OptionKey>): ReviewStatus {
  const selected = answers[question.id];

  if (!selected) {
    return 'not-attempted';
  }

  return selected === question.answer ? 'correct' : 'incorrect';
}

function getScore(questions: Question[], answers: Record<string, OptionKey>) {
  const total = questions.length;
  const correct = questions.filter((question) => getReviewStatus(question, answers) === 'correct').length;
  const unanswered = questions.filter((question) => getReviewStatus(question, answers) === 'not-attempted').length;
  const wrong = total - correct - unanswered;
  const percentage = total === 0 ? 0 : Math.round((correct / total) * 100);

  return { total, correct, wrong, unanswered, percentage };
}

function getActiveQuestion(session: QuizSession) {
  if (session.activeSkippedQuestionId) {
    return session.questions.find((question) => question.id === session.activeSkippedQuestionId);
  }

  return session.questions[session.currentIndex];
}

function getQuestionPosition(questions: Question[], questionId?: string) {
  const index = questions.findIndex((question) => question.id === questionId);
  return index >= 0 ? index + 1 : 0;
}

function queueSkippedQuestion(queue: string[], questionId: string) {
  return [...queue.filter((queuedQuestionId) => queuedQuestionId !== questionId), questionId];
}

function getElapsedSeconds(questionStartedAt: number, timestamp = Date.now(), limitSeconds?: number) {
  const elapsed = Math.max(0, Math.ceil((timestamp - questionStartedAt) / 1000));
  return typeof limitSeconds === 'number' ? Math.min(limitSeconds, elapsed) : elapsed;
}

function formatTimeSpent(seconds?: number) {
  const safeSeconds = Math.max(0, seconds ?? 0);
  if (safeSeconds < 60) {
    return `${safeSeconds} sec`;
  }

  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
}

function formatTimerClock(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  if (safeSeconds < 60) {
    return `${safeSeconds}`;
  }

  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function getPdfTextItemText(item: unknown) {
  if (typeof item === 'object' && item !== null && 'str' in item) {
    return String((item as { str?: unknown }).str ?? '');
  }

  return '';
}

async function renderPdfPageToImage(page: pdfjsLib.PDFPageProxy) {
  const viewport = page.getViewport({ scale: 1.45 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Your browser could not prepare the PDF page for AI extraction.');
  }

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.72);
}

async function extractPdfForAi(file: File) {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;

  if (pdf.numPages > MAX_PDF_PAGES) {
    throw new Error(`This PDF has ${pdf.numPages} pages. Please upload ${MAX_PDF_PAGES} pages or fewer for this version.`);
  }

  const textParts: string[] = [];
  const pages: pdfjsLib.PDFPageProxy[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    pages.push(page);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(getPdfTextItemText).filter(Boolean).join(' ');
    if (pageText.trim()) {
      textParts.push(`Page ${pageNumber}\n${pageText.trim()}`);
    }
  }

  const extractedText = textParts.join('\n\n').trim();

  if (extractedText.length >= MIN_TEXT_EXTRACTION_CHARS) {
    return { sourceType: 'text' as const, text: extractedText, pageCount: pdf.numPages };
  }

  const images: string[] = [];
  for (const page of pages) {
    images.push(await renderPdfPageToImage(page));
  }

  return { sourceType: 'images' as const, images, pageCount: pdf.numPages };
}

function isSupportedImage(file: File) {
  return ACCEPTED_IMAGE_TYPES.includes(file.type);
}

async function imageFileToDataUrl(file: File) {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = 'async';
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Could not read ${file.name}. Please try a clearer JPG, PNG, or WebP image.`));
    });
    image.src = sourceUrl;
    await loaded;

    const scale = Math.min(1, MAX_IMAGE_LONG_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Your browser could not prepare this image for AI extraction.');
    }

    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.78);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function extractImagesForAi(files: File[]) {
  if (files.length > MAX_IMAGE_FILES) {
    throw new Error(`Please upload ${MAX_IMAGE_FILES} images or fewer.`);
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_IMAGE_BYTES) {
    throw new Error(`These images are too large. Please upload images under ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB total.`);
  }

  const unsupportedFile = files.find((file) => !isSupportedImage(file));
  if (unsupportedFile) {
    throw new Error(`${unsupportedFile.name} is not supported. Please upload JPG, PNG, or WebP images.`);
  }

  const images = await Promise.all(files.map(imageFileToDataUrl));
  return { sourceType: 'images' as const, images, pageCount: files.length };
}

function getStatusLabel(status: ReviewStatus) {
  if (status === 'correct') {
    return 'Correct';
  }

  if (status === 'incorrect') {
    return 'Incorrect';
  }

  return 'Not Attempted';
}

function getAiImportIdleMessage(task: AiImportTask) {
  return task === 'generate-from-lecture'
    ? 'Upload lecture slides and choose how many MCQs Gemini should generate from the slide content only.'
    : 'Upload a PDF, paper photo, or screenshot and let AI convert it into quiz-ready MCQs.';
}

function getAiImportFileLabel(files: File[]) {
  if (files.length === 1) {
    return files[0].name;
  }

  return `${files.length} images selected`;
}

function getQuestionSourceLabel(source: QuestionSource) {
  if (source === 'paper-ai') {
    return 'AI paper import';
  }

  if (source === 'lecture-ai') {
    return 'Lecture slides';
  }

  if (source === 'chatgpt') {
    return 'ChatGPT prompt';
  }

  return 'Manual paste';
}

function makeTutorMessage(role: TutorRole, text: string): TutorMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
  };
}

function renderTutorText(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .split('\n')
    .map((line, lineIndex) => {
      const headingMatch = line.match(/^(\s*(?:\d+\.\s*)?[^:]{2,72}:)(\s.*)?$/);

      if (headingMatch) {
        return (
          <span className="tutor-text-line" key={`${line}-${lineIndex}`}>
            <strong className="tutor-line-heading">{headingMatch[1]}</strong>
            {headingMatch[2] ?? ''}
          </span>
        );
      }

      return (
        <span className="tutor-text-line" key={`${line}-${lineIndex}`}>
          {line}
        </span>
      );
    });
}

function App() {
  const [pasteText, setPasteText] = useState('');
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [promptCopyMessage, setPromptCopyMessage] = useState('');
  const [questionSource, setQuestionSource] = useState<QuestionSource>('manual');
  const [aiImportTask, setAiImportTask] = useState<AiImportTask>('extract-paper');
  const [lectureQuestionCount, setLectureQuestionCount] = useState(10);
  const [pdfExtraction, setPdfExtraction] = useState<PdfExtractionState>({
    status: 'idle',
    message: getAiImportIdleMessage('extract-paper'),
  });
  const [autoFormat, setAutoFormat] = useState<AutoFormatState>({
    status: 'idle',
    message: '',
  });
  const [selectedTimerMode, setSelectedTimerMode] = useState<TimerMode>('per-question');
  const [selectedPerQuestionSeconds, setSelectedPerQuestionSeconds] = useState(DEFAULT_PER_QUESTION_SECONDS);
  const [selectedFullTestSeconds, setSelectedFullTestSeconds] = useState(DEFAULT_FULL_TEST_SECONDS);
  const [customFullTestMinutes, setCustomFullTestMinutes] = useState(30);
  const [session, setSession] = useState<QuizSession | null>(() => loadSession());
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [activeTutorQuestionId, setActiveTutorQuestionId] = useState<string | null>(null);
  const [tutorMessagesByQuestionId, setTutorMessagesByQuestionId] = useState<Record<string, TutorMessage[]>>({});
  const [tutorInput, setTutorInput] = useState('');
  const [tutorStatus, setTutorStatus] = useState<TutorStatus>('idle');
  const [tutorError, setTutorError] = useState('');
  const [timeEndedQuestionId, setTimeEndedQuestionId] = useState<string | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [profileImageFailed, setProfileImageFailed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const autoAdvancedQuestionRef = useRef<string | null>(null);
  const autoAdvanceTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const fullTestSubmittedRef = useRef(false);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  const screen = session?.screen ?? 'paste';
  const currentQuestion = session ? getActiveQuestion(session) : undefined;
  const currentQuestionId = currentQuestion?.id;
  const currentQuestionPosition = session ? getQuestionPosition(session.questions, currentQuestion?.id) : 0;
  const perQuestionSeconds = session?.perQuestionSeconds ?? selectedPerQuestionSeconds;
  const fullTestSeconds = session?.fullTestSeconds ?? selectedFullTestSeconds;
  const fullTestRemaining = session?.remainingFullTestSeconds ?? fullTestSeconds;
  const isFullTestMode = session?.timerMode === 'full-test';
  const isPerQuestionMode = !session || session.timerMode === 'per-question';
  const elapsedSeconds =
    session?.screen === 'quiz' && isPerQuestionMode ? Math.floor((now - session.questionStartedAt) / 1000) : 0;
  const secondsLeft = Math.min(perQuestionSeconds, Math.max(0, perQuestionSeconds - elapsedSeconds));
  const hasMoreAfterCurrent = session
    ? Boolean(
        session.activeSkippedQuestionId
          ? session.skippedQuestionIds.length > 0
          : session.currentIndex < session.questions.length - 1 || session.skippedQuestionIds.length > 0,
      )
    : false;
  const isFinalQuestion = session ? !hasMoreAfterCurrent : false;
  const skippedCount = session
    ? session.skippedQuestionIds.length +
      (session.activeSkippedQuestionId && !session.answers[session.activeSkippedQuestionId] ? 1 : 0)
    : 0;
  const answeredCount = session ? session.questions.filter((question) => session.answers[question.id]).length : 0;
  const notAttemptedCount = session ? Math.max(0, session.questions.length - answeredCount - skippedCount) : 0;
  const displaySeconds = isFullTestMode ? fullTestRemaining : secondsLeft;
  const timerLimit = isFullTestMode ? fullTestSeconds : perQuestionSeconds;
  const isUrgent =
    screen === 'quiz' &&
    displaySeconds > 0 &&
    (isFullTestMode ? displaySeconds <= 60 : displaySeconds <= 10);
  const timerProgress = timerLimit > 0 ? (displaySeconds / timerLimit) * 100 : 0;
  const timerStyle = { '--timer-progress': `${timerProgress}%` } as CSSProperties;
  const progressPercent = session
    ? ((Math.min(
        session.currentIndex +
          (isPerQuestionMode ? (perQuestionSeconds - secondsLeft) / perQuestionSeconds : 0),
        session.questions.length,
      )) /
        session.questions.length) *
      100
    : 0;

  const questionPreview = useMemo(() => parseQuestions(pasteText), [pasteText]);
  const hasQuestionInput = pasteText.trim().length > 0;
  const showAutoFormatSuggestion = hasQuestionInput && questionPreview.errors.length > 0;
  const validationLabel = !hasQuestionInput
    ? 'Waiting for questions'
    : questionPreview.errors.length === 0
      ? 'Ready to start'
      : `${questionPreview.errors.length} issue${questionPreview.errors.length === 1 ? '' : 's'} to fix`;
  const selectedTimerLabel =
    selectedTimerMode === 'per-question'
      ? `${selectedPerQuestionSeconds} sec per question`
      : `${Math.round(selectedFullTestSeconds / 60)} min full test`;

  const score = useMemo(() => {
    if (!session) {
      return null;
    }
    return getScore(session.questions, session.answers);
  }, [session]);

  const resultGroups = useMemo(() => {
    if (!session) {
      return {
        all: [],
        correct: [],
        incorrect: [],
        'not-attempted': [],
      };
    }

    const withStatus = session.questions.map((question, index) => ({
      question,
      index,
      status: getReviewStatus(question, session.answers),
    }));

    return {
      all: withStatus,
      correct: withStatus.filter((item) => item.status === 'correct'),
      incorrect: withStatus.filter((item) => item.status === 'incorrect'),
      'not-attempted': withStatus.filter((item) => item.status === 'not-attempted'),
    };
  }, [session]);

  const activeReviewItems = resultGroups[resultFilter];
  const activeTutorContext = useMemo<TutorQuestionContext | null>(() => {
    if (!session || !activeTutorQuestionId) {
      return null;
    }

    const index = session.questions.findIndex((question) => question.id === activeTutorQuestionId);
    if (index < 0) {
      return null;
    }

    const question = session.questions[index];
    return {
      question,
      index,
      status: getReviewStatus(question, session.answers),
      selected: session.answers[question.id],
    };
  }, [session, activeTutorQuestionId]);
  const activeTutorMessages = activeTutorQuestionId ? tutorMessagesByQuestionId[activeTutorQuestionId] ?? [] : [];

  useEffect(() => {
    if (session) {
      saveSession(session);
    }
  }, [session]);

  useEffect(() => {
    if (screen !== 'quiz') {
      return;
    }

    const intervalId = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      setSession((previous) => {
        if (!previous || previous.screen !== 'quiz' || previous.timerMode !== 'full-test') {
          return previous;
        }

        const nextRemaining = Math.max(0, Math.ceil(((previous.fullTestEndsAt ?? timestamp) - timestamp) / 1000));
        if (nextRemaining === previous.remainingFullTestSeconds) {
          return previous;
        }

        return {
          ...previous,
          remainingFullTestSeconds: nextRemaining,
        };
      });
    }, 250);
    return () => window.clearInterval(intervalId);
  }, [screen]);

  useEffect(() => {
    return () => {
      if (autoAdvanceTimeoutRef.current) {
        window.clearTimeout(autoAdvanceTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!session || session.screen !== 'quiz' || session.timerMode !== 'per-question') {
      return;
    }

    if (secondsLeft > 0) {
      return;
    }

    if (currentQuestion && autoAdvancedQuestionRef.current === currentQuestion.id) {
      return;
    }

    if (!currentQuestion) {
      return;
    }

    autoAdvancedQuestionRef.current = currentQuestion.id;
    setTimeEndedQuestionId(currentQuestion.id);
    autoAdvanceTimeoutRef.current = window.setTimeout(() => {
      goToNextQuestion();
    }, 700);
  }, [secondsLeft, session]);

  useEffect(() => {
    if (!session || session.screen !== 'quiz' || session.timerMode !== 'full-test') {
      return;
    }

    if ((session.remainingFullTestSeconds ?? 1) > 0 || fullTestSubmittedRef.current) {
      return;
    }

    fullTestSubmittedRef.current = true;
    submitTest(false);
  }, [session]);

  function startQuiz(
    questions: Question[],
    timerSettings = {
      timerMode: selectedTimerMode,
      perQuestionSeconds: selectedPerQuestionSeconds,
      fullTestSeconds: selectedFullTestSeconds,
    },
  ) {
    if (autoAdvanceTimeoutRef.current) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    const startedAt = Date.now();
    const fullTestEndsAt =
      timerSettings.timerMode === 'full-test' ? startedAt + timerSettings.fullTestSeconds * 1000 : undefined;
    const nextSession: QuizSession = {
      screen: 'quiz',
      questions,
      answers: { ...emptyAnswers },
      timeSpent: {},
      timerMode: timerSettings.timerMode,
      perQuestionSeconds: timerSettings.timerMode === 'per-question' ? timerSettings.perQuestionSeconds : undefined,
      fullTestSeconds: timerSettings.timerMode === 'full-test' ? timerSettings.fullTestSeconds : undefined,
      remainingFullTestSeconds: timerSettings.timerMode === 'full-test' ? timerSettings.fullTestSeconds : undefined,
      currentIndex: 0,
      questionStartedAt: startedAt,
      skippedQuestionIds: [],
      fullTestEndsAt,
    };
    setNow(startedAt);
    setSession(nextSession);
    setResultFilter('all');
    setTimeEndedQuestionId(null);
    autoAdvancedQuestionRef.current = null;
    fullTestSubmittedRef.current = false;
    setParseErrors([]);
  }

  function validateAndStart() {
    const result = parseQuestions(pasteText);
    setParseErrors(result.errors);

    if (result.errors.length === 0) {
      startQuiz(result.questions);
    }
  }

  function handleQuestionInputChange(value: string) {
    setPasteText(value);
    setAutoFormat((previous) =>
      previous.status === 'idle'
        ? previous
        : {
            status: 'idle',
            message: '',
          },
    );
  }

  async function handleAutoFormatMcqs() {
    const sourceText = pasteText.trim();

    if (!sourceText) {
      setAutoFormat({
        status: 'error',
        message: 'Paste your questions first, then use Auto Format MCQs.',
      });
      return;
    }

    if (sourceText.length > MAX_AUTO_FORMAT_CHARS) {
      setAutoFormat({
        status: 'error',
        message: `This paste is too large for one auto-format request. Please keep it under ${Math.round(
          MAX_AUTO_FORMAT_CHARS / 1000,
        )}k characters or split it into smaller parts.`,
      });
      return;
    }

    if (autoFormat.sourceText === sourceText && autoFormat.formattedText) {
      const cachedText = autoFormat.formattedText;
      const parsed = parseQuestions(cachedText);
      setPasteText(cachedText);
      setParseErrors(parsed.errors);
      setAutoFormat({
        status: parsed.errors.length === 0 ? 'ready' : 'error',
        sourceText,
        formattedText: cachedText,
        message:
          parsed.errors.length === 0
            ? 'Reused the previous formatted version. Review it, then start your test.'
            : 'Reused the previous formatted version, but a few items still need review.',
      });
      return;
    }

    setAutoFormat({
      status: 'formatting',
      message: 'Formatting your pasted MCQs...',
    });

    try {
      const response = await fetch('/api/format-mcqs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: sourceText }),
      });
      const data = (await response.json()) as { mcqText?: string; error?: string };

      if (!response.ok) {
        const setupHint =
          response.status === 404
            ? ' Run with npx vercel dev for local AI formatting, or use the deployed Vercel site.'
            : '';
        throw new Error(`${data.error || 'Auto Format could not repair this paste.'}${setupHint}`);
      }

      const formattedText = (data.mcqText || '').trim();
      if (!formattedText) {
        throw new Error('Auto Format did not return any MCQs. Please try with clearer question text.');
      }

      const parsed = parseQuestions(formattedText);
      setPasteText(formattedText);
      setParseErrors(parsed.errors);
      setAutoFormat({
        status: parsed.errors.length === 0 ? 'ready' : 'error',
        sourceText,
        formattedText,
        message:
          parsed.errors.length === 0
            ? `Auto Format repaired the paste and detected ${parsed.questions.length} question${
                parsed.questions.length === 1 ? '' : 's'
              }. Review them before starting.`
            : 'Auto Format improved the paste, but some questions still need manual review.',
      });
    } catch (error) {
      setAutoFormat({
        status: 'error',
        message: error instanceof Error ? error.message : 'Auto Format could not repair this paste.',
      });
    }
  }

  async function copyChatGptPrompt() {
    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard API unavailable');
      }

      await navigator.clipboard.writeText(CHATGPT_PROMPT);
    } catch {
      const promptTextarea = document.createElement('textarea');
      promptTextarea.value = CHATGPT_PROMPT;
      promptTextarea.setAttribute('readonly', '');
      promptTextarea.style.position = 'fixed';
      promptTextarea.style.opacity = '0';
      document.body.appendChild(promptTextarea);
      promptTextarea.select();
      document.execCommand('copy');
      document.body.removeChild(promptTextarea);
    }

    setPromptCopyMessage('Prompt copied. Send it to ChatGPT to generate your MCQs.');
  }

  function chooseQuestionSource(source: QuestionSource) {
    setQuestionSource(source);

    if (source === 'paper-ai') {
      setAiImportTask('extract-paper');
      setPdfExtraction({
        status: 'idle',
        message: getAiImportIdleMessage('extract-paper'),
      });
    }

    if (source === 'lecture-ai') {
      setAiImportTask('generate-from-lecture');
      setPdfExtraction({
        status: 'idle',
        message: getAiImportIdleMessage('generate-from-lecture'),
      });
    }
  }

  function loadSampleQuestions() {
    chooseQuestionSource('manual');
    setPasteText(sampleQuestions);
    setParseErrors([]);
    setAutoFormat({
      status: 'idle',
      message: '',
    });
  }

  function openTutor(questionId: string) {
    setActiveTutorQuestionId(questionId);
    setTutorInput('');
    setTutorError('');
    setTutorStatus('idle');
  }

  function closeTutor() {
    setActiveTutorQuestionId(null);
    setTutorInput('');
    setTutorError('');
    setTutorStatus('idle');
  }

  async function sendTutorMessage(messageText: string) {
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage || !activeTutorContext || tutorStatus === 'thinking') {
      return;
    }

    const questionId = activeTutorContext.question.id;
    const userMessage = makeTutorMessage('user', trimmedMessage);
    const previousMessages = tutorMessagesByQuestionId[questionId] ?? [];
    const nextMessages = [...previousMessages, userMessage];

    setTutorMessagesByQuestionId((previous) => ({
      ...previous,
      [questionId]: nextMessages,
    }));
    setTutorInput('');
    setTutorError('');
    setTutorStatus('thinking');

    try {
      const response = await fetch('/api/tutor-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: activeTutorContext.question.prompt,
          options: activeTutorContext.question.options,
          correctAnswer: activeTutorContext.question.answer,
          selectedAnswer: activeTutorContext.selected,
          status: activeTutorContext.status,
          explanation: activeTutorContext.question.explanation,
          userMessage: trimmedMessage,
          messages: nextMessages.slice(-8).map(({ role, text }) => ({ role, text })),
        }),
      });

      const data = (await response.json().catch(() => null)) as { reply?: string; error?: string } | null;

      if (response.status === 404) {
        throw new Error('AI Tutor API was not found. Locally, run the app with Vercel dev to use the tutor.');
      }

      if (!response.ok) {
        throw new Error(data?.error || 'AI Tutor could not answer right now.');
      }

      const assistantMessage = makeTutorMessage(
        'assistant',
        data?.reply?.trim() || 'I could not form a helpful answer. Try asking in a simpler way.',
      );
      setTutorMessagesByQuestionId((previous) => ({
        ...previous,
        [questionId]: [...(previous[questionId] ?? nextMessages), assistantMessage],
      }));
      setTutorStatus('idle');
    } catch (error) {
      setTutorError(error instanceof Error ? error.message : 'AI Tutor could not answer right now.');
      setTutorStatus('error');
    }
  }

  async function handlePaperUpload(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) {
      return;
    }

    const pdfFiles = files.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    const imageFiles = files.filter((file) => isSupportedImage(file));
    const fileName = getAiImportFileLabel(files);
    const isLectureMode = aiImportTask === 'generate-from-lecture';
    const safeLectureQuestionCount = Math.min(
      MAX_LECTURE_QUESTION_COUNT,
      Math.max(MIN_LECTURE_QUESTION_COUNT, Math.round(lectureQuestionCount) || 10),
    );

    if (pdfFiles.length > 0 && files.length > 1) {
      setPdfExtraction({
        status: 'error',
        fileName,
        message: 'Please upload either one PDF or image files, not both together.',
      });
      return;
    }

    if (pdfFiles.length === 0 && imageFiles.length !== files.length) {
      setPdfExtraction({
        status: 'error',
        fileName,
        message: 'Please upload a PDF, JPG, PNG, or WebP image file.',
      });
      return;
    }

    try {
      setParseErrors([]);
      let extracted: Awaited<ReturnType<typeof extractPdfForAi>> | Awaited<ReturnType<typeof extractImagesForAi>>;

      if (pdfFiles.length === 1) {
        const [file] = pdfFiles;
        if (file.size > MAX_PDF_BYTES) {
          throw new Error(`This PDF is too large. Please upload a file under ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB.`);
        }

        setPdfExtraction({
          status: 'extracting',
          fileName,
          message: isLectureMode
            ? 'Reading the lecture PDF and checking whether it contains selectable text...'
            : 'Reading the PDF and checking whether it contains selectable text...',
        });
        extracted = await extractPdfForAi(file);
      } else {
        setPdfExtraction({
          status: 'extracting',
          fileName,
          message: isLectureMode
            ? 'Preparing your lecture slide images for AI generation...'
            : 'Preparing your paper image for AI extraction...',
        });
        extracted = await extractImagesForAi(imageFiles);
      }

      setPdfExtraction({
        status: 'formatting',
        fileName,
        message: isLectureMode
          ? `Generating ${safeLectureQuestionCount} MCQs from your lecture slides...`
          : extracted.sourceType === 'text'
            ? 'PDF text found. AI is formatting it into quiz-ready MCQs...'
            : 'AI is reading the paper image and formatting quiz-ready MCQs...',
      });

      const response = await fetch('/api/extract-mcqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: aiImportTask,
          questionCount: isLectureMode ? safeLectureQuestionCount : undefined,
          fileName,
          pageCount: extracted.pageCount,
          sourceType: extracted.sourceType,
          text: extracted.sourceType === 'text' ? extracted.text : undefined,
          images: extracted.sourceType === 'images' ? extracted.images : undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as { mcqText?: string; error?: string } | null;

      if (response.status === 404) {
        throw new Error('AI extraction API was not found. Locally, run the app with Vercel dev to test AI extraction.');
      }

      if (!response.ok) {
        throw new Error(data?.error || 'AI extraction failed. Please try again.');
      }

      if (!data?.mcqText?.trim()) {
        throw new Error('AI did not return any MCQs. Please try a clearer paper or paste the questions manually.');
      }

      const mcqText = data.mcqText.trim();
      const parsed = parseQuestions(mcqText);
      setPasteText(mcqText);
      setParseErrors(parsed.errors);
      setPdfExtraction({
        status: parsed.errors.length > 0 ? 'error' : 'ready',
        fileName,
        message:
          parsed.errors.length > 0
            ? 'AI extracted text, but some questions need review. Fix the errors below before starting.'
            : isLectureMode
              ? `Ready to review. Generated ${parsed.questions.length} of ${safeLectureQuestionCount} requested MCQ${
                  safeLectureQuestionCount === 1 ? '' : 's'
                } from the slides.`
              : `Ready to review. ${parsed.questions.length} question${parsed.questions.length === 1 ? '' : 's'} found.`,
      });
    } catch (error) {
      setPdfExtraction({
        status: 'error',
        fileName,
        message: error instanceof Error ? error.message : 'Could not extract MCQs from this paper file.',
      });
    } finally {
      if (pdfInputRef.current) {
        pdfInputRef.current.value = '';
      }
    }
  }

  function selectAnswer(option: OptionKey) {
    if (!session || !currentQuestion) {
      return;
    }

    setSession((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        answers: {
          ...previous.answers,
          [currentQuestion.id]: option,
        },
        skippedQuestionIds: previous.skippedQuestionIds.filter((questionId) => questionId !== currentQuestion.id),
      };
    });
  }

  function addCurrentTimeSpent(previous: QuizSession, timestamp: number) {
    const activeQuestion = getActiveQuestion(previous);
    if (!activeQuestion) {
      return previous.timeSpent;
    }

    const visitSeconds = getElapsedSeconds(
      previous.questionStartedAt,
      timestamp,
      previous.timerMode === 'per-question' ? previous.perQuestionSeconds : undefined,
    );

    return {
      ...previous.timeSpent,
      [activeQuestion.id]: (previous.timeSpent[activeQuestion.id] ?? 0) + visitSeconds,
    };
  }

  function goToNextQuestion() {
    if (autoAdvanceTimeoutRef.current) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    const nextStartedAt = Date.now();

    setSession((previous) => {
      if (!previous || previous.screen !== 'quiz') {
        return previous;
      }

      const timeSpent = addCurrentTimeSpent(previous, nextStartedAt);
      const activateSkipped = (queue: string[]) => {
        const [nextSkippedQuestionId, ...remainingSkippedIds] = queue;
        if (!nextSkippedQuestionId) {
          return {
            ...previous,
            timeSpent,
            activeSkippedQuestionId: undefined,
            skippedQuestionIds: [],
            screen: 'results' as const,
            completedAt: nextStartedAt,
          };
        }

        return {
          ...previous,
          timeSpent,
          currentIndex: previous.questions.length,
          activeSkippedQuestionId: nextSkippedQuestionId,
          skippedQuestionIds: remainingSkippedIds,
          questionStartedAt: nextStartedAt,
        };
      };

      if (previous.activeSkippedQuestionId) {
        return activateSkipped(previous.skippedQuestionIds);
      }

      const nextIndex = previous.currentIndex + 1;

      if (nextIndex >= previous.questions.length) {
        return activateSkipped(previous.skippedQuestionIds);
      }

      return {
        ...previous,
        timeSpent,
        currentIndex: nextIndex,
        activeSkippedQuestionId: undefined,
        questionStartedAt: nextStartedAt,
      };
    });

    setTimeEndedQuestionId(null);
    setNow(nextStartedAt);
  }

  function skipQuestion() {
    if (autoAdvanceTimeoutRef.current) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    const skippedAt = Date.now();

    setSession((previous) => {
      if (!previous || previous.screen !== 'quiz') {
        return previous;
      }

      const activeQuestion = getActiveQuestion(previous);
      if (!activeQuestion) {
        return previous;
      }

      const timeSpent = addCurrentTimeSpent(previous, skippedAt);
      const queuedSkippedIds = queueSkippedQuestion(previous.skippedQuestionIds, activeQuestion.id);

      const activateSkipped = (queue: string[]) => {
        const [nextSkippedQuestionId, ...remainingSkippedIds] = queue;
        if (!nextSkippedQuestionId) {
          return {
            ...previous,
            timeSpent,
            activeSkippedQuestionId: undefined,
            skippedQuestionIds: [],
            screen: 'results' as const,
            completedAt: skippedAt,
          };
        }

        return {
          ...previous,
          timeSpent,
          currentIndex: previous.questions.length,
          activeSkippedQuestionId: nextSkippedQuestionId,
          skippedQuestionIds: remainingSkippedIds,
          questionStartedAt: skippedAt,
        };
      };

      if (previous.activeSkippedQuestionId) {
        return activateSkipped(queuedSkippedIds);
      }

      const nextIndex = previous.currentIndex + 1;
      if (nextIndex >= previous.questions.length) {
        return activateSkipped(queuedSkippedIds);
      }

      return {
        ...previous,
        timeSpent,
        currentIndex: nextIndex,
        skippedQuestionIds: queuedSkippedIds,
        questionStartedAt: skippedAt,
      };
    });

    setTimeEndedQuestionId(null);
    setNow(skippedAt);
  }

  function jumpToQuestion(questionId: string) {
    if (autoAdvanceTimeoutRef.current) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    const jumpedAt = Date.now();

    setSession((previous) => {
      if (!previous || previous.screen !== 'quiz') {
        return previous;
      }

      const targetIndex = previous.questions.findIndex((question) => question.id === questionId);
      const activeQuestion = getActiveQuestion(previous);

      if (targetIndex < 0 || activeQuestion?.id === questionId) {
        return previous;
      }

      const activeSkippedQuestionId = previous.activeSkippedQuestionId;
      const shouldRequeueActiveSkipped =
        activeSkippedQuestionId && !previous.answers[activeSkippedQuestionId];

      return {
        ...previous,
        timeSpent: addCurrentTimeSpent(previous, jumpedAt),
        currentIndex: targetIndex,
        activeSkippedQuestionId: undefined,
        skippedQuestionIds: shouldRequeueActiveSkipped
          ? queueSkippedQuestion(previous.skippedQuestionIds, activeSkippedQuestionId)
          : previous.skippedQuestionIds,
        questionStartedAt: jumpedAt,
      };
    });

    setTimeEndedQuestionId(null);
    setNow(jumpedAt);
  }

  function submitTest(shouldConfirm = true) {
    if (shouldConfirm) {
      const confirmed = window.confirm('Finish the test now? Unanswered questions will be marked as not attempted.');

      if (!confirmed) {
        return;
      }
    }

    if (autoAdvanceTimeoutRef.current) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    const finishedAt = Date.now();
    setSession((previous) =>
      previous
        ? {
            ...previous,
            timeSpent: previous.screen === 'quiz' ? addCurrentTimeSpent(previous, finishedAt) : previous.timeSpent,
            remainingFullTestSeconds:
              previous.timerMode === 'full-test' ? Math.max(0, previous.remainingFullTestSeconds ?? 0) : undefined,
            screen: 'results',
            completedAt: finishedAt,
          }
        : previous,
    );
    setTimeEndedQuestionId(null);
    setResultFilter('all');
  }

  function finishTest() {
    submitTest(true);
  }

  function startNewTest() {
    if (autoAdvanceTimeoutRef.current) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    setSession(null);
    saveSession(null);
    setPasteText('');
    setParseErrors([]);
    setAutoFormat({
      status: 'idle',
      message: '',
    });
    setTimeEndedQuestionId(null);
    setResultFilter('all');
    setActiveTutorQuestionId(null);
    setTutorMessagesByQuestionId({});
    setTutorInput('');
    setTutorError('');
    setTutorStatus('idle');
    fullTestSubmittedRef.current = false;
  }

  function retryWrongQuestions() {
    if (!session) {
      return;
    }

    const retryQuestions = session.questions.filter((question) => getReviewStatus(question, session.answers) !== 'correct');
    if (retryQuestions.length === 0) {
      return;
    }

    startQuiz(
      retryQuestions.map((question, index) => ({
        ...question,
        id: makeQuestionId(index, question.prompt),
      })),
      {
        timerMode: session.timerMode,
        perQuestionSeconds: session.perQuestionSeconds ?? DEFAULT_PER_QUESTION_SECONDS,
        fullTestSeconds: session.fullTestSeconds ?? DEFAULT_FULL_TEST_SECONDS,
      },
    );
  }

  function renderTimerCard(isMobile = false) {
    return (
      <section
        className={`${isMobile ? 'mobile-timer-card' : 'timer-card'} ${isUrgent ? 'urgent' : ''}`}
        aria-label="Quiz timer"
        style={timerStyle}
      >
        <span className="timer-label">Time Left</span>
        <strong className="timer-value" aria-label={`${formatTimerClock(displaySeconds)} remaining`}>
          {isFullTestMode ? formatTimerClock(displaySeconds) : `${displaySeconds} sec`}
        </strong>
        <span className="timer-mode-label">{isFullTestMode ? 'Full Test Mode' : 'Per Question Mode'}</span>
        <div className="timer-bar" aria-hidden="true">
          <div className="timer-bar-fill" />
        </div>
        {isUrgent && (
          <p className="timer-warning">
            {isFullTestMode ? 'Hurry! Test time is almost over.' : 'Hurry! Select an answer.'}
          </p>
        )}
      </section>
    );
  }

  function renderQuestionPalette(compact = false) {
    if (!session) {
      return null;
    }

    return (
      <section className={`palette-card ${compact ? 'compact' : ''}`} aria-label="Question palette">
        <div className="palette-heading">
          <h3>Question Palette</h3>
          <p>Jump to any question</p>
        </div>
        <div className="palette-counts">
          <span>Answered: {answeredCount}</span>
          <span>Skipped: {skippedCount}</span>
          <span>Not Attempted: {notAttemptedCount}</span>
        </div>
        <nav className="question-navigator" aria-label="Question navigator">
          <div className="question-circles">
            {session.questions.map((question, index) => {
              const isCurrent = question.id === currentQuestionId;
              const isAnswered = Boolean(session.answers[question.id]);
              const isSkipped =
                session.skippedQuestionIds.includes(question.id) ||
                (session.activeSkippedQuestionId === question.id && !isAnswered);

              return (
                <button
                  className={`question-circle ${isCurrent ? 'current' : ''} ${isAnswered ? 'answered' : ''} ${
                    isSkipped && !isAnswered ? 'skipped' : ''
                  }`}
                  type="button"
                  key={question.id}
                  onClick={() => jumpToQuestion(question.id)}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`Open question ${index + 1}`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        </nav>
        <div className="question-legend" aria-label="Question status legend">
          <span>
            <i className="legend-dot answered" />
            Answered
          </span>
          <span>
            <i className="legend-dot skipped" />
            Skipped
          </span>
          <span>
            <i className="legend-dot idle" />
            Not Attempted
          </span>
          <span>
            <i className="legend-dot current" />
            Current
          </span>
        </div>
      </section>
    );
  }

  function renderTutorDrawer() {
    if (!activeTutorContext) {
      return null;
    }

    const { question, index, status, selected } = activeTutorContext;

    return (
      <div className="tutor-overlay" role="dialog" aria-modal="true" aria-labelledby="tutor-title">
        <section className="tutor-panel">
          <div className="tutor-header">
            <div>
              <p className="eyebrow">AI Tutor</p>
              <h2 id="tutor-title">Discuss This Question</h2>
              <span>
                Question {index + 1} · {getStatusLabel(status)}
              </span>
            </div>
            <button className="ghost-button tutor-close" type="button" onClick={closeTutor} aria-label="Close AI Tutor">
              Close
            </button>
          </div>

          <div className="tutor-context">
            <strong>{question.prompt}</strong>
            <p>
              Selected: {selected ? `${selected}: ${question.options[selected]}` : 'No answer selected'} · Correct:{' '}
              {question.answer}: {question.options[question.answer]}
            </p>
          </div>

          <div className="tutor-quick-actions" aria-label="AI Tutor quick actions">
            {TUTOR_QUICK_ACTIONS.map((action) => (
              <button
                className="tutor-chip"
                type="button"
                key={action}
                onClick={() => {
                  void sendTutorMessage(action);
                }}
                disabled={tutorStatus === 'thinking'}
              >
                {action}
              </button>
            ))}
          </div>

          <div className="tutor-messages" aria-live="polite">
            {activeTutorMessages.length === 0 ? (
              <div className="tutor-empty">
                <strong>Ask for a hint, steps, or answer verification.</strong>
                <p>I will keep the answer short and focused on this question.</p>
              </div>
            ) : (
              activeTutorMessages.map((message) => (
                <div className={`tutor-message ${message.role}`} key={message.id}>
                  <span className="tutor-speaker">{message.role === 'assistant' ? 'Tutor' : 'You'}</span>
                  <p>{renderTutorText(message.text)}</p>
                </div>
              ))
            )}
            {tutorStatus === 'thinking' && (
              <div className="tutor-message assistant">
                <span className="tutor-speaker">Tutor</span>
                <p>Thinking through the shortest helpful answer...</p>
              </div>
            )}
          </div>

          {tutorError && (
            <div className="tutor-error" role="alert">
              {tutorError}
            </div>
          )}

          <form
            className="tutor-form"
            onSubmit={(event) => {
              event.preventDefault();
              void sendTutorMessage(tutorInput);
            }}
          >
            <textarea
              value={tutorInput}
              onChange={(event) => setTutorInput(event.target.value)}
              placeholder="Ask your question or paste your reasoning..."
              rows={3}
            />
            <button className="primary-button" type="submit" disabled={tutorStatus === 'thinking' || !tutorInput.trim()}>
              Send
            </button>
          </form>
        </section>
      </div>
    );
  }

  function renderAboutModal() {
    if (!isAboutOpen) {
      return null;
    }

    return (
      <div className="about-overlay" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <section className="about-panel">
          <button
            className="ghost-button about-close"
            type="button"
            onClick={() => setIsAboutOpen(false)}
            aria-label="Close About Me"
          >
            Close
          </button>

          <div className="about-hero">
            <div className="about-photo-card">
              {profileImageFailed ? (
                <div className="about-photo-fallback" aria-label="Muhammad Asim Ilyas profile initials">
                  MA
                </div>
              ) : (
                <img
                  src={PROFILE_IMAGE_SRC}
                  alt="Muhammad Asim Ilyas"
                  onError={() => setProfileImageFailed(true)}
                />
              )}
            </div>

            <div className="about-intro">
              <p className="eyebrow">Creator Profile</p>
              <h2 id="about-title">Muhammad Asim Ilyas</h2>
              <p>
                Creator of Entry Test Quiz, built to help students practise university-entry MCQs with clearer feedback,
                realistic timing, and focused review.
              </p>
              <div className="about-tags" aria-label="Profile highlights">
                <span>Entry test practice</span>
                <span>AI-assisted learning</span>
                <span>Student-focused tools</span>
              </div>
            </div>
          </div>

          <div className="about-grid">
            <article className="about-card featured">
              <span>Purpose</span>
              <h3>Make practice feel simple, serious, and useful.</h3>
              <p>
                This app is designed for students preparing for tests like HAT, NTS, GAT, FAST, NUST, COMSATS, and other
                university entry exams.
              </p>
            </article>

            <article className="about-card">
              <span>Motivation</span>
              <p>
                Many students have MCQs in PDFs, notes, screenshots, or rough text. Entry Test Quiz turns that material
                into a clean practice workflow: import, review, attempt, and learn from mistakes.
              </p>
            </article>

            <article className="about-card">
              <span>What this project offers</span>
              <ul>
                <li>Manual MCQ paste with validation.</li>
                <li>AI paper and lecture-slide import.</li>
                <li>Timed quiz modes with skip and question palette.</li>
                <li>Results review with explanations and AI Tutor help.</li>
              </ul>
            </article>

            <article className="about-card">
              <span>Design promise</span>
              <p>
                The goal is a clean, student-friendly tool: fewer distractions, visible progress, helpful recovery from
                errors, and enough structure to practise with confidence.
              </p>
            </article>
          </div>
        </section>
      </div>
    );
  }

  function renderSetupDashboard() {
    const questionsReady = hasQuestionInput && questionPreview.errors.length === 0;
    const questionsNeedFix = hasQuestionInput && questionPreview.errors.length > 0;
    const setupSteps = [
      {
        number: '1',
        label: 'Source',
        detail: getQuestionSourceLabel(questionSource),
        status: 'complete',
      },
      {
        number: '2',
        label: 'Questions',
        detail: questionsReady
          ? `${questionPreview.questions.length} ready`
          : questionsNeedFix
            ? `${questionPreview.errors.length} to fix`
            : 'Add MCQs',
        status: questionsReady ? 'complete' : questionsNeedFix ? 'attention' : 'active',
      },
      {
        number: '3',
        label: 'Timer',
        detail: selectedTimerLabel,
        status: 'complete',
      },
      {
        number: '4',
        label: 'Start',
        detail: questionsReady ? 'Ready' : 'Waiting',
        status: questionsReady ? 'active' : 'locked',
      },
    ];

    return (
      <section className="setup-dashboard">
        <div className="dashboard-main">
          <div className="dashboard-command">
            <div className="section-heading dashboard-heading">
              <span className="step-label">Setup dashboard</span>
              <h2>Build Your Practice Test</h2>
              <p>Choose a source, review the questions, set the timer, then start with confidence.</p>
            </div>

            <div className="setup-progress" aria-label="Test setup progress">
              {setupSteps.map((step) => (
                <div className={`setup-progress-item ${step.status}`} key={step.number}>
                  <span className="setup-progress-number">{step.number}</span>
                  <span>
                    <strong>{step.label}</strong>
                    <small>{step.detail}</small>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <section className="setup-card" aria-labelledby="source-title">
            <div className="setup-card-heading">
              <span className="step-number">1</span>
              <div>
                <h3 id="source-title">Choose Question Source</h3>
                <p>Start from pasted MCQs, AI import, lecture slides, or a ChatGPT prompt.</p>
              </div>
            </div>

            <div className="source-grid">
              <button
                className={`source-card ${questionSource === 'manual' ? 'selected' : ''}`}
                type="button"
                onClick={() => chooseQuestionSource('manual')}
                aria-pressed={questionSource === 'manual'}
              >
                <span className="source-card-top">
                  <span className="source-icon">PA</span>
                  {questionSource === 'manual' && <span className="source-selected">Selected</span>}
                </span>
                <strong>Paste MCQs Manually</strong>
                <span>Use Q, A, B, C, D, ANSWER, and optional REASON labels.</span>
              </button>
              <button
                className={`source-card ${questionSource === 'paper-ai' ? 'selected' : ''}`}
                type="button"
                onClick={() => chooseQuestionSource('paper-ai')}
                aria-pressed={questionSource === 'paper-ai'}
              >
                <span className="source-card-top">
                  <span className="source-icon">AI</span>
                  {questionSource === 'paper-ai' && <span className="source-selected">Selected</span>}
                </span>
                <strong>Extract from Paper</strong>
                <span>Upload a paper PDF, photo, or screenshot that already has MCQs.</span>
              </button>
              <button
                className={`source-card ${questionSource === 'lecture-ai' ? 'selected' : ''}`}
                type="button"
                onClick={() => chooseQuestionSource('lecture-ai')}
                aria-pressed={questionSource === 'lecture-ai'}
              >
                <span className="source-card-top">
                  <span className="source-icon">SL</span>
                  {questionSource === 'lecture-ai' && <span className="source-selected">Selected</span>}
                </span>
                <strong>Generate from Slides</strong>
                <span>Create MCQs only from uploaded lecture slides or images.</span>
              </button>
              <button
                className={`source-card ${questionSource === 'chatgpt' ? 'selected' : ''}`}
                type="button"
                onClick={() => chooseQuestionSource('chatgpt')}
                aria-pressed={questionSource === 'chatgpt'}
              >
                <span className="source-card-top">
                  <span className="source-icon">GP</span>
                  {questionSource === 'chatgpt' && <span className="source-selected">Selected</span>}
                </span>
                <strong>Use ChatGPT Prompt</strong>
                <span>Copy a prompt, generate MCQs manually, then paste them here.</span>
              </button>
            </div>

            {questionSource === 'manual' && (
              <div className="source-panel">
                <strong>Manual entry is selected.</strong>
                <p>Paste formatted MCQs in the review box below, or load the built-in sample to see the format.</p>
              </div>
            )}

            {(questionSource === 'paper-ai' || questionSource === 'lecture-ai') && (
              <div className={`source-panel ai-source-panel ${pdfExtraction.status}`}>
                <div className="source-panel-copy">
                  <strong>
                    {questionSource === 'lecture-ai' ? 'Generate MCQs from Lecture Slides' : 'Extract MCQs from Paper'}
                  </strong>
                  <p>
                    {questionSource === 'lecture-ai'
                      ? 'Upload lecture slides as a PDF or images. Gemini will use only the uploaded content.'
                      : 'Upload a practice paper PDF, photo, or screenshot. Gemini will convert it to the app format.'}
                  </p>
                </div>

                {questionSource === 'lecture-ai' && (
                  <label className="lecture-count-field">
                    <span>How many MCQs?</span>
                    <input
                      type="number"
                      min={MIN_LECTURE_QUESTION_COUNT}
                      max={MAX_LECTURE_QUESTION_COUNT}
                      value={lectureQuestionCount}
                      onChange={(event) => {
                        const nextCount = Number(event.target.value);
                        setLectureQuestionCount(
                          Number.isFinite(nextCount)
                            ? Math.min(MAX_LECTURE_QUESTION_COUNT, Math.max(MIN_LECTURE_QUESTION_COUNT, nextCount))
                            : 10,
                        );
                      }}
                    />
                    <small>
                      Choose {MIN_LECTURE_QUESTION_COUNT}-{MAX_LECTURE_QUESTION_COUNT}. Questions stay based on the
                      uploaded slides.
                    </small>
                  </label>
                )}

                <input
                  ref={pdfInputRef}
                  className="pdf-file-input"
                  id="paper-pdf"
                  type="file"
                  accept="application/pdf,.pdf,image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) => {
                    void handlePaperUpload(event.target.files);
                  }}
                />
                <label className="pdf-upload-box compact" htmlFor="paper-pdf">
                  <strong>Choose PDF or Images</strong>
                  <span>{pdfExtraction.fileName || 'No file selected'}</span>
                </label>
                <p className="pdf-status" role={pdfExtraction.status === 'error' ? 'alert' : 'status'}>
                  {pdfExtraction.message}
                </p>
              </div>
            )}

            {questionSource === 'chatgpt' && (
              <details className="prompt-card dashboard-prompt" open>
                <summary>
                  <span>
                    <strong>Generate MCQs with ChatGPT</strong>
                    <small>Copy this prompt, generate MCQs, then paste the result into the review box.</small>
                  </span>
                </summary>
                <div className="prompt-card-body">
                  <textarea className="prompt-box" value={CHATGPT_PROMPT} readOnly rows={12} />
                  <div className="prompt-actions">
                    <button className="secondary-button" type="button" onClick={copyChatGptPrompt}>
                      Copy Prompt
                    </button>
                    {promptCopyMessage && (
                      <p className="copy-message" role="status">
                        {promptCopyMessage}
                      </p>
                    )}
                  </div>
                </div>
              </details>
            )}
          </section>

          <section className="setup-card" aria-labelledby="review-title">
            <div className="setup-card-heading">
              <span className="step-number">2</span>
              <div>
                <h3 id="review-title">Review & Edit MCQs</h3>
                <p>AI and sample output appears here first, so you can inspect it before starting.</p>
              </div>
              {hasQuestionInput && questionPreview.errors.length === 0 && (
                <span className="detected-pill">{questionPreview.questions.length} detected</span>
              )}
            </div>

            <div className={`review-status-row ${questionsReady ? 'ready' : questionsNeedFix ? 'attention' : ''}`}>
              <div>
                <strong>Question workspace</strong>
                <span>Paste or review MCQs here. The app validates this box before the quiz begins.</span>
              </div>
              <span className="validation-badge">{validationLabel}</span>
            </div>

            <textarea
              className="question-input dashboard-question-input"
              value={pasteText}
              onChange={(event) => handleQuestionInputChange(event.target.value)}
              placeholder="Q: What is 25 percent of 240?&#10;A: 40&#10;B: 60&#10;C: 80&#10;D: 100&#10;ANSWER: B&#10;REASON: 25 percent means one-fourth. One-fourth of 240 is 60."
              spellCheck={false}
            />

            {showAutoFormatSuggestion && (
              <div className={`format-helper ${autoFormat.status}`} role="region" aria-label="Auto format helper">
                <div className="format-helper-copy">
                  <strong>Format needs attention</strong>
                  <p>
                    If your text came from ChatGPT, notes, or a copied paper, Auto Format can clean numbering,
                    markdown, option labels, answer labels, and extra intro text into the quiz format.
                  </p>
                </div>
                <div className="format-helper-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      void handleAutoFormatMcqs();
                    }}
                    disabled={autoFormat.status === 'formatting'}
                  >
                    {autoFormat.status === 'formatting' ? 'Formatting...' : 'Auto Format MCQs'}
                  </button>
                  {autoFormat.message && (
                    <p className="format-status" role={autoFormat.status === 'error' ? 'alert' : 'status'}>
                      {autoFormat.message}
                    </p>
                  )}
                </div>
              </div>
            )}

            {!showAutoFormatSuggestion && autoFormat.message && (
              <p className={`format-status standalone ${autoFormat.status}`} role="status">
                {autoFormat.message}
              </p>
            )}

            {parseErrors.length > 0 && (
              <div className="error-panel" role="alert">
                <strong>Please fix these before starting:</strong>
                <ul>
                  {parseErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="timer-picker dashboard-timer-card" aria-labelledby="timer-picker-title">
            <div className="setup-card-heading">
              <span className="step-number">3</span>
              <div className="timer-picker-heading">
                <h3 id="timer-picker-title">Choose Timer</h3>
                <p>Select per-question pressure or one full-test countdown.</p>
              </div>
            </div>

            <div className="timer-mode-grid">
              <article className={`timer-mode-card ${selectedTimerMode === 'per-question' ? 'selected' : ''}`}>
                <button
                  className="timer-mode-button"
                  type="button"
                  onClick={() => setSelectedTimerMode('per-question')}
                  aria-pressed={selectedTimerMode === 'per-question'}
                >
                  {selectedTimerMode === 'per-question' && <span className="selected-badge">Selected</span>}
                  <strong>Per Question Timer</strong>
                  <span>Each question has its own time limit.</span>
                </button>
              </article>

              <article className={`timer-mode-card ${selectedTimerMode === 'full-test' ? 'selected' : ''}`}>
                <button
                  className="timer-mode-button"
                  type="button"
                  onClick={() => setSelectedTimerMode('full-test')}
                  aria-pressed={selectedTimerMode === 'full-test'}
                >
                  {selectedTimerMode === 'full-test' && <span className="selected-badge">Selected</span>}
                  <strong>Full Test Timer</strong>
                  <span>One timer controls the whole paper.</span>
                </button>
              </article>
            </div>

            <div className="timer-options-panel">
              {selectedTimerMode === 'per-question' ? (
                <>
                  <div className="timer-options-heading">
                    <strong>Per-question time</strong>
                    <span>Timer resets whenever you open a question.</span>
                  </div>
                  <div className="timer-options">
                    {PER_QUESTION_OPTIONS.map((seconds) => (
                      <button
                        className={`timer-chip ${selectedPerQuestionSeconds === seconds ? 'selected' : ''}`}
                        type="button"
                        key={seconds}
                        onClick={() => setSelectedPerQuestionSeconds(seconds)}
                        aria-pressed={selectedPerQuestionSeconds === seconds}
                      >
                        {seconds} sec
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="timer-options-heading">
                    <strong>Full-test time</strong>
                    <span>One countdown continues across every question.</span>
                  </div>
                  <div className="timer-options full-test-options">
                    {FULL_TEST_OPTIONS.map((seconds) => (
                      <button
                        className={`timer-chip ${selectedFullTestSeconds === seconds ? 'selected' : ''}`}
                        type="button"
                        key={seconds}
                        onClick={() => {
                          setSelectedFullTestSeconds(seconds);
                          setCustomFullTestMinutes(seconds / 60);
                        }}
                        aria-pressed={selectedFullTestSeconds === seconds}
                      >
                        {seconds / 60} min
                      </button>
                    ))}
                    <label className="custom-timer active">
                      <span>Custom minutes</span>
                      <input
                        type="number"
                        min="1"
                        max="240"
                        value={customFullTestMinutes}
                        onChange={(event) => {
                          const minutes = Math.max(1, Number(event.target.value) || 1);
                          setCustomFullTestMinutes(minutes);
                          setSelectedFullTestSeconds(minutes * 60);
                        }}
                      />
                    </label>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        <aside className="setup-summary" aria-label="Test setup summary">
          <div className="setup-summary-card">
            <span className="step-label">Step 4</span>
            <h3>Start Test</h3>
            <div className="summary-list">
              <p>
                <span>Source</span>
                <strong>{getQuestionSourceLabel(questionSource)}</strong>
              </p>
              <p>
                <span>Questions</span>
                <strong>{hasQuestionInput ? questionPreview.questions.length : 0}</strong>
              </p>
              <p>
                <span>Timer</span>
                <strong>{selectedTimerLabel}</strong>
              </p>
              <p>
                <span>Status</span>
                <strong className={hasQuestionInput && questionPreview.errors.length === 0 ? 'summary-ready' : ''}>
                  {validationLabel}
                </strong>
              </p>
            </div>
            <div className="summary-actions">
              <button className="secondary-button" type="button" onClick={loadSampleQuestions}>
                Load Sample Questions
              </button>
              <button className="primary-button" type="button" onClick={validateAndStart}>
                Start Test
              </button>
            </div>
          </div>
        </aside>
      </section>
    );
  }

  return (
    <main className="app-shell">
      <section className="app-frame" aria-live="polite">
        <header className={screen === 'quiz' ? 'quiz-topbar' : 'topbar'}>
          {screen === 'quiz' ? (
            <div>
              <strong>Quiz in Progress</strong>
              <p>Stay focused and complete your attempt.</p>
            </div>
          ) : (
            <div>
              <p className="eyebrow">Entry test practice</p>
              <h1>Entry Test Quiz</h1>
              <p className="app-subtitle">Paste your MCQs, practise under time pressure, and review your performance.</p>
            </div>
          )}
          <div className="topbar-actions">
            <button className="secondary-button about-trigger" type="button" onClick={() => setIsAboutOpen(true)}>
              About Me
            </button>
            {session && (
              <button className="ghost-button" type="button" onClick={startNewTest}>
                New Test
              </button>
            )}
          </div>
        </header>

        {screen === 'paste' && (
          <>
            {renderSetupDashboard()}
            {false && (
          <section className="screen-stack">
            <div className="section-heading">
              <h2>Paste Questions</h2>
              <p>
                Paste MCQs using Q, A, B, C, D, and ANSWER labels. REASON or EXPLANATION is optional. Choose a timer
                mode, then start your test.
              </p>
            </div>

            <details className="prompt-card">
              <summary>
                <span>
                  <strong>Generate MCQs with ChatGPT</strong>
                  <small>Copy this prompt and send it to ChatGPT to generate MCQs in the correct format.</small>
                </span>
              </summary>
              <div className="prompt-card-body">
                <textarea className="prompt-box" value={CHATGPT_PROMPT} readOnly rows={18} />
                <div className="prompt-actions">
                  <button className="secondary-button" type="button" onClick={copyChatGptPrompt}>
                    Copy Prompt
                  </button>
                  {promptCopyMessage && (
                    <p className="copy-message" role="status">
                      {promptCopyMessage}
                    </p>
                  )}
                </div>
              </div>
            </details>

            <section className={`pdf-card ${pdfExtraction.status}`} aria-labelledby="pdf-upload-title">
              <div className="pdf-card-copy">
                <p className="eyebrow">AI import</p>
                <h3 id="pdf-upload-title">Upload Paper or Lecture Slides</h3>
                <p>
                  Upload a practice paper, lecture PDF, slide photo, or screenshot. The app will place AI-created MCQs
                  in the box below so you can review everything before starting.
                </p>
                <ul className="pdf-rules">
                  <li>Supports normal PDFs, scanned PDFs, JPG, PNG, and WebP images.</li>
                  <li>
                    Maximum {MAX_PDF_PAGES} PDF pages or {MAX_IMAGE_FILES} images, up to{' '}
                    {Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB.
                  </li>
                  <li>AI output is always editable before the quiz starts.</li>
                </ul>
              </div>

              <div className="pdf-upload-panel">
                <div className="ai-import-mode" role="group" aria-label="AI import mode">
                  <button
                    className={`ai-import-mode-button ${aiImportTask === 'extract-paper' ? 'selected' : ''}`}
                    type="button"
                    onClick={() => {
                      setAiImportTask('extract-paper');
                      setPdfExtraction({
                        status: 'idle',
                        message: getAiImportIdleMessage('extract-paper'),
                      });
                    }}
                    aria-pressed={aiImportTask === 'extract-paper'}
                  >
                    <strong>Extract MCQs from Paper</strong>
                    <span>Use when the uploaded file already contains MCQs.</span>
                  </button>
                  <button
                    className={`ai-import-mode-button ${aiImportTask === 'generate-from-lecture' ? 'selected' : ''}`}
                    type="button"
                    onClick={() => {
                      setAiImportTask('generate-from-lecture');
                      setPdfExtraction({
                        status: 'idle',
                        message: getAiImportIdleMessage('generate-from-lecture'),
                      });
                    }}
                    aria-pressed={aiImportTask === 'generate-from-lecture'}
                  >
                    <strong>Generate MCQs from Lecture Slides</strong>
                    <span>Create new questions only from uploaded slide content.</span>
                  </button>
                </div>

                {aiImportTask === 'generate-from-lecture' && (
                  <label className="lecture-count-field">
                    <span>How many MCQs?</span>
                    <input
                      type="number"
                      min={MIN_LECTURE_QUESTION_COUNT}
                      max={MAX_LECTURE_QUESTION_COUNT}
                      value={lectureQuestionCount}
                      onChange={(event) => {
                        const nextCount = Number(event.target.value);
                        setLectureQuestionCount(
                          Number.isFinite(nextCount)
                            ? Math.min(MAX_LECTURE_QUESTION_COUNT, Math.max(MIN_LECTURE_QUESTION_COUNT, nextCount))
                            : 10,
                        );
                      }}
                    />
                    <small>
                      Choose {MIN_LECTURE_QUESTION_COUNT}-{MAX_LECTURE_QUESTION_COUNT}. Gemini will use only the uploaded
                      slides.
                    </small>
                  </label>
                )}

                <input
                  ref={pdfInputRef}
                  className="pdf-file-input"
                  id="paper-pdf"
                  type="file"
                  accept="application/pdf,.pdf,image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) => {
                    void handlePaperUpload(event.target.files);
                  }}
                />
                <label className="pdf-upload-box" htmlFor="paper-pdf">
                  <strong>Choose PDF or Images</strong>
                  <span>{pdfExtraction.fileName || 'No file selected'}</span>
                </label>
                <p className="pdf-status" role={pdfExtraction.status === 'error' ? 'alert' : 'status'}>
                  {pdfExtraction.message}
                </p>
              </div>
            </section>

            <textarea
              className="question-input"
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder="Q: What is 25 percent of 240?&#10;A: 40&#10;B: 60&#10;C: 80&#10;D: 100&#10;ANSWER: B&#10;REASON: 25 percent means one-fourth. One-fourth of 240 is 60."
              spellCheck={false}
            />

            {parseErrors.length > 0 && (
              <div className="error-panel" role="alert">
                <strong>Please fix these before starting:</strong>
                <ul>
                  {parseErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            <section className="timer-picker" aria-labelledby="timer-picker-title">
              <div className="timer-picker-heading">
                <h3 id="timer-picker-title">Timer Mode</h3>
                <p>Choose per-question pressure or one full-test countdown.</p>
              </div>

              <div className="timer-mode-grid">
                <article className={`timer-mode-card ${selectedTimerMode === 'per-question' ? 'selected' : ''}`}>
                  <button
                    className="timer-mode-button"
                    type="button"
                    onClick={() => setSelectedTimerMode('per-question')}
                    aria-pressed={selectedTimerMode === 'per-question'}
                  >
                    {selectedTimerMode === 'per-question' && <span className="selected-badge">Selected</span>}
                    <strong>Per Question Timer</strong>
                    <span>Each question has its own time limit.</span>
                  </button>
                </article>

                <article className={`timer-mode-card ${selectedTimerMode === 'full-test' ? 'selected' : ''}`}>
                  <button
                    className="timer-mode-button"
                    type="button"
                    onClick={() => setSelectedTimerMode('full-test')}
                    aria-pressed={selectedTimerMode === 'full-test'}
                  >
                    {selectedTimerMode === 'full-test' && <span className="selected-badge">Selected</span>}
                    <strong>Full Test Timer</strong>
                    <span>One timer controls the whole paper.</span>
                  </button>
                </article>
              </div>

              <div className="timer-options-panel">
                {selectedTimerMode === 'per-question' ? (
                  <>
                    <div className="timer-options-heading">
                      <strong>Per-question time</strong>
                      <span>Timer resets whenever you open a question.</span>
                    </div>
                    <div className="timer-options">
                      {PER_QUESTION_OPTIONS.map((seconds) => (
                        <button
                          className={`timer-chip ${selectedPerQuestionSeconds === seconds ? 'selected' : ''}`}
                          type="button"
                          key={seconds}
                          onClick={() => setSelectedPerQuestionSeconds(seconds)}
                          aria-pressed={selectedPerQuestionSeconds === seconds}
                        >
                          {seconds} sec
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="timer-options-heading">
                      <strong>Full-test time</strong>
                      <span>One countdown continues across every question.</span>
                    </div>
                    <div className="timer-options full-test-options">
                      {FULL_TEST_OPTIONS.map((seconds) => (
                        <button
                          className={`timer-chip ${selectedFullTestSeconds === seconds ? 'selected' : ''}`}
                          type="button"
                          key={seconds}
                          onClick={() => {
                            setSelectedFullTestSeconds(seconds);
                            setCustomFullTestMinutes(seconds / 60);
                          }}
                          aria-pressed={selectedFullTestSeconds === seconds}
                        >
                          {seconds / 60} min
                        </button>
                      ))}
                      <label className="custom-timer active">
                        <span>Custom minutes</span>
                        <input
                          type="number"
                          min="1"
                          max="240"
                          value={customFullTestMinutes}
                          onChange={(event) => {
                            const minutes = Math.max(1, Number(event.target.value) || 1);
                            setCustomFullTestMinutes(minutes);
                            setSelectedFullTestSeconds(minutes * 60);
                          }}
                        />
                      </label>
                    </div>
                  </>
                )}
              </div>
            </section>

            <div className="actions">
              <button className="secondary-button" type="button" onClick={() => setPasteText(sampleQuestions)}>
                Load Sample Questions
              </button>
              <button className="primary-button" type="button" onClick={validateAndStart}>
                Start Test
              </button>
            </div>
          </section>
            )}
          </>
        )}

        {screen === 'quiz' && session && currentQuestion && (
          <section className="screen-stack quiz-layout">
            <div className="quiz-main-grid">
              <div className="quiz-main-column">
                {renderTimerCard(true)}

                <article className="question-card">
                  <div className="question-card-header">
              <div>
                <p className="question-kicker">
                  Question {currentQuestionPosition} of {session.questions.length}
                </p>
                <span className="mode-badge">
                  {session.timerMode === 'full-test' ? 'Full Test Mode' : 'Per Question Mode'}
                </span>
                <h2>{currentQuestion.prompt}</h2>
              </div>
              <span className="skipped-pill">Skipped: {skippedCount}</span>
            </div>

            <details className="mobile-palette">
              <summary>Question Palette</summary>
              {renderQuestionPalette(true)}
            </details>

            {timeEndedQuestionId === currentQuestion.id && (
              <div className={`time-alert ${timeEndedQuestionId === currentQuestion.id ? 'ended' : ''}`} role="status">
                Time ended. Moving to the next question...
              </div>
            )}

            <div className={`progress-track ${isUrgent ? 'urgent' : ''}`} aria-hidden="true">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>

            <div className="options-grid">
              {(Object.keys(currentQuestion.options) as OptionKey[]).map((key) => {
                const selected = session.answers[currentQuestion.id] === key;
                return (
                  <button
                    className={`option-button ${selected ? 'selected' : ''}`}
                    type="button"
                    key={key}
                    onClick={() => selectAnswer(key)}
                    aria-pressed={selected}
                  >
                    <span className="option-key">{key}</span>
                    <span>{currentQuestion.options[key]}</span>
                  </button>
                );
              })}
            </div>

            <div className="actions quiz-actions">
              <button className="finish-button" type="button" onClick={finishTest}>
                Finish Test
              </button>
              <button className="secondary-button skip-button" type="button" onClick={skipQuestion}>
                Skip
              </button>
              <button className="primary-button forward-button" type="button" onClick={() => goToNextQuestion()}>
                {isFinalQuestion ? 'Submit Test' : 'Next Question'}
              </button>
            </div>
                </article>
              </div>

              <aside className="quiz-sidebar" aria-label="Quiz tools">
                {renderTimerCard()}
                {renderQuestionPalette()}
              </aside>
            </div>
          </section>
        )}

        {screen === 'results' && session && score && (
          <section className="screen-stack">
            <div className="section-heading">
              <h2>Results</h2>
              <p>Your answers are saved in this browser until you start a new test.</p>
            </div>

            <div className="score-grid">
              <div className="score-tile">
                <span>{score.total}</span>
                <small>Total</small>
              </div>
              <div className="score-tile success">
                <span>{score.correct}</span>
                <small>Correct</small>
              </div>
              <div className="score-tile danger">
                <span>{score.wrong}</span>
                <small>Incorrect</small>
              </div>
              <div className="score-tile muted">
                <span>{score.unanswered}</span>
                <small>Not Attempted</small>
              </div>
              <div className="score-tile accent">
                <span>{score.percentage}%</span>
                <small>Score</small>
              </div>
            </div>

            <div className="result-tabs" role="tablist" aria-label="Result review filter">
              {[
                { key: 'all' as const, label: 'All Questions', count: resultGroups.all.length },
                { key: 'correct' as const, label: 'Correct', count: resultGroups.correct.length },
                { key: 'incorrect' as const, label: 'Incorrect', count: resultGroups.incorrect.length },
                { key: 'not-attempted' as const, label: 'Not Attempted', count: resultGroups['not-attempted'].length },
              ].map((tab) => (
                <button
                  className={`tab-button ${resultFilter === tab.key ? 'active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={resultFilter === tab.key}
                  key={tab.key}
                  onClick={() => setResultFilter(tab.key)}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            <div className="review-list">
              {activeReviewItems.length === 0 ? (
                <p className="empty-review">No questions in this section.</p>
              ) : (
                activeReviewItems.map(({ question, index, status }) => {
                  const selected = session.answers[question.id];
                  return (
                    <article className={`review-item ${status}`} key={question.id}>
                      <div className="review-heading">
                        <h3>
                          {index + 1}. {question.prompt}
                        </h3>
                        <div className="review-heading-actions">
                          <span className={`status-pill ${status}`}>{getStatusLabel(status)}</span>
                          <button className="tutor-open-button" type="button" onClick={() => openTutor(question.id)}>
                            Ask AI Tutor
                          </button>
                        </div>
                      </div>

                      <div className="review-options">
                        {(Object.keys(question.options) as OptionKey[]).map((key) => (
                          <div
                            className={`review-option ${key === question.answer ? 'is-answer' : ''} ${
                              key === selected ? 'is-selected' : ''
                            }`}
                            key={key}
                          >
                            <span className="option-key">{key}</span>
                            <span>{question.options[key]}</span>
                          </div>
                        ))}
                      </div>

                      <div className="answer-lines">
                        <p>
                          Status: <strong>{getStatusLabel(status)}</strong>
                        </p>
                        <p>
                          Selected:{' '}
                          <strong>{selected ? `${selected}: ${question.options[selected]}` : 'No answer selected'}</strong>
                        </p>
                        <p>
                          Correct: <strong>{question.answer}: {question.options[question.answer]}</strong>
                        </p>
                        <p>
                          Time spent: <strong>{formatTimeSpent(session.timeSpent[question.id])}</strong>
                        </p>
                      </div>

                      <div className="explanation-box">
                        <strong>Explanation</strong>
                        <p>{question.explanation || NO_EXPLANATION_TEXT}</p>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <div className="actions">
              <button className="secondary-button" type="button" onClick={startNewTest}>
                Start New Test
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={retryWrongQuestions}
                disabled={score.wrong + score.unanswered === 0}
              >
                Retry Wrong Questions
              </button>
            </div>
            {renderTutorDrawer()}
          </section>
        )}
        {renderAboutModal()}
      </section>
    </main>
  );
}

export default App;
