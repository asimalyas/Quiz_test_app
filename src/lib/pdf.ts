import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_FILES,
  MAX_IMAGE_LONG_EDGE,
  MAX_PDF_PAGES,
  MIN_TEXT_EXTRACTION_CHARS,
} from './constants';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function getPdfTextItemText(item: unknown) {
  if (typeof item === 'object' && item !== null && 'str' in item) {
    return String((item as { str?: unknown }).str ?? '');
  }

  return '';
}

async function renderPdfPageToImage(page: pdfjsLib.PDFPageProxy) {
  const viewport = page.getViewport({ scale: 1.45 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Your browser could not prepare the PDF page for AI extraction.');
  }

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.72);
}

export async function extractPdfForAi(file: File) {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;

  if (pdf.numPages > MAX_PDF_PAGES) {
    throw new Error(`This PDF has ${pdf.numPages} pages. Please upload ${MAX_PDF_PAGES} pages or fewer for this version.`);
  }

  const textParts: string[] = [];
  const pages: pdfjsLib.PDFPageProxy[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    pages.push(page);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(getPdfTextItemText).filter(Boolean).join(' ');
    if (pageText.trim()) {
      textParts.push(`Page ${pageNumber}\n${pageText.trim()}`);
    }
  }

  const extractedText = textParts.join('\n\n').trim();

  if (extractedText.length >= MIN_TEXT_EXTRACTION_CHARS) {
    return { sourceType: 'text' as const, text: extractedText, pageCount: pdf.numPages };
  }

  const images: string[] = [];
  for (const page of pages) {
    images.push(await renderPdfPageToImage(page));
  }

  return { sourceType: 'images' as const, images, pageCount: pdf.numPages };
}

export function isSupportedImage(file: File) {
  return ACCEPTED_IMAGE_TYPES.includes(file.type);
}

async function imageFileToDataUrl(file: File) {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = 'async';
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Could not read ${file.name}. Please try a clearer JPG, PNG, or WebP image.`));
    });
    image.src = sourceUrl;
    await loaded;

    const scale = Math.min(1, MAX_IMAGE_LONG_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Your browser could not prepare this image for AI extraction.');
    }

    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.78);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export async function extractImagesForAi(files: File[]) {
  if (files.length > MAX_IMAGE_FILES) {
    throw new Error(`Please upload ${MAX_IMAGE_FILES} images or fewer.`);
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_IMAGE_BYTES) {
    throw new Error(`These images are too large. Please upload images under ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB total.`);
  }

  const unsupportedFile = files.find((file) => !isSupportedImage(file));
  if (unsupportedFile) {
    throw new Error(`${unsupportedFile.name} is not supported. Please upload JPG, PNG, or WebP images.`);
  }

  const images = await Promise.all(files.map(imageFileToDataUrl));
  return { sourceType: 'images' as const, images, pageCount: files.length };
}
