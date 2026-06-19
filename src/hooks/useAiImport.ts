import { useState, type RefObject } from 'react';
import {
  MAX_LECTURE_QUESTION_COUNT,
  MAX_PDF_BYTES,
  MIN_LECTURE_QUESTION_COUNT,
} from '../lib/constants';
import { getAiImportFileLabel, getAiImportIdleMessage } from '../lib/labels';
import { parseQuestions } from '../lib/parser';
import { extractImagesForAi, extractPdfForAi, isSupportedImage } from '../lib/pdf';
import type { AiImportTask, PdfExtractionState } from '../types';

type UseAiImportOptions = {
  aiImportTask: AiImportTask;
  lectureQuestionCount: number;
  pdfInputRef: RefObject<HTMLInputElement>;
  setPasteText: (value: string) => void;
  setParseErrors: (errors: string[]) => void;
};

export function useAiImport({
  aiImportTask,
  lectureQuestionCount,
  pdfInputRef,
  setPasteText,
  setParseErrors,
}: UseAiImportOptions) {
  const [pdfExtraction, setPdfExtraction] = useState<PdfExtractionState>({
    status: 'idle',
    message: getAiImportIdleMessage('extract-paper'),
  });

  async function handlePaperUpload(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) {
      return;
    }

    const pdfFiles = files.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    const imageFiles = files.filter((file) => isSupportedImage(file));
    const fileName = getAiImportFileLabel(files);
    const isLectureMode = aiImportTask === 'generate-from-lecture';
    const safeLectureQuestionCount = Math.min(
      MAX_LECTURE_QUESTION_COUNT,
      Math.max(MIN_LECTURE_QUESTION_COUNT, Math.round(lectureQuestionCount) || 10),
    );

    if (pdfFiles.length > 0 && files.length > 1) {
      setPdfExtraction({
        status: 'error',
        fileName,
        message: 'Please upload either one PDF or image files, not both together.',
      });
      return;
    }

    if (pdfFiles.length === 0 && imageFiles.length !== files.length) {
      setPdfExtraction({
        status: 'error',
        fileName,
        message: 'Please upload a PDF, JPG, PNG, or WebP image file.',
      });
      return;
    }

    try {
      setParseErrors([]);
      let extracted: Awaited<ReturnType<typeof extractPdfForAi>> | Awaited<ReturnType<typeof extractImagesForAi>>;

      if (pdfFiles.length === 1) {
        const [file] = pdfFiles;
        if (file.size > MAX_PDF_BYTES) {
          throw new Error(`This PDF is too large. Please upload a file under ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB.`);
        }

        setPdfExtraction({
          status: 'extracting',
          fileName,
          message: isLectureMode
            ? 'Reading the lecture PDF and checking whether it contains selectable text...'
            : 'Reading the PDF and checking whether it contains selectable text...',
        });
        extracted = await extractPdfForAi(file);
      } else {
        setPdfExtraction({
          status: 'extracting',
          fileName,
          message: isLectureMode
            ? 'Preparing your lecture slide images for AI generation...'
            : 'Preparing your paper image for AI extraction...',
        });
        extracted = await extractImagesForAi(imageFiles);
      }

      setPdfExtraction({
        status: 'formatting',
        fileName,
        message: isLectureMode
          ? `Generating ${safeLectureQuestionCount} MCQs from your lecture slides...`
          : extracted.sourceType === 'text'
            ? 'PDF text found. AI is formatting it into quiz-ready MCQs...'
            : 'AI is reading the paper image and formatting quiz-ready MCQs...',
      });

      const response = await fetch('/api/extract-mcqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: aiImportTask,
          questionCount: isLectureMode ? safeLectureQuestionCount : undefined,
          fileName,
          pageCount: extracted.pageCount,
          sourceType: extracted.sourceType,
          text: extracted.sourceType === 'text' ? extracted.text : undefined,
          images: extracted.sourceType === 'images' ? extracted.images : undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as { mcqText?: string; error?: string } | null;

      if (response.status === 404) {
        throw new Error('AI extraction API was not found. Locally, run the app with Vercel dev to test AI extraction.');
      }

      if (!response.ok) {
        throw new Error(data?.error || 'AI extraction failed. Please try again.');
      }

      if (!data?.mcqText?.trim()) {
        throw new Error('AI did not return any MCQs. Please try a clearer paper or paste the questions manually.');
      }

      const mcqText = data.mcqText.trim();
      const parsed = parseQuestions(mcqText);
      setPasteText(mcqText);
      setParseErrors(parsed.errors);
      setPdfExtraction({
        status: parsed.errors.length > 0 ? 'error' : 'ready',
        fileName,
        message:
          parsed.errors.length > 0
            ? 'AI extracted text, but some questions need review. Fix the errors below before starting.'
            : isLectureMode
              ? `Ready to review. Generated ${parsed.questions.length} of ${safeLectureQuestionCount} requested MCQ${
                  safeLectureQuestionCount === 1 ? '' : 's'
                } from the slides.`
              : `Ready to review. ${parsed.questions.length} question${parsed.questions.length === 1 ? '' : 's'} found.`,
      });
    } catch (error) {
      setPdfExtraction({
        status: 'error',
        fileName,
        message: error instanceof Error ? error.message : 'Could not extract MCQs from this paper file.',
      });
    } finally {
      if (pdfInputRef.current) {
        pdfInputRef.current.value = '';
      }
    }
  }

  return {
    pdfExtraction,
    setPdfExtraction,
    handlePaperUpload,
  };
}
