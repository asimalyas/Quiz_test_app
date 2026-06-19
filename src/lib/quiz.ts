import type { OptionKey, Question, QuizSession, ReviewStatus } from '../types';

export const emptyAnswers: Record<string, OptionKey> = {};

export function getReviewStatus(question: Question, answers: Record<string, OptionKey>): ReviewStatus {
  const selected = answers[question.id];

  if (!selected) {
    return 'not-attempted';
  }

  return selected === question.answer ? 'correct' : 'incorrect';
}

export function getScore(questions: Question[], answers: Record<string, OptionKey>) {
  const total = questions.length;
  const correct = questions.filter((question) => getReviewStatus(question, answers) === 'correct').length;
  const unanswered = questions.filter((question) => getReviewStatus(question, answers) === 'not-attempted').length;
  const wrong = total - correct - unanswered;
  const percentage = total === 0 ? 0 : Math.round((correct / total) * 100);

  return { total, correct, wrong, unanswered, percentage };
}

export function getActiveQuestion(session: QuizSession) {
  if (session.activeSkippedQuestionId) {
    return session.questions.find((question) => question.id === session.activeSkippedQuestionId);
  }

  return session.questions[session.currentIndex];
}

export function getQuestionPosition(questions: Question[], questionId?: string) {
  const index = questions.findIndex((question) => question.id === questionId);
  return index >= 0 ? index + 1 : 0;
}

export function queueSkippedQuestion(queue: string[], questionId: string) {
  return [...queue.filter((queuedQuestionId) => queuedQuestionId !== questionId), questionId];
}

export function getElapsedSeconds(questionStartedAt: number, timestamp = Date.now(), limitSeconds?: number) {
  const elapsed = Math.max(0, Math.ceil((timestamp - questionStartedAt) / 1000));
  return typeof limitSeconds === 'number' ? Math.min(limitSeconds, elapsed) : elapsed;
}

export function formatTimeSpent(seconds?: number) {
  const safeSeconds = Math.max(0, seconds ?? 0);
  if (safeSeconds < 60) {
    return `${safeSeconds} sec`;
  }

  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
}

export function formatTimerClock(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  if (safeSeconds < 60) {
    return `${safeSeconds}`;
  }

  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
