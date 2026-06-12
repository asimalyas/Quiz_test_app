import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

type OptionKey = 'A' | 'B' | 'C' | 'D';
type Screen = 'paste' | 'quiz' | 'results';
type ReviewStatus = 'correct' | 'incorrect' | 'not-attempted';
type ResultFilter = 'all' | ReviewStatus;

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
  timePerQuestion: number;
  currentIndex: number;
  questionStartedAt: number;
  completedAt?: number;
};

const STORAGE_KEY = 'entry-test-quiz-session';
const LEGACY_STORAGE_KEY = 'hat-quick-quiz-session';
const DEFAULT_TIME_PER_QUESTION = 60;
const TIMER_OPTIONS = [30, 45, 60, 90, 120];
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

function normalizeSession(parsed: QuizSession): QuizSession | null {
  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    return null;
  }

  return {
    screen: parsed.screen ?? 'paste',
    questions: parsed.questions,
    answers: parsed.answers ?? {},
    timeSpent: parsed.timeSpent ?? {},
    timePerQuestion: parsed.timePerQuestion ?? DEFAULT_TIME_PER_QUESTION,
    currentIndex: parsed.currentIndex ?? 0,
    questionStartedAt: parsed.questionStartedAt ?? Date.now(),
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

function getElapsedSeconds(questionStartedAt: number, timePerQuestion: number, timestamp = Date.now()) {
  return Math.min(timePerQuestion, Math.max(0, Math.ceil((timestamp - questionStartedAt) / 1000)));
}

function formatTimeSpent(seconds?: number) {
  return `${Math.max(0, seconds ?? 0)} sec`;
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
  const [selectedTimePerQuestion, setSelectedTimePerQuestion] = useState(DEFAULT_TIME_PER_QUESTION);
  const [session, setSession] = useState<QuizSession | null>(() => loadSession());
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [timeEndedQuestionId, setTimeEndedQuestionId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const autoAdvancedQuestionRef = useRef<string | null>(null);
  const autoAdvanceTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const screen = session?.screen ?? 'paste';
  const currentQuestion = session?.questions[session.currentIndex];
  const timePerQuestion = session?.timePerQuestion ?? selectedTimePerQuestion;
  const elapsedSeconds =
    session?.screen === 'quiz' ? Math.floor((now - session.questionStartedAt) / 1000) : 0;
  const secondsLeft = Math.min(timePerQuestion, Math.max(0, timePerQuestion - elapsedSeconds));
  const isFinalQuestion = session ? session.currentIndex === session.questions.length - 1 : false;
  const isUrgent = screen === 'quiz' && secondsLeft > 0 && secondsLeft <= 10;
  const timerProgress = timePerQuestion > 0 ? (secondsLeft / timePerQuestion) * 100 : 0;
  const timerStyle = { '--timer-progress': `${timerProgress}%` } as CSSProperties;
  const progressPercent = session
    ? ((Math.min(session.currentIndex + (timePerQuestion - secondsLeft) / timePerQuestion, session.questions.length)) /
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

    const intervalId = window.setInterval(() => setNow(Date.now()), 250);
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
    if (!session || session.screen !== 'quiz') {
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

  function startQuiz(questions: Question[], timeLimit = selectedTimePerQuestion) {
    if (autoAdvanceTimeoutRef.current) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    const startedAt = Date.now();
    const nextSession: QuizSession = {
      screen: 'quiz',
      questions,
      answers: { ...emptyAnswers },
      timeSpent: {},
      timePerQuestion: timeLimit,
      currentIndex: 0,
      questionStartedAt: startedAt,
    };
    setNow(startedAt);
    setSession(nextSession);
    setResultFilter('all');
    setTimeEndedQuestionId(null);
    autoAdvancedQuestionRef.current = null;
    setParseErrors([]);
  }

  function validateAndStart() {
    const result = parseQuestions(pasteText);
    setParseErrors(result.errors);

    if (result.errors.length === 0) {
      startQuiz(result.questions, selectedTimePerQuestion);
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

    setSession({
      ...session,
      answers: {
        ...session.answers,
        [currentQuestion.id]: option,
      },
    });
  }

  function addCurrentTimeSpent(previous: QuizSession, timestamp: number) {
    const activeQuestion = previous.questions[previous.currentIndex];
    if (!activeQuestion) {
      return previous.timeSpent;
    }

    return {
      ...previous.timeSpent,
      [activeQuestion.id]: getElapsedSeconds(previous.questionStartedAt, previous.timePerQuestion, timestamp),
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
      const nextIndex = previous.currentIndex + 1;

      if (nextIndex >= previous.questions.length) {
        return {
          ...previous,
          timeSpent,
          screen: 'results',
          completedAt: nextStartedAt,
        };
      }

      return {
        ...previous,
        timeSpent,
        currentIndex: nextIndex,
        questionStartedAt: nextStartedAt,
      };
    });

    setTimeEndedQuestionId(null);
    setNow(nextStartedAt);
  }

  function finishTest() {
    const confirmed = window.confirm('Finish the test now? Unanswered questions will be marked as not attempted.');

    if (!confirmed) {
      return;
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
            screen: 'results',
            completedAt: finishedAt,
          }
        : previous,
    );
    setResultFilter('all');
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
      session.timePerQuestion,
    );
  }

  return (
    <main className="app-shell">
      <section className="app-frame" aria-live="polite">
        <header className="topbar">
          <div>
            <p className="eyebrow">Entry test practice</p>
            <h1>Entry Test Quiz</h1>
            <p className="app-subtitle">Paste your MCQs, practise under time pressure, and review your performance.</p>
          </div>
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
                Paste MCQs using Q, A, B, C, D, and ANSWER labels. REASON or EXPLANATION is optional. Choose the time
                per question, then start your test.
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
              <div>
                <h3 id="timer-picker-title">Time per Question</h3>
                <p>Pick a pace before starting. The same timing is used for retries.</p>
              </div>
              <div className="timer-options">
                {TIMER_OPTIONS.map((seconds) => (
                  <button
                    className={`timer-chip ${selectedTimePerQuestion === seconds ? 'selected' : ''}`}
                    type="button"
                    key={seconds}
                    onClick={() => setSelectedTimePerQuestion(seconds)}
                    aria-pressed={selectedTimePerQuestion === seconds}
                  >
                    {seconds} sec
                  </button>
                ))}
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
            <div className="quiz-meta">
              <div>
                <p className="eyebrow">
                  Question {session.currentIndex + 1} of {session.questions.length}
                </p>
                <h2>{currentQuestion.prompt}</h2>
              </div>
              <div
                className={`timer ${secondsLeft <= 10 ? 'urgent' : ''}`}
                style={timerStyle}
                aria-label={`${secondsLeft} seconds left`}
              >
                <span>{secondsLeft}</span>
                <small>sec</small>
              </div>
            </div>

            {(isUrgent || timeEndedQuestionId === currentQuestion.id) && (
              <div className={`time-alert ${timeEndedQuestionId === currentQuestion.id ? 'ended' : ''}`} role="status">
                {timeEndedQuestionId === currentQuestion.id
                  ? 'Time ended. Moving to the next question...'
                  : 'Hurry! Select an answer — time is running out.'}
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
              <button className="secondary-button finish-button" type="button" onClick={finishTest}>
                Finish Test
              </button>
              <button className="primary-button forward-button" type="button" onClick={() => goToNextQuestion()}>
                {isFinalQuestion ? 'Submit Test' : 'Next Question'}
              </button>
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
