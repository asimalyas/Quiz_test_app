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
              onClick={() => onChooseQuestionSource('manual')}
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
              onClick={() => onChooseQuestionSource('paper-ai')}
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
              onClick={() => onChooseQuestionSource('lecture-ai')}
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
              onClick={() => onChooseQuestionSource('chatgpt')}
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
                      onLectureQuestionCountChange(
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
                onChange={(event) => onPaperUpload(event.target.files)}
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
              <h3 id="timer-picker-title">Choose Timer</h3>
              <p>Select per-question pressure or one full-test countdown.</p>
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
            <button className="secondary-button" type="button" onClick={onLoadSampleQuestions}>
              Load Sample Questions
            </button>
            <button className="primary-button" type="button" onClick={onValidateAndStart}>
              Start Test
            </button>
          </div>
        </div>
      </aside>
    </section>
  );
}
