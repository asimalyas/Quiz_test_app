import { ReviewCard } from './ReviewCard';
import type { OptionKey, QuizSession, ResultFilter, ResultGroups } from '../../types';

type ScoreSummary = {
  total: number;
  correct: number;
  wrong: number;
  unanswered: number;
  percentage: number;
};

type ResultsScreenProps = {
  session: QuizSession;
  score: ScoreSummary;
  resultGroups: ResultGroups;
  resultFilter: ResultFilter;
  onResultFilterChange: (filter: ResultFilter) => void;
  onStartNewTest: () => void;
  onRetryWrongQuestions: () => void;
  onOpenTutor: (questionId: string) => void;
};

export function ResultsScreen({
  session,
  score,
  resultGroups,
  resultFilter,
  onResultFilterChange,
  onStartNewTest,
  onRetryWrongQuestions,
  onOpenTutor,
}: ResultsScreenProps) {
  const activeReviewItems = resultGroups[resultFilter];

  return (
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
            onClick={() => onResultFilterChange(tab.key)}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      <div className="review-list">
        {activeReviewItems.length === 0 ? (
          <p className="empty-review">No questions in this section.</p>
        ) : (
          activeReviewItems.map(({ question, index, status }) => (
            <ReviewCard
              key={question.id}
              question={question}
              index={index}
              status={status}
              selected={session.answers[question.id] as OptionKey | undefined}
              timeSpent={session.timeSpent[question.id]}
              onOpenTutor={onOpenTutor}
            />
          ))
        )}
      </div>

      <div className="actions">
        <button className="secondary-button" type="button" onClick={onStartNewTest}>
          Start New Test
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={onRetryWrongQuestions}
          disabled={score.wrong + score.unanswered === 0}
        >
          Retry Wrong Questions
        </button>
      </div>
    </section>
  );
}
