import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

type OptionKey = 'A' | 'B' | 'C' | 'D';
type Screen = 'paste' | 'quiz' | 'results';
type ReviewStatus = 'correct' | 'incorrect' | 'not-attempted';
type ResultFilter = 'all' | ReviewStatus;
type TimerMode = 'per-question' | 'full-test';

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

const STORAGE_KEY = 'entry-test-quiz-session';
const LEGACY_STORAGE_KEY = 'hat-quick-quiz-session';
const DEFAULT_PER_QUESTION_SECONDS = 60;
const DEFAULT_FULL_TEST_SECONDS = 30 * 60;
const PER_QUESTION_OPTIONS = [30, 45, 60, 90, 120];
const FULL_TEST_OPTIONS = [5, 10, 15, 30, 45, 60].map((minutes) => minutes * 60);
const NO_EXPLANATION_TEXT = 'No explanation was added for this question.';
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

function getStatusLabel(status: ReviewStatus) {
  if (status === 'correct') {
    return 'Correct';
  }

  if (status === 'incorrect') {
    return 'Incorrect';
  }

  return 'Not Attempted';
}

function App() {
  const [pasteText, setPasteText] = useState('');
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [promptCopyMessage, setPromptCopyMessage] = useState('');
  const [selectedTimerMode, setSelectedTimerMode] = useState<TimerMode>('per-question');
  const [selectedPerQuestionSeconds, setSelectedPerQuestionSeconds] = useState(DEFAULT_PER_QUESTION_SECONDS);
  const [selectedFullTestSeconds, setSelectedFullTestSeconds] = useState(DEFAULT_FULL_TEST_SECONDS);
  const [customFullTestMinutes, setCustomFullTestMinutes] = useState(30);
  const [session, setSession] = useState<QuizSession | null>(() => loadSession());
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [timeEndedQuestionId, setTimeEndedQuestionId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const autoAdvancedQuestionRef = useRef<string | null>(null);
  const autoAdvanceTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const fullTestSubmittedRef = useRef(false);

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
    setTimeEndedQuestionId(null);
    setResultFilter('all');
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
          {session && (
            <button className="ghost-button" type="button" onClick={startNewTest}>
              New Test
            </button>
          )}
        </header>

        {screen === 'paste' && (
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
                        <span className={`status-pill ${status}`}>{getStatusLabel(status)}</span>
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
          </section>
        )}
      </section>
    </main>
  );
}

export default App;
