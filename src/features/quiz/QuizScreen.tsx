import type { CSSProperties } from 'react';
import { QuestionPalette } from '../../components/QuestionPalette';
import { TimerCard } from '../../components/TimerCard';
import type { OptionKey, Question, QuizSession } from '../../types';

type QuizScreenProps = {
  session: QuizSession;
  currentQuestion: Question;
  currentQuestionId?: string;
  currentQuestionPosition: number;
  skippedCount: number;
  answeredCount: number;
  notAttemptedCount: number;
  timeEndedQuestionId: string | null;
  isUrgent: boolean;
  isFullTestMode: boolean;
  displaySeconds: number;
  timerStyle: CSSProperties;
  progressPercent: number;
  isFinalQuestion: boolean;
  onSelectAnswer: (option: OptionKey) => void;
  onFinishTest: () => void;
  onSkipQuestion: () => void;
  onNextQuestion: () => void;
  onJumpToQuestion: (questionId: string) => void;
};

export function QuizScreen({
  session,
  currentQuestion,
  currentQuestionId,
  currentQuestionPosition,
  skippedCount,
  answeredCount,
  notAttemptedCount,
  timeEndedQuestionId,
  isUrgent,
  isFullTestMode,
  displaySeconds,
  timerStyle,
  progressPercent,
  isFinalQuestion,
  onSelectAnswer,
  onFinishTest,
  onSkipQuestion,
  onNextQuestion,
  onJumpToQuestion,
}: QuizScreenProps) {
  return (
    <section className="screen-stack quiz-layout">
      <div className="quiz-main-grid">
        <div className="quiz-main-column">
          <TimerCard
            isMobile
            isUrgent={isUrgent}
            isFullTestMode={isFullTestMode}
            displaySeconds={displaySeconds}
            timerStyle={timerStyle}
          />

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
              <QuestionPalette
                compact
                session={session}
                currentQuestionId={currentQuestionId}
                answeredCount={answeredCount}
                skippedCount={skippedCount}
                notAttemptedCount={notAttemptedCount}
                onJumpToQuestion={onJumpToQuestion}
              />
            </details>

            {timeEndedQuestionId === currentQuestion.id && (
              <div className="time-alert ended" role="status">
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
                    onClick={() => onSelectAnswer(key)}
                    aria-pressed={selected}
                  >
                    <span className="option-key">{key}</span>
                    <span>{currentQuestion.options[key]}</span>
                  </button>
                );
              })}
            </div>

            <div className="actions quiz-actions">
              <button className="finish-button" type="button" onClick={onFinishTest}>
                Finish Test
              </button>
              <button className="secondary-button skip-button" type="button" onClick={onSkipQuestion}>
                Skip
              </button>
              <button className="primary-button forward-button" type="button" onClick={onNextQuestion}>
                {isFinalQuestion ? 'Submit Test' : 'Next Question'}
              </button>
            </div>
          </article>
        </div>

        <aside className="quiz-sidebar" aria-label="Quiz tools">
          <TimerCard
            isUrgent={isUrgent}
            isFullTestMode={isFullTestMode}
            displaySeconds={displaySeconds}
            timerStyle={timerStyle}
          />
          <QuestionPalette
            session={session}
            currentQuestionId={currentQuestionId}
            answeredCount={answeredCount}
            skippedCount={skippedCount}
            notAttemptedCount={notAttemptedCount}
            onJumpToQuestion={onJumpToQuestion}
          />
        </aside>
      </div>
    </section>
  );
}
