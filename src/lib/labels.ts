import type { AiImportTask, QuestionSource, ReviewStatus } from '../types';

export function getStatusLabel(status: ReviewStatus) {
  if (status === 'correct') {
    return 'Correct';
  }

  if (status === 'incorrect') {
    return 'Incorrect';
  }

  return 'Not Attempted';
}

export function getAiImportIdleMessage(task: AiImportTask) {
  return task === 'generate-from-lecture'
    ? 'Upload lecture slides and choose how many MCQs Gemini should generate from the slide content only.'
    : 'Upload a PDF, paper photo, or screenshot and let AI convert it into quiz-ready MCQs.';
}

export function getAiImportFileLabel(files: File[]) {
  if (files.length === 1) {
    return files[0].name;
  }

  return `${files.length} images selected`;
}

export function getQuestionSourceLabel(source: QuestionSource) {
  if (source === 'paper-ai') {
    return 'AI paper import';
  }

  if (source === 'lecture-ai') {
    return 'Lecture slides';
  }

  if (source === 'chatgpt') {
    return 'ChatGPT prompt';
  }

  return 'Manual paste';
}
