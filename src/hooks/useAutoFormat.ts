import { useState } from 'react';
import { MAX_AUTO_FORMAT_CHARS } from '../lib/constants';
import { parseQuestions } from '../lib/parser';
import type { AutoFormatState } from '../types';

type UseAutoFormatOptions = {
  pasteText: string;
  setPasteText: (value: string) => void;
  setParseErrors: (errors: string[]) => void;
};

export function useAutoFormat({ pasteText, setPasteText, setParseErrors }: UseAutoFormatOptions) {
  const [autoFormat, setAutoFormat] = useState<AutoFormatState>({
    status: 'idle',
    message: '',
  });

  function resetAutoFormat() {
    setAutoFormat({
      status: 'idle',
      message: '',
    });
  }

  function handleQuestionInputChange(value: string) {
    setPasteText(value);
    setAutoFormat((previous) => (previous.status === 'idle' ? previous : { status: 'idle', message: '' }));
  }

  async function handleAutoFormatMcqs() {
    const sourceText = pasteText.trim();

    if (!sourceText) {
      setAutoFormat({
        status: 'error',
        message: 'Paste your questions first, then use Auto Format MCQs.',
      });
      return;
    }

    if (sourceText.length > MAX_AUTO_FORMAT_CHARS) {
      setAutoFormat({
        status: 'error',
        message: `This paste is too large for one auto-format request. Please keep it under ${Math.round(
          MAX_AUTO_FORMAT_CHARS / 1000,
        )}k characters or split it into smaller parts.`,
      });
      return;
    }

    if (autoFormat.sourceText === sourceText && autoFormat.formattedText) {
      const cachedText = autoFormat.formattedText;
      const parsed = parseQuestions(cachedText);
      setPasteText(cachedText);
      setParseErrors(parsed.errors);
      setAutoFormat({
        status: parsed.errors.length === 0 ? 'ready' : 'error',
        sourceText,
        formattedText: cachedText,
        message:
          parsed.errors.length === 0
            ? 'Reused the previous formatted version. Review it, then start your test.'
            : 'Reused the previous formatted version, but a few items still need review.',
      });
      return;
    }

    setAutoFormat({
      status: 'formatting',
      message: 'Formatting your pasted MCQs...',
    });

    try {
      const response = await fetch('/api/format-mcqs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: sourceText }),
      });
      const data = (await response.json()) as { mcqText?: string; error?: string };

      if (!response.ok) {
        const setupHint =
          response.status === 404
            ? ' Run with npx vercel dev for local AI formatting, or use the deployed Vercel site.'
            : '';
        throw new Error(`${data.error || 'Auto Format could not repair this paste.'}${setupHint}`);
      }

      const formattedText = (data.mcqText || '').trim();
      if (!formattedText) {
        throw new Error('Auto Format did not return any MCQs. Please try with clearer question text.');
      }

      const parsed = parseQuestions(formattedText);
      setPasteText(formattedText);
      setParseErrors(parsed.errors);
      setAutoFormat({
        status: parsed.errors.length === 0 ? 'ready' : 'error',
        sourceText,
        formattedText,
        message:
          parsed.errors.length === 0
            ? `Auto Format repaired the paste and detected ${parsed.questions.length} question${
                parsed.questions.length === 1 ? '' : 's'
              }. Review them before starting.`
            : 'Auto Format improved the paste, but some questions still need manual review.',
      });
    } catch (error) {
      setAutoFormat({
        status: 'error',
        message: error instanceof Error ? error.message : 'Auto Format could not repair this paste.',
      });
    }
  }

  return {
    autoFormat,
    handleQuestionInputChange,
    handleAutoFormatMcqs,
    resetAutoFormat,
  };
}
