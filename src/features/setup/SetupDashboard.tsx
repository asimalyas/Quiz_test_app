import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
  CHATGPT_PROMPT,
  FULL_TEST_OPTIONS,
  MAX_LECTURE_QUESTION_COUNT,
  MIN_LECTURE_QUESTION_COUNT,
  PER_QUESTION_OPTIONS,
} from '../../lib/constants';
import { getQuestionSourceLabel } from '../../lib/labels';
import type {
  AutoFormatState,
  ParseResult,
  PdfExtractionState,
  QuestionSource,
  TimerMode,
} from '../../types';

type SetupDashboardProps = {
  pasteText: string;
  parseErrors: string[];
  questionPreview: ParseResult;
  hasQuestionInput: boolean;
  showAutoFormatSuggestion: boolean;
  validationLabel: string;
  selectedTimerLabel: string;
  questionSource: QuestionSource;
  pdfExtraction: PdfExtractionState;
  lectureQuestionCount: number;
  promptCopyMessage: string;
  autoFormat: AutoFormatState;
  selectedTimerMode: TimerMode;
  selectedPerQuestionSeconds: number;
  selectedFullTestSeconds: number;
  customFullTestMinutes: number;
  pdfInputRef: RefObject<HTMLInputElement>;
  onChooseQuestionSource: (source: QuestionSource) => void;
  onLectureQuestionCountChange: Dispatch<SetStateAction<number>>;
  onPaperUpload: (fileList: FileList | null) => void;
  onCopyChatGptPrompt: () => void;
  onQuestionInputChange: (value: string) => void;
  onAutoFormatMcqs: () => void;
  onSelectedTimerModeChange: Dispatch<SetStateAction<TimerMode>>;
  onSelectedPerQuestionSecondsChange: Dispatch<SetStateAction<number>>;
  onSelectedFullTestSecondsChange: Dispatch<SetStateAction<number>>;
  onCustomFullTestMinutesChange: Dispatch<SetStateAction<number>>;
  onLoadSampleQuestions: () => void;
  onValidateAndStart: () => void;
};

export function SetupDashboard({
  pasteText,
  parseErrors,
  questionPreview,
  hasQuestionInput,
  showAutoFormatSuggestion,
  validationLabel,
  selectedTimerLabel,
  questionSource,
  pdfExtraction,
  lectureQuestionCount,
  promptCopyMessage,
  autoFormat,
  selectedTimerMode,
  selectedPerQuestionSeconds,
  selectedFullTestSeconds,
  customFullTestMinutes,
  pdfInputRef,
  onChooseQuestionSource,
  onLectureQuestionCountChange,
  onPaperUpload,
  onCopyChatGptPrompt,
  onQuestionInputChange,
  onAutoFormatMcqs,
  onSelectedTimerModeChange,
  onSelectedPerQuestionSecondsChange,
  onSelectedFullTestSecondsChange,
  onCustomFullTestMinutesChange,
  onLoadSampleQuestions,
  onValidateAndStart,
}: SetupDashboardProps) {
  const questionsReady = hasQuestionInput && questionPreview.errors.length === 0;
  const questionsNeedFix = hasQuestionInput && questionPreview.errors.length > 0;
  const detectedQuestionCount = hasQuestionInput ? questionPreview.questions.length : 0;
  const issueCount = questionPreview.errors.length;
  const sourceLabel = getQuestionSourceLabel(questionSource);
  const launchButtonLabel = questionsReady ? 'Start Test' : 'Check Questions';
  const nextAction = questionsReady
    ? 'Everything is ready. Start the test whenever you feel prepared.'
    : questionsNeedFix
      ? 'Clean the format issues below, then the test will unlock cleanly.'
      : 'Choose a source, add your MCQs, and the dashboard will guide you forward.';
  const workspaceQuality = questionsReady ? 'Ready to launch' : questionsNeedFix ? 'Needs attention' : 'Not started';
  const timerValue =
    selectedTimerMode === 'per-question' ? `${selectedPerQuestionSeconds}s` : `${Math.round(selectedFullTestSeconds / 60)}m`;
  const dashboardMetrics = [
    {
      label: 'Questions',
      value: detectedQuestionCount,
      detail: questionsReady ? 'validated MCQs' : hasQuestionInput ? 'parsed so far' : 'waiting for input',
      tone: questionsReady ? 'ready' : 'idle',
    },
    {
      label: 'Format issues',
      value: issueCount,
      detail: issueCount === 0 ? 'clean workspace' : 'fix before launch',
      tone: issueCount === 0 ? 'ready' : 'attention',
    },
    {
      label: 'Timer',
      value: timerValue,
      detail: selectedTimerMode === 'per-question' ? 'per question mode' : 'full test mode',
      tone: 'accent',
    },
    {
      label: 'Source',
      value: questionSource === 'manual' ? 'Manual' : questionSource === 'chatgpt' ? 'GPT' : 'AI',
      detail: sourceLabel,
      tone: 'source',
    },
  ];
  const setupSteps = [
    {
      number: '1',
      label: 'Source',
      detail: sourceLabel,
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
      <aside className="setup-summary" aria-label="Test setup summary">
        <div className="setup-profile-card">
          <span className="setup-profile-mark">QS</span>
          <span>
            <strong>Quiz Studio</strong>
            <small>Entry test command center</small>
          </span>
        </div>

        <nav className="setup-progress" aria-label="Test setup progress">
          {setupSteps.map((step) => (
            <div className={`setup-progress-item ${step.status}`} key={step.number}>
              <span className="setup-progress-number">{step.number}</span>
              <span>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </span>
            </div>
          ))}
        </nav>

        <div className="quick-start-card">
          <span className="step-label">Quick start</span>
          <p>New here? Load the sample, see the format, then replace it with your own MCQs.</p>
        </div>

        <div className="setup-summary-card">
          <span className="step-label">Launch panel</span>
          <h3>Launch checklist</h3>
          <div className="summary-list">
            <p>
              <span>Source</span>
              <strong>{sourceLabel}</strong>
            </p>
            <p>
              <span>Questions</span>
              <strong>{detectedQuestionCount}</strong>
            </p>
            <p>
              <span>Timer</span>
              <strong>{selectedTimerLabel}</strong>
            </p>
            <p>
              <span>Status</span>
              <strong className={questionsReady ? 'summary-ready' : ''}>{validationLabel}</strong>
            </p>
          </div>
          <div className="summary-actions">
            <button className="secondary-button" type="button" onClick={onLoadSampleQuestions}>
              Load Sample Questions
            </button>
            <button className="primary-button" type="button" onClick={onValidateAndStart}>
              {launchButtonLabel}
            </button>
          </div>
        </div>
      </aside>

      <div className="dashboard-main">
        <div className="dashboard-command">
          <div className="section-heading dashboard-heading dashboard-command-copy">
            <span className="dashboard-chip">Practice command center</span>
            <h2>Build a calm, exam-ready quiz session.</h2>
            <p>
              Bring in your MCQs, review the format, set the pace, and start with a workspace that feels simple and clear.
            </p>
            <div className="dashboard-guidance" role="status">
              <span>{workspaceQuality}</span>
              <strong>{nextAction}</strong>
            </div>
          </div>

          <div className="dashboard-kpi-grid" aria-label="Quiz setup metrics">
            {dashboardMetrics.map((metric) => (
              <div className={`dashboard-kpi ${metric.tone}`} key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </div>
            ))}
          </div>
        </div>

        <section className="setup-card" aria-labelledby="source-title">
          <div className="setup-card-heading">
            <span className="step-number">1</span>
            <div>
              <h3 id="source-title">Choose how to add questions</h3>
              <p>Pick the easiest path for your material. You can review everything before starting.</p>
            </div>
          </div>

          <div className="source-grid">
            <button
              className={`source-card ${questionSource === 'manual' ? 'selected' : ''}`}
              type="button"
              onClick={() => onChooseQuestionSource('manual')}
              aria-pressed={questionSource === 'manual'}
            >
              <span className="source-card-top">
                <span className="source-icon">PA</span>
                {questionSource === 'manual' && <span className="source-selected">Selected</span>}
              </span>
              <strong>Paste Ready MCQs</strong>
              <span>Best when your questions already include options and answer labels.</span>
            </button>
            <button
              className={`source-card ${questionSource === 'paper-ai' ? 'selected' : ''}`}
              type="button"
              onClick={() => onChooseQuestionSource('paper-ai')}
              aria-pressed={questionSource === 'paper-ai'}
            >
              <span className="source-card-top">
                <span className="source-icon">AI</span>
                {questionSource === 'paper-ai' && <span className="source-selected">Selected</span>}
              </span>
              <strong>Import Paper</strong>
              <span>Upload a PDF, photo, or screenshot and let AI prepare the MCQs.</span>
            </button>
            <button
              className={`source-card ${questionSource === 'lecture-ai' ? 'selected' : ''}`}
              type="button"
              onClick={() => onChooseQuestionSource('lecture-ai')}
              aria-pressed={questionSource === 'lecture-ai'}
            >
              <span className="source-card-top">
                <span className="source-icon">SL</span>
                {questionSource === 'lecture-ai' && <span className="source-selected">Selected</span>}
              </span>
              <strong>Use Lecture Slides</strong>
              <span>Create focused MCQs from your own slides or lecture images.</span>
            </button>
            <button
              className={`source-card ${questionSource === 'chatgpt' ? 'selected' : ''}`}
              type="button"
              onClick={() => onChooseQuestionSource('chatgpt')}
              aria-pressed={questionSource === 'chatgpt'}
            >
              <span className="source-card-top">
                <span className="source-icon">GP</span>
                {questionSource === 'chatgpt' && <span className="source-selected">Selected</span>}
              </span>
              <strong>Use Prompt</strong>
              <span>Copy the ready prompt, generate questions, and paste them back here.</span>
            </button>
          </div>

          {questionSource === 'manual' && (
            <div className="source-panel">
              <strong>Paste mode is ready.</strong>
              <p>Add your MCQs in the workspace below, or load the sample to see the exact format.</p>
            </div>
          )}

          {(questionSource === 'paper-ai' || questionSource === 'lecture-ai') && (
            <div className={`source-panel ai-source-panel ${pdfExtraction.status}`}>
              <div className="source-panel-copy">
                <strong>
                  {questionSource === 'lecture-ai' ? 'Create questions from slides' : 'Turn a paper into MCQs'}
                </strong>
                <p>
                  {questionSource === 'lecture-ai'
                    ? 'Upload lecture slides as a PDF or images. Gemini will use only the uploaded content.'
                    : 'Upload a practice paper PDF, photo, or screenshot. Gemini will convert it to the app format.'}
                </p>
              </div>

              {questionSource === 'lecture-ai' && (
                <label className="lecture-count-field">
                  <span>Question target</span>
                  <input
                    type="number"
                    min={MIN_LECTURE_QUESTION_COUNT}
                    max={MAX_LECTURE_QUESTION_COUNT}
                    value={lectureQuestionCount}
                    onChange={(event) => {
                      const nextCount = Number(event.target.value);
                      onLectureQuestionCountChange(
                        Number.isFinite(nextCount)
                          ? Math.min(MAX_LECTURE_QUESTION_COUNT, Math.max(MIN_LECTURE_QUESTION_COUNT, nextCount))
                          : 10,
                      );
                    }}
                  />
                  <small>
                    Choose {MIN_LECTURE_QUESTION_COUNT}-{MAX_LECTURE_QUESTION_COUNT} questions. AI will only use your uploaded slides.
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
                onChange={(event) => onPaperUpload(event.target.files)}
              />
              <label className="pdf-upload-box compact" htmlFor="paper-pdf">
                <strong>Upload files</strong>
                <span>{pdfExtraction.fileName || 'PDF, PNG, JPG, or WebP'}</span>
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
                  <strong>Use a ready prompt</strong>
                  <small>Copy the prompt, generate MCQs, then paste the result into the workspace.</small>
                </span>
              </summary>
              <div className="prompt-card-body">
                <textarea className="prompt-box" value={CHATGPT_PROMPT} readOnly rows={12} />
                <div className="prompt-actions">
                  <button className="secondary-button" type="button" onClick={onCopyChatGptPrompt}>
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
              <h3 id="review-title">Question workspace</h3>
              <p>Paste, review, and fix questions here. The app checks the format before launch.</p>
            </div>
            {hasQuestionInput && questionPreview.errors.length === 0 && (
              <span className="detected-pill">{questionPreview.questions.length} detected</span>
            )}
          </div>

          <div className={`review-status-row ${questionsReady ? 'ready' : questionsNeedFix ? 'attention' : ''}`}>
            <div>
              <strong>Format check</strong>
              <span>The app checks your questions here before the quiz begins.</span>
            </div>
            <span className="validation-badge">{validationLabel}</span>
          </div>

          <textarea
            className="question-input dashboard-question-input"
            value={pasteText}
            onChange={(event) => onQuestionInputChange(event.target.value)}
            placeholder="Q: What is 25 percent of 240?&#10;A: 40&#10;B: 60&#10;C: 80&#10;D: 100&#10;ANSWER: B&#10;REASON: 25 percent means one-fourth. One-fourth of 240 is 60."
            spellCheck={false}
          />

          {showAutoFormatSuggestion && (
            <div className={`format-helper ${autoFormat.status}`} role="region" aria-label="Auto format helper">
              <div className="format-helper-copy">
                <strong>Format needs attention</strong>
                <p>
                  If your text came from ChatGPT, notes, or a copied paper, Auto Format can clean numbering, markdown,
                  option labels, answer labels, and extra intro text into the quiz format.
                </p>
              </div>
              <div className="format-helper-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={onAutoFormatMcqs}
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
              <h3 id="timer-picker-title">Timer and pace</h3>
              <p>Choose a focused sprint or a full exam-style countdown.</p>
            </div>
          </div>

          <div className="timer-mode-grid">
            <article className={`timer-mode-card ${selectedTimerMode === 'per-question' ? 'selected' : ''}`}>
              <button
                className="timer-mode-button"
                type="button"
                onClick={() => onSelectedTimerModeChange('per-question')}
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
                onClick={() => onSelectedTimerModeChange('full-test')}
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
                      onClick={() => onSelectedPerQuestionSecondsChange(seconds)}
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
                        onSelectedFullTestSecondsChange(seconds);
                        onCustomFullTestMinutesChange(seconds / 60);
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
                        onCustomFullTestMinutesChange(minutes);
                        onSelectedFullTestSecondsChange(minutes * 60);
                      }}
                    />
                  </label>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

    </section>
  );
}
