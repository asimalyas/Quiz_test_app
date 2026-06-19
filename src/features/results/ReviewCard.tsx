import { NO_EXPLANATION_TEXT } from '../../lib/constants';
import { getStatusLabel } from '../../lib/labels';
import { formatTimeSpent } from '../../lib/quiz';
import type { OptionKey, Question, ReviewStatus } from '../../types';

type ReviewCardProps = {
  question: Question;
  index: number;
  status: ReviewStatus;
  selected?: OptionKey;
  timeSpent?: number;
  onOpenTutor: (questionId: string) => void;
};

export function ReviewCard({ question, index, status, selected, timeSpent, onOpenTutor }: ReviewCardProps) {
  return (
    <article className={`review-item ${status}`} key={question.id}>
      <div className="review-heading">
        <h3>
          {index + 1}. {question.prompt}
        </h3>
        <div className="review-heading-actions">
          <span className={`status-pill ${status}`}>{getStatusLabel(status)}</span>
          <button className="tutor-open-button" type="button" onClick={() => onOpenTutor(question.id)}>
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
          Selected: <strong>{selected ? `${selected}: ${question.options[selected]}` : 'No answer selected'}</strong>
        </p>
        <p>
          Correct: <strong>{question.answer}: {question.options[question.answer]}</strong>
        </p>
        <p>
          Time spent: <strong>{formatTimeSpent(timeSpent)}</strong>
        </p>
      </div>

      <div className="explanation-box">
        <strong>Explanation</strong>
        <p>{question.explanation || NO_EXPLANATION_TEXT}</p>
      </div>
    </article>
  );
}
