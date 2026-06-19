import type { OptionKey, ParseResult } from '../types';

export function makeQuestionId(index: number, prompt: string) {
  return `${index + 1}-${prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 36)}`;
}

export function parseQuestions(input: string): ParseResult {
  const errors: string[] = [];
  const questions: ParseResult['questions'] = [];
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  let current:
    | {
        startLine: number;
        prompt?: string;
        options: Partial<Record<OptionKey, string>>;
        answer?: string;
        explanationLines: string[];
      }
    | null = null;
  let collectingExplanation = false;

  const finishCurrent = () => {
    if (!current) {
      return;
    }

    const questionNumber = questions.length + 1;
    const context = `Question starting on line ${current.startLine}`;
    const answer = current.answer?.trim().toUpperCase();
    const optionKeys: OptionKey[] = ['A', 'B', 'C', 'D'];
    const explanation = current.explanationLines.join('\n').trim();

    if (!current.prompt) {
      errors.push(`${context}: missing Q text.`);
    }

    optionKeys.forEach((key) => {
      if (!current?.options[key]) {
        errors.push(`${context}: missing option ${key}.`);
      }
    });

    if (!answer) {
      errors.push(`${context}: missing ANSWER.`);
    } else if (!optionKeys.includes(answer as OptionKey)) {
      errors.push(`${context}: ANSWER must be A, B, C, or D.`);
    }

    if (
      current.prompt &&
      optionKeys.every((key) => current?.options[key]) &&
      answer &&
      optionKeys.includes(answer as OptionKey)
    ) {
      questions.push({
        id: makeQuestionId(questionNumber - 1, current.prompt),
        prompt: current.prompt,
        options: {
          A: current.options.A!.trim(),
          B: current.options.B!.trim(),
          C: current.options.C!.trim(),
          D: current.options.D!.trim(),
        },
        answer: answer as OptionKey,
        explanation: explanation || undefined,
      });
    }
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lineNumber = index + 1;

    if (!line) {
      return;
    }

    const match = line.match(/^(q|a|b|c|d|answer|reason|explanation)\s*:\s*(.*)$/i);
    if (!match) {
      if (current && collectingExplanation) {
        current.explanationLines.push(line);
        return;
      }

      errors.push(
        `Line ${lineNumber}: expected a label like Q:, A:, B:, C:, D:, ANSWER:, REASON:, or EXPLANATION:.`,
      );
      return;
    }

    const label = match[1].toUpperCase();
    const value = match[2].trim();

    if (!value) {
      errors.push(`Line ${lineNumber}: ${label}: cannot be empty.`);
    }

    if (label === 'Q') {
      finishCurrent();
      current = { startLine: lineNumber, prompt: value, options: {}, explanationLines: [] };
      collectingExplanation = false;
      return;
    }

    if (!current) {
      errors.push(`Line ${lineNumber}: found ${label}: before a Q: line.`);
      collectingExplanation = false;
      return;
    }

    if (label === 'ANSWER') {
      if (current.answer) {
        errors.push(`Line ${lineNumber}: duplicate ANSWER label.`);
      }
      current.answer = value;
      collectingExplanation = false;
      return;
    }

    if (label === 'REASON' || label === 'EXPLANATION') {
      current.explanationLines.push(value);
      collectingExplanation = true;
      return;
    }

    const optionLabel = label as OptionKey;
    if (current.options[optionLabel]) {
      errors.push(`Line ${lineNumber}: duplicate option ${optionLabel}.`);
    }
    current.options[optionLabel] = value;
    collectingExplanation = false;
  });

  finishCurrent();

  if (!input.trim()) {
    errors.push('Paste at least one question before starting the test.');
  } else if (questions.length === 0 && errors.length === 0) {
    errors.push('No complete questions were found.');
  }

  return { questions, errors };
}
