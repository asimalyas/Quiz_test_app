export const STORAGE_KEY = 'entry-test-quiz-session';
export const LEGACY_STORAGE_KEY = 'hat-quick-quiz-session';
export const DEFAULT_PER_QUESTION_SECONDS = 60;
export const DEFAULT_FULL_TEST_SECONDS = 30 * 60;
export const MAX_PDF_BYTES = 8 * 1024 * 1024;
export const MAX_PDF_PAGES = 10;
export const MAX_IMAGE_FILES = 10;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_LONG_EDGE = 1600;
export const MIN_TEXT_EXTRACTION_CHARS = 120;
export const MIN_LECTURE_QUESTION_COUNT = 5;
export const MAX_LECTURE_QUESTION_COUNT = 50;
export const MAX_AUTO_FORMAT_CHARS = 60_000;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PER_QUESTION_OPTIONS = [30, 45, 60, 90, 120];
export const FULL_TEST_OPTIONS = [5, 10, 15, 30, 45, 60].map((minutes) => minutes * 60);
export const NO_EXPLANATION_TEXT = 'No explanation was added for this question.';
export const TUTOR_QUICK_ACTIONS = [
  'Give me a hint',
  'Explain step by step',
  'Why is my answer wrong?',
  'Verify my reasoning',
  'Give a similar example',
];

export const CHATGPT_PROMPT = `Generate entry-test MCQs for the topic and number of questions that I provide.

Use exactly this format:

Q: Write the question here
A: First option
B: Second option
C: Third option
D: Fourth option
ANSWER: A
REASON: Add a short explanation only when useful

Rules:
- Provide exactly four options.
- Include only one correct answer.
- REASON is optional. Add it only for questions that need explanation.
- Leave one blank line between questions.
- Do not add headings, numbering, or extra text.
- Output only the MCQs so I can paste them directly into my quiz app.`;

export const sampleQuestions = `Q: The sum of exterior angles of any polygon is:
A: 180
B: 270
C: 360
D: 540
ANSWER: C
REASON: The exterior angles of every polygon add up to one complete turn, which is 360 degrees.

q: Which test is commonly used for graduate admissions in Pakistan?
a: HAT
b: SAT Subject Test
c: GAT
d: IELTS
answer: C
explanation: GAT is commonly used for graduate admissions and scholarship screening.
It may appear in different versions depending on the program.

Q: What is 25 percent of 240?
A: 40
B: 60
C: 80
D: 100
ANSWER: B
REASON: 25 percent means one-fourth. One-fourth of 240 is 60.

Q: The synonym of "rapid" is:
A: Slow
B: Quick
C: Late
D: Weak
ANSWER: B`;
