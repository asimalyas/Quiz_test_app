import type { OptionKey, QuizSession } from '../types';

type QuestionPaletteProps = {
  session: QuizSession;
  compact?: boolean;
  currentQuestionId?: string;
  answeredCount: number;
  skippedCount: number;
  notAttemptedCount: number;
  onJumpToQuestion: (questionId: string) => void;
};

export function QuestionPalette({
  session,
  compact = false,
  currentQuestionId,
  answeredCount,
  skippedCount,
  notAttemptedCount,
  onJumpToQuestion,
}: QuestionPaletteProps) {
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
            const isAnswered = Boolean(session.answers[question.id] as OptionKey | undefined);
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
                onClick={() => onJumpToQuestion(question.id)}
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
