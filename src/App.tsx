import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import './styles/index.css';
import { AboutModal } from './components/AboutModal';
import { AppHeader } from './components/AppHeader';
import { TutorDrawer } from './components/TutorDrawer';
import { QuizScreen } from './features/quiz/QuizScreen';
import { ResultsScreen } from './features/results/ResultsScreen';
import { SetupDashboard } from './features/setup/SetupDashboard';
import { useAiImport } from './hooks/useAiImport';
import { useAutoFormat } from './hooks/useAutoFormat';
import { useQuizSession } from './hooks/useQuizSession';
import { useTutor } from './hooks/useTutor';
import type { AiImportTask, QuestionSource, TimerMode } from './types';
import { CHATGPT_PROMPT, DEFAULT_FULL_TEST_SECONDS, DEFAULT_PER_QUESTION_SECONDS, sampleQuestions } from './lib/constants';
import { getAiImportIdleMessage } from './lib/labels';
import { parseQuestions } from './lib/parser';

type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'entry-test-quiz-theme';

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : 'light';
}

function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);
  const [pasteText, setPasteText] = useState('');
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [promptCopyMessage, setPromptCopyMessage] = useState('');
  const [questionSource, setQuestionSource] = useState<QuestionSource>('manual');
  const [aiImportTask, setAiImportTask] = useState<AiImportTask>('extract-paper');
  const [lectureQuestionCount, setLectureQuestionCount] = useState(10);
  const { autoFormat, handleQuestionInputChange, handleAutoFormatMcqs, resetAutoFormat } = useAutoFormat({
    pasteText,
    setPasteText,
    setParseErrors,
  });
  const [selectedTimerMode, setSelectedTimerMode] = useState<TimerMode>('per-question');
  const [selectedPerQuestionSeconds, setSelectedPerQuestionSeconds] = useState(DEFAULT_PER_QUESTION_SECONDS);
  const [selectedFullTestSeconds, setSelectedFullTestSeconds] = useState(DEFAULT_FULL_TEST_SECONDS);
  const [customFullTestMinutes, setCustomFullTestMinutes] = useState(30);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const {
    session,
    screen,
    currentQuestion,
    currentQuestionId,
    currentQuestionPosition,
    skippedCount,
    answeredCount,
    notAttemptedCount,
    displaySeconds,
    isFullTestMode,
    isUrgent,
    timerProgress,
    progressPercent,
    isFinalQuestion,
    timeEndedQuestionId,
    score,
    resultGroups,
    resultFilter,
    setResultFilter,
    startQuiz,
    selectAnswer,
    goToNextQuestion,
    skipQuestion,
    jumpToQuestion,
    finishTest,
    startNewTestSession,
    retryWrongQuestions,
  } = useQuizSession({
    selectedTimerMode,
    selectedPerQuestionSeconds,
    selectedFullTestSeconds,
  });
  const timerStyle = { '--timer-progress': `${timerProgress}%` } as CSSProperties;
  const { pdfExtraction, setPdfExtraction, handlePaperUpload } = useAiImport({
    aiImportTask,
    lectureQuestionCount,
    pdfInputRef,
    setPasteText,
    setParseErrors,
  });
  const {
    activeTutorContext,
    activeTutorMessages,
    tutorInput,
    tutorStatus,
    tutorError,
    openTutor,
    closeTutor,
    resetTutor,
    setTutorInput,
    sendTutorMessage,
  } = useTutor(session);
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

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  function toggleTheme() {
    setThemeMode((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
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
    resetAutoFormat();
  }

  function startNewTest() {
    startNewTestSession();
    setPasteText('');
    setParseErrors([]);
    resetAutoFormat();
    resetTutor();
  }
  return (
    <main className="app-shell" data-theme={themeMode}>
      <section className="app-frame" aria-live="polite">
        <AppHeader
          screen={screen}
          hasSession={Boolean(session)}
          themeMode={themeMode}
          onToggleTheme={toggleTheme}
          onNewTest={startNewTest}
          onOpenAbout={() => setIsAboutOpen(true)}
        />

        {screen === 'paste' && (
          <SetupDashboard
            pasteText={pasteText}
            parseErrors={parseErrors}
            questionPreview={questionPreview}
            hasQuestionInput={hasQuestionInput}
            showAutoFormatSuggestion={showAutoFormatSuggestion}
            validationLabel={validationLabel}
            selectedTimerLabel={selectedTimerLabel}
            questionSource={questionSource}
            pdfExtraction={pdfExtraction}
            lectureQuestionCount={lectureQuestionCount}
            promptCopyMessage={promptCopyMessage}
            autoFormat={autoFormat}
            selectedTimerMode={selectedTimerMode}
            selectedPerQuestionSeconds={selectedPerQuestionSeconds}
            selectedFullTestSeconds={selectedFullTestSeconds}
            customFullTestMinutes={customFullTestMinutes}
            pdfInputRef={pdfInputRef}
            onChooseQuestionSource={chooseQuestionSource}
            onLectureQuestionCountChange={setLectureQuestionCount}
            onPaperUpload={(fileList) => {
              void handlePaperUpload(fileList);
            }}
            onCopyChatGptPrompt={() => {
              void copyChatGptPrompt();
            }}
            onQuestionInputChange={handleQuestionInputChange}
            onAutoFormatMcqs={() => {
              void handleAutoFormatMcqs();
            }}
            onSelectedTimerModeChange={setSelectedTimerMode}
            onSelectedPerQuestionSecondsChange={setSelectedPerQuestionSeconds}
            onSelectedFullTestSecondsChange={setSelectedFullTestSeconds}
            onCustomFullTestMinutesChange={setCustomFullTestMinutes}
            onLoadSampleQuestions={loadSampleQuestions}
            onValidateAndStart={validateAndStart}
          />
        )}

        {screen === 'quiz' && session && currentQuestion && (
          <QuizScreen
            session={session}
            currentQuestion={currentQuestion}
            currentQuestionId={currentQuestionId}
            currentQuestionPosition={currentQuestionPosition}
            skippedCount={skippedCount}
            answeredCount={answeredCount}
            notAttemptedCount={notAttemptedCount}
            timeEndedQuestionId={timeEndedQuestionId}
            isUrgent={isUrgent}
            isFullTestMode={isFullTestMode}
            displaySeconds={displaySeconds}
            timerStyle={timerStyle}
            progressPercent={progressPercent}
            isFinalQuestion={isFinalQuestion}
            onSelectAnswer={selectAnswer}
            onFinishTest={finishTest}
            onSkipQuestion={skipQuestion}
            onNextQuestion={goToNextQuestion}
            onJumpToQuestion={jumpToQuestion}
          />
        )}
        {screen === 'results' && session && score && (
          <>
            <ResultsScreen
              session={session}
              score={score}
              resultGroups={resultGroups}
              resultFilter={resultFilter}
              onResultFilterChange={setResultFilter}
              onStartNewTest={startNewTest}
              onRetryWrongQuestions={retryWrongQuestions}
              onOpenTutor={openTutor}
            />
            <TutorDrawer
              context={activeTutorContext}
              messages={activeTutorMessages}
              input={tutorInput}
              status={tutorStatus}
              error={tutorError}
              onClose={closeTutor}
              onInputChange={setTutorInput}
              onSendMessage={(message) => {
                void sendTutorMessage(message);
              }}
            />
          </>
        )}
        <AboutModal open={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
      </section>
    </main>
  );
}

export default App;
