import type { CSSProperties } from 'react';
import { formatTimerClock } from '../lib/quiz';

type TimerCardProps = {
  isMobile?: boolean;
  isUrgent: boolean;
  isFullTestMode: boolean;
  displaySeconds: number;
  timerStyle: CSSProperties;
};

export function TimerCard({ isMobile = false, isUrgent, isFullTestMode, displaySeconds, timerStyle }: TimerCardProps) {
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
