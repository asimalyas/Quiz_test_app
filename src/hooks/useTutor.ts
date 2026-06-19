import { useMemo, useState } from 'react';
import { getReviewStatus } from '../lib/quiz';
import { makeTutorMessage } from '../lib/tutor';
import type { QuizSession, TutorMessage, TutorQuestionContext, TutorStatus } from '../types';

export function useTutor(session: QuizSession | null) {
  const [activeTutorQuestionId, setActiveTutorQuestionId] = useState<string | null>(null);
  const [tutorMessagesByQuestionId, setTutorMessagesByQuestionId] = useState<Record<string, TutorMessage[]>>({});
  const [tutorInput, setTutorInput] = useState('');
  const [tutorStatus, setTutorStatus] = useState<TutorStatus>('idle');
  const [tutorError, setTutorError] = useState('');

  const activeTutorContext = useMemo<TutorQuestionContext | null>(() => {
    if (!session || !activeTutorQuestionId) {
      return null;
    }

    const index = session.questions.findIndex((question) => question.id === activeTutorQuestionId);
    if (index < 0) {
      return null;
    }

    const question = session.questions[index];
    return {
      question,
      index,
      status: getReviewStatus(question, session.answers),
      selected: session.answers[question.id],
    };
  }, [session, activeTutorQuestionId]);

  const activeTutorMessages = activeTutorQuestionId ? tutorMessagesByQuestionId[activeTutorQuestionId] ?? [] : [];

  function openTutor(questionId: string) {
    setActiveTutorQuestionId(questionId);
    setTutorInput('');
    setTutorError('');
    setTutorStatus('idle');
  }

  function closeTutor() {
    setActiveTutorQuestionId(null);
    setTutorInput('');
    setTutorError('');
    setTutorStatus('idle');
  }

  function resetTutor() {
    setActiveTutorQuestionId(null);
    setTutorMessagesByQuestionId({});
    setTutorInput('');
    setTutorError('');
    setTutorStatus('idle');
  }

  async function sendTutorMessage(messageText: string) {
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage || !activeTutorContext || tutorStatus === 'thinking') {
      return;
    }

    const questionId = activeTutorContext.question.id;
    const userMessage = makeTutorMessage('user', trimmedMessage);
    const previousMessages = tutorMessagesByQuestionId[questionId] ?? [];
    const nextMessages = [...previousMessages, userMessage];

    setTutorMessagesByQuestionId((previous) => ({
      ...previous,
      [questionId]: nextMessages,
    }));
    setTutorInput('');
    setTutorError('');
    setTutorStatus('thinking');

    try {
      const response = await fetch('/api/tutor-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: activeTutorContext.question.prompt,
          options: activeTutorContext.question.options,
          correctAnswer: activeTutorContext.question.answer,
          selectedAnswer: activeTutorContext.selected,
          status: activeTutorContext.status,
          explanation: activeTutorContext.question.explanation,
          userMessage: trimmedMessage,
          messages: nextMessages.slice(-8).map(({ role, text }) => ({ role, text })),
        }),
      });

      const data = (await response.json().catch(() => null)) as { reply?: string; error?: string } | null;

      if (response.status === 404) {
        throw new Error('AI Tutor API was not found. Locally, run the app with Vercel dev to use the tutor.');
      }

      if (!response.ok) {
        throw new Error(data?.error || 'AI Tutor could not answer right now.');
      }

      const assistantMessage = makeTutorMessage(
        'assistant',
        data?.reply?.trim() || 'I could not form a helpful answer. Try asking in a simpler way.',
      );
      setTutorMessagesByQuestionId((previous) => ({
        ...previous,
        [questionId]: [...(previous[questionId] ?? nextMessages), assistantMessage],
      }));
      setTutorStatus('idle');
    } catch (error) {
      setTutorError(error instanceof Error ? error.message : 'AI Tutor could not answer right now.');
      setTutorStatus('error');
    }
  }

  return {
    activeTutorContext,
    activeTutorMessages,
    tutorInput,
    tutorStatus,
    tutorError,
    openTutor,
    closeTutor,
    resetTutor,
    setTutorInput,
    sendTutorMessage,
  };
}
