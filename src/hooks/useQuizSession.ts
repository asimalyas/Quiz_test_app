import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_FULL_TEST_SECONDS,
  DEFAULT_PER_QUESTION_SECONDS,
} from '../lib/constants';
import { makeQuestionId } from '../lib/parser';
import {
  emptyAnswers,
  getActiveQuestion,
  getElapsedSeconds,
  getQuestionPosition,
  getReviewStatus,
  getScore,
  queueSkippedQuestion,
} from '../lib/quiz';
import { loadSession, saveSession } from '../lib/storage';
import type { OptionKey, Question, QuizSession, ResultFilter, TimerMode } from '../types';

type UseQuizSessionOptions = {
  selectedTimerMode: TimerMode;
  selectedPerQuestionSeconds: number;
  selectedFullTestSeconds: number;
};

export function useQuizSession({
  selectedTimerMode,
  selectedPerQuestionSeconds,
  selectedFullTestSeconds,
}: UseQuizSessionOptions) {
  const [session, setSession] = useState<QuizSession | null>(() => loadSession());
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [timeEndedQuestionId, setTimeEndedQuestionId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const autoAdvancedQuestionRef = useRef<string | null>(null);
  const autoAdvanceTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const fullTestSubmittedRef = useRef(false);

  const screen = session?.screen ?? 'paste';
  const currentQuestion = session ? getActiveQuestion(session) : undefined;
  const currentQuestionId = currentQuestion?.id;
  const currentQuestionPosition = session ? getQuestionPosition(session.questions, currentQuestion?.id) : 0;
  const perQuestionSeconds = session?.perQuestionSeconds ?? selectedPerQuestionSeconds;
  const fullTestSeconds = session?.fullTestSeconds ?? selectedFullTestSeconds;
  const fullTestRemaining = session?.remainingFullTestSeconds ?? fullTestSeconds;
  const isFullTestMode = session?.timerMode === 'full-test';
  const isPerQuestionMode = !session || session.timerMode === 'per-question';
  const elapsedSeconds =
    session?.screen === 'quiz' && isPerQuestionMode ? Math.floor((now - session.questionStartedAt) / 1000) : 0;
  const secondsLeft = Math.min(perQuestionSeconds, Math.max(0, perQuestionSeconds - elapsedSeconds));
  const hasMoreAfterCurrent = session
    ? Boolean(
        session.activeSkippedQuestionId
          ? session.skippedQuestionIds.length > 0
          : session.currentIndex < session.questions.length - 1 || session.skippedQuestionIds.length > 0,
      )
    : false;
  const isFinalQuestion = session ? !hasMoreAfterCurrent : false;
  const skippedCount = session
    ? session.skippedQuestionIds.length +
      (session.activeSkippedQuestionId && !session.answers[session.activeSkippedQuestionId] ? 1 : 0)
    : 0;
  const answeredCount = session ? session.questions.filter((question) => session.answers[question.id]).length : 0;
  const notAttemptedCount = session ? Math.max(0, session.questions.length - answeredCount - skippedCount) : 0;
  const displaySeconds = isFullTestMode ? fullTestRemaining : secondsLeft;
  const timerLimit = isFullTestMode ? fullTestSeconds : perQuestionSeconds;
  const isUrgent =
    screen === 'quiz' &&
    displaySeconds > 0 &&
    (isFullTestMode ? displaySeconds <= 60 : displaySeconds <= 10);
  const timerProgress = timerLimit > 0 ? (displaySeconds / timerLimit) * 100 : 0;
  const progressPercent = session
    ? ((Math.min(
        session.currentIndex +
          (isPerQuestionMode ? (perQuestionSeconds - secondsLeft) / perQuestionSeconds : 0),
        session.questions.length,
      )) /
        session.questions.length) *
      100
    : 0;

  const score = session ? getScore(session.questions, session.answers) : null;
  const resultGroups = (() => {
    if (!session) {
      return {
        all: [],
        correct: [],
        incorrect: [],
        'not-attempted': [],
      };
    }

    const withStatus = session.questions.map((question, index) => ({
      question,
      index,
      status: getReviewStatus(question, session.answers),
    }));

    return {
      all: withStatus,
      correct: withStatus.filter((item) => item.status === 'correct'),
      incorrect: withStatus.filter((item) => item.status === 'incorrect'),
      'not-attempted': withStatus.filter((item) => item.status === 'not-attempted'),
    };
  })();

  useEffect(() => {
    if (session) {
      saveSession(session);
    }
  }, [session]);

  useEffect(() => {
    if (screen !== 'quiz') {
      return;
    }

    const intervalId = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      setSession((previous) => {
        if (!previous || previous.screen !== 'quiz' || previous.timerMode !== 'full-test') {
          return previous;
        }

        const nextRemaining = Math.max(0, Math.ceil(((previous.fullTestEndsAt ?? timestamp) - timestamp) / 1000));
        if (nextRemaining === previous.remainingFullTestSeconds) {
          return previous;
        }

        return {
          ...previous,
          remainingFullTestSeconds: nextRemaining,
        };
      });
    }, 250);
    return () => window.clearInterval(intervalId);
  }, [screen]);

  useEffect(() => {
    return () => {
      if (autoAdvanceTimeoutRef.current) {
        window.clearTimeout(autoAdvanceTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!session || session.screen !== 'quiz' || session.timerMode !== 'per-question') {
      return;
    }

    if (secondsLeft > 0) {
      return;
    }

    if (currentQuestion && autoAdvancedQuestionRef.current === currentQuestion.id) {
      return;
    }

    if (!currentQuestion) {
      return;
    }

    autoAdvancedQuestionRef.current = currentQuestion.id;
    setTimeEndedQuestionId(currentQuestion.id);
    autoAdvanceTimeoutRef.current = window.setTimeout(() => {
      goToNextQuestion();
    }, 700);
  }, [secondsLeft, session]);

  useEffect(() => {
    if (!session || session.screen !== 'quiz' || session.timerMode !== 'full-test') {
      return;
    }

    if ((session.remainingFullTestSeconds ?? 1) > 0 || fullTestSubmittedRef.current) {
      return;
    }

    fullTestSubmittedRef.current = true;
    submitTest(false);
  }, [session]);

  function startQuiz(
    questions: Question[],
    timerSettings = {
      timerMode: selectedTimerMode,
      perQuestionSeconds: selectedPerQuestionSeconds,
      fullTestSeconds: selectedFullTestSeconds,
    },
  ) {
    if (autoAdvanceTimeoutRef.current) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    const startedAt = Date.now();
    const fullTestEndsAt =
      timerSettings.timerMode === 'full-test' ? startedAt + timerSettings.fullTestSeconds * 1000 : undefined;
    const nextSession: QuizSession = {
      screen: 'quiz',
      questions,
      answers: { ...emptyAnswers },
      timeSpent: {},
      timerMode: timerSettings.timerMode,
      perQuestionSeconds: timerSettings.timerMode === 'per-question' ? timerSettings.perQuestionSeconds : undefined,
      fullTestSeconds: timerSettings.timerMode === 'full-test' ? timerSettings.fullTestSeconds : undefined,
      remainingFullTestSeconds: timerSettings.timerMode === 'full-test' ? timerSettings.fullTestSeconds : undefined,
      currentIndex: 0,
      questionStartedAt: startedAt,
      skippedQuestionIds: [],
      fullTestEndsAt,
    };
    setNow(startedAt);
    setSession(nextSession);
    setResultFilter('all');
    setTimeEndedQuestionId(null);
    autoAdvancedQuestionRef.current = null;
    fullTestSubmittedRef.current = false;
  }

  function selectAnswer(option: OptionKey) {
    if (!session || !currentQuestion) {
      return;
    }

    setSession((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        answers: {
          ...previous.answers,
          [currentQuestion.id]: option,
        },
        skippedQuestionIds: previous.skippedQuestionIds.filter((questionId) => questionId !== currentQuestion.id),
      };
    });
  }

  function addCurrentTimeSpent(previous: QuizSession, timestamp: number) {
    const activeQuestion = getActiveQuestion(previous);
    if (!activeQuestion) {
      return previous.timeSpent;
    }

    const visitSeconds = getElapsedSeconds(
      previous.questionStartedAt,
      timestamp,
      previous.timerMode === 'per-question' ? previous.perQuestionSeconds : undefined,
    );

    return {
      ...previous.timeSpent,
      [activeQuestion.id]: (previous.timeSpent[activeQuestion.id] ?? 0) + visitSeconds,
    };
  }

  function goToNextQuestion() {
    if (autoAdvanceTimeoutRef.current) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    const nextStartedAt = Date.now();

    setSession((previous) => {
      if (!previous || previous.screen !== 'quiz') {
        return previous;
      }

      const timeSpent = addCurrentTimeSpent(previous, nextStartedAt);
      const activateSkipped = (queue: string[]) => {
        const [nextSkippedQuestionId, ...remainingSkippedIds] = queue;
        if (!nextSkippedQuestionId) {
          return {
            ...previous,
            timeSpent,
            activeSkippedQuestionId: undefined,
            skippedQuestionIds: [],
            screen: 'results' as const,
            completedAt: nextStartedAt,
          };
        }

        return {
          ...previous,
          timeSpent,
          currentIndex: previous.questions.length,
          activeSkippedQuestionId: nextSkippedQuestionId,
          skippedQuestionIds: remainingSkippedIds,
          questionStartedAt: nextStartedAt,
        };
      };

      if (previous.activeSkippedQuestionId) {
        return activateSkipped(previous.skippedQuestionIds);
      }

      const nextIndex = previous.currentIndex + 1;

      if (nextIndex >= previous.questions.length) {
        return activateSkipped(previous.skippedQuestionIds);
      }

      return {
        ...previous,
        timeSpent,
        currentIndex: nextIndex,
        activeSkippedQuestionId: undefined,
        questionStartedAt: nextStartedAt,
      };
    });

    setTimeEndedQuestionId(null);
    setNow(nextStartedAt);
  }

  function skipQuestion() {
    if (autoAdvanceTimeoutRef.current) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    const skippedAt = Date.now();

    setSession((previous) => {
      if (!previous || previous.screen !== 'quiz') {
        return previous;
      }

      const activeQuestion = getActiveQuestion(previous);
      if (!activeQuestion) {
        return previous;
      }

      const timeSpent = addCurrentTimeSpent(previous, skippedAt);
      const queuedSkippedIds = queueSkippedQuestion(previous.skippedQuestionIds, activeQuestion.id);

      const activateSkipped = (queue: string[]) => {
        const [nextSkippedQuestionId, ...remainingSkippedIds] = queue;
        if (!nextSkippedQuestionId) {
          return {
            ...previous,
            timeSpent,
            activeSkippedQuestionId: undefined,
            skippedQuestionIds: [],
            screen: 'results' as const,
            completedAt: skippedAt,
          };
        }

        return {
          ...previous,
          timeSpent,
          currentIndex: previous.questions.length,
          activeSkippedQuestionId: nextSkippedQuestionId,
          skippedQuestionIds: remainingSkippedIds,
          questionStartedAt: skippedAt,
        };
      };

      if (previous.activeSkippedQuestionId) {
        return activateSkipped(queuedSkippedIds);
      }

      const nextIndex = previous.currentIndex + 1;
      if (nextIndex >= previous.questions.length) {
        return activateSkipped(queuedSkippedIds);
      }

      return {
        ...previous,
        timeSpent,
        currentIndex: nextIndex,
        skippedQuestionIds: queuedSkippedIds,
        questionStartedAt: skippedAt,
      };
    });

    setTimeEndedQuestionId(null);
    setNow(skippedAt);
  }

  function jumpToQuestion(questionId: string) {
    if (autoAdvanceTimeoutRef.current) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    const jumpedAt = Date.now();

    setSession((previous) => {
      if (!previous || previous.screen !== 'quiz') {
        return previous;
      }

      const targetIndex = previous.questions.findIndex((question) => question.id === questionId);
      const activeQuestion = getActiveQuestion(previous);

      if (targetIndex < 0 || activeQuestion?.id === questionId) {
        return previous;
      }

      const activeSkippedQuestionId = previous.activeSkippedQuestionId;
      const shouldRequeueActiveSkipped = activeSkippedQuestionId && !previous.answers[activeSkippedQuestionId];

      return {
        ...previous,
        timeSpent: addCurrentTimeSpent(previous, jumpedAt),
        currentIndex: targetIndex,
        activeSkippedQuestionId: undefined,
        skippedQuestionIds: shouldRequeueActiveSkipped
          ? queueSkippedQuestion(previous.skippedQuestionIds, activeSkippedQuestionId)
          : previous.skippedQuestionIds,
        questionStartedAt: jumpedAt,
      };
    });

    setTimeEndedQuestionId(null);
    setNow(jumpedAt);
  }

  function submitTest(shouldConfirm = true) {
    if (shouldConfirm) {
      const confirmed = window.confirm('Finish the test now? Unanswered questions will be marked as not attempted.');

      if (!confirmed) {
        return;
      }
    }

    if (autoAdvanceTimeoutRef.current) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    const finishedAt = Date.now();
    setSession((previous) =>
      previous
        ? {
            ...previous,
            timeSpent: previous.screen === 'quiz' ? addCurrentTimeSpent(previous, finishedAt) : previous.timeSpent,
            remainingFullTestSeconds:
              previous.timerMode === 'full-test' ? Math.max(0, previous.remainingFullTestSeconds ?? 0) : undefined,
            screen: 'results',
            completedAt: finishedAt,
          }
        : previous,
    );
    setTimeEndedQuestionId(null);
    setResultFilter('all');
  }

  function finishTest() {
    submitTest(true);
  }

  function startNewTestSession() {
    if (autoAdvanceTimeoutRef.current) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    setSession(null);
    saveSession(null);
    setTimeEndedQuestionId(null);
    setResultFilter('all');
    fullTestSubmittedRef.current = false;
  }

  function retryWrongQuestions() {
    if (!session) {
      return;
    }

    const retryQuestions = session.questions.filter((question) => getReviewStatus(question, session.answers) !== 'correct');
    if (retryQuestions.length === 0) {
      return;
    }

    startQuiz(
      retryQuestions.map((question, index) => ({
        ...question,
        id: makeQuestionId(index, question.prompt),
      })),
      {
        timerMode: session.timerMode,
        perQuestionSeconds: session.perQuestionSeconds ?? DEFAULT_PER_QUESTION_SECONDS,
        fullTestSeconds: session.fullTestSeconds ?? DEFAULT_FULL_TEST_SECONDS,
      },
    );
  }

  return {
    session,
    screen,
    currentQuestion,
    currentQuestionId,
    currentQuestionPosition,
    skippedCount,
    answeredCount,
    notAttemptedCount,
    displaySeconds,
    isFullTestMode,
    isUrgent,
    timerProgress,
    progressPercent,
    isFinalQuestion,
    timeEndedQuestionId,
    score,
    resultGroups,
    resultFilter,
    setResultFilter,
    startQuiz,
    selectAnswer,
    goToNextQuestion,
    skipQuestion,
    jumpToQuestion,
    finishTest,
    startNewTestSession,
    retryWrongQuestions,
  };
}
