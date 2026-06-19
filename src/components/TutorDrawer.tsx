import type { FormEvent } from 'react';
import { TUTOR_QUICK_ACTIONS } from '../lib/constants';
import { getStatusLabel } from '../lib/labels';
import { renderTutorText } from '../lib/tutor';
import type { TutorMessage, TutorQuestionContext, TutorStatus } from '../types';

type TutorDrawerProps = {
  context: TutorQuestionContext | null;
  messages: TutorMessage[];
  input: string;
  status: TutorStatus;
  error: string;
  onClose: () => void;
  onInputChange: (value: string) => void;
  onSendMessage: (message: string) => void;
};

export function TutorDrawer({
  context,
  messages,
  input,
  status,
  error,
  onClose,
  onInputChange,
  onSendMessage,
}: TutorDrawerProps) {
  if (!context) {
    return null;
  }

  const { question, index, status: reviewStatus, selected } = context;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSendMessage(input);
  }

  return (
    <div className="tutor-overlay" role="dialog" aria-modal="true" aria-labelledby="tutor-title">
      <section className="tutor-panel">
        <div className="tutor-header">
          <div>
            <p className="eyebrow">AI Tutor</p>
            <h2 id="tutor-title">Discuss This Question</h2>
            <span>
              Question {index + 1} | {getStatusLabel(reviewStatus)}
            </span>
          </div>
          <button className="ghost-button tutor-close" type="button" onClick={onClose} aria-label="Close AI Tutor">
            Close
          </button>
        </div>

        <div className="tutor-context">
          <strong>{question.prompt}</strong>
          <p>
            Selected: {selected ? `${selected}: ${question.options[selected]}` : 'No answer selected'} | Correct:{' '}
            {question.answer}: {question.options[question.answer]}
          </p>
        </div>

        <div className="tutor-quick-actions" aria-label="AI Tutor quick actions">
          {TUTOR_QUICK_ACTIONS.map((action) => (
            <button
              className="tutor-chip"
              type="button"
              key={action}
              onClick={() => onSendMessage(action)}
              disabled={status === 'thinking'}
            >
              {action}
            </button>
          ))}
        </div>

        <div className="tutor-messages" aria-live="polite">
          {messages.length === 0 ? (
            <div className="tutor-empty">
              <strong>Ask for a hint, steps, or answer verification.</strong>
              <p>I will keep the answer short and focused on this question.</p>
            </div>
          ) : (
            messages.map((message) => (
              <div className={`tutor-message ${message.role}`} key={message.id}>
                <span className="tutor-speaker">{message.role === 'assistant' ? 'Tutor' : 'You'}</span>
                <p>{renderTutorText(message.text)}</p>
              </div>
            ))
          )}
          {status === 'thinking' && (
            <div className="tutor-message assistant">
              <span className="tutor-speaker">Tutor</span>
              <p>Thinking through the shortest helpful answer...</p>
            </div>
          )}
        </div>

        {error && (
          <div className="tutor-error" role="alert">
            {error}
          </div>
        )}

        <form className="tutor-form" onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="Ask your question or paste your reasoning..."
            rows={3}
          />
          <button className="primary-button" type="submit" disabled={status === 'thinking' || !input.trim()}>
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
