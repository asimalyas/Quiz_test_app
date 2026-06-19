import type { QuizSession } from '../types';
import { DEFAULT_FULL_TEST_SECONDS, DEFAULT_PER_QUESTION_SECONDS, LEGACY_STORAGE_KEY, STORAGE_KEY } from './constants';

export function normalizeSession(parsed: QuizSession & { timePerQuestion?: number }): QuizSession | null {
  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    return null;
  }

  const timerMode = parsed.timerMode ?? 'per-question';
  const perQuestionSeconds = parsed.perQuestionSeconds ?? parsed.timePerQuestion ?? DEFAULT_PER_QUESTION_SECONDS;
  const fullTestSeconds = parsed.fullTestSeconds ?? DEFAULT_FULL_TEST_SECONDS;
  const fullTestEndsAt =
    parsed.fullTestEndsAt ??
    (timerMode === 'full-test' ? Date.now() + (parsed.remainingFullTestSeconds ?? fullTestSeconds) * 1000 : undefined);
  const remainingFullTestSeconds =
    timerMode === 'full-test'
      ? Math.max(0, Math.ceil(((fullTestEndsAt ?? Date.now()) - Date.now()) / 1000))
      : undefined;

  return {
    screen: parsed.screen ?? 'paste',
    questions: parsed.questions,
    answers: parsed.answers ?? {},
    timeSpent: parsed.timeSpent ?? {},
    timerMode,
    perQuestionSeconds,
    fullTestSeconds,
    remainingFullTestSeconds,
    currentIndex: parsed.currentIndex ?? 0,
    questionStartedAt: parsed.questionStartedAt ?? Date.now(),
    skippedQuestionIds: parsed.skippedQuestionIds ?? [],
    activeSkippedQuestionId: parsed.activeSkippedQuestionId,
    fullTestEndsAt,
    completedAt: parsed.completedAt,
  };
}

export function loadSession(): QuizSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return normalizeSession(JSON.parse(raw) as QuizSession);
  } catch {
    return null;
  }
}

export function saveSession(session: QuizSession | null) {
  localStorage.removeItem(LEGACY_STORAGE_KEY);

  if (!session) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}
