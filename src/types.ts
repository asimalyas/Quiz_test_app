export type OptionKey = 'A' | 'B' | 'C' | 'D';
export type Screen = 'paste' | 'quiz' | 'results';
export type ReviewStatus = 'correct' | 'incorrect' | 'not-attempted';
export type ResultFilter = 'all' | ReviewStatus;
export type TimerMode = 'per-question' | 'full-test';
export type AiImportTask = 'extract-paper' | 'generate-from-lecture';
export type QuestionSource = 'manual' | 'paper-ai' | 'lecture-ai' | 'chatgpt';
export type PdfExtractionStatus = 'idle' | 'extracting' | 'formatting' | 'ready' | 'error';
export type AutoFormatStatus = 'idle' | 'formatting' | 'ready' | 'error';
export type TutorRole = 'user' | 'assistant';
export type TutorStatus = 'idle' | 'thinking' | 'error';

export type Question = {
  id: string;
  prompt: string;
  options: Record<OptionKey, string>;
  answer: OptionKey;
  explanation?: string;
};

export type ParseResult = {
  questions: Question[];
  errors: string[];
};

export type QuizSession = {
  screen: Screen;
  questions: Question[];
  answers: Record<string, OptionKey>;
  timeSpent: Record<string, number>;
  timerMode: TimerMode;
  perQuestionSeconds?: number;
  fullTestSeconds?: number;
  remainingFullTestSeconds?: number;
  currentIndex: number;
  questionStartedAt: number;
  skippedQuestionIds: string[];
  activeSkippedQuestionId?: string;
  fullTestEndsAt?: number;
  completedAt?: number;
};

export type PdfExtractionState = {
  status: PdfExtractionStatus;
  message: string;
  fileName?: string;
};

export type TutorMessage = {
  id: string;
  role: TutorRole;
  text: string;
};

export type TutorQuestionContext = {
  question: Question;
  index: number;
  status: ReviewStatus;
  selected?: OptionKey;
};

export type AutoFormatState = {
  status: AutoFormatStatus;
  message: string;
  sourceText?: string;
  formattedText?: string;
};

export type ResultGroups = Record<
  ResultFilter,
  Array<{
    question: Question;
    index: number;
    status: ReviewStatus;
  }>
>;
