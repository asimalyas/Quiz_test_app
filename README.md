# Entry Test Quiz

A clean, responsive quiz web app for practising university entry-test MCQs under time pressure.

**Live Demo:** [https://quiz-test-app-five.vercel.app/](https://quiz-test-app-five.vercel.app/)

---

## Overview

Entry Test Quiz helps students practise MCQs for exams such as HAT, NTS, GAT, FAST, NUST, COMSATS, and other university admission tests. The app runs fully in the browser with no login, backend, or database.

You paste MCQs in a simple format, choose the time per question, attempt the quiz, and review your score with detailed answer feedback.

---

## Features

- Paste MCQs directly into the app
- Parser validation with clear error messages
- Optional `REASON:` or `EXPLANATION:` support
- ChatGPT prompt helper for generating MCQs in the correct format
- Select time per question: `30`, `45`, `60`, `90`, or `120` seconds
- One-question-at-a-time quiz experience
- Auto-next when time ends
- Strong final-10-seconds warning
- Save selected answers immediately
- Refresh recovery using `localStorage`
- Finish test confirmation
- Results summary with score percentage
- Review tabs:
  - All Questions
  - Correct
  - Incorrect
  - Not Attempted
- Retry incorrect and unanswered questions
- Fully responsive desktop and mobile design
- Modern UI with smooth hover, focus, and selected states

---

## MCQ Format

Paste questions in this format:

```text
Q: What is 25 percent of 240?
A: 40
B: 60
C: 80
D: 100
ANSWER: B
REASON: 25 percent means one-fourth. One-fourth of 240 is 60.
```

Multiple questions should be separated by a blank line.

`REASON:` or `EXPLANATION:` is optional. Questions without explanations still work correctly.

---

## How It Works

1. Paste MCQs into the textarea.
2. Optionally use the built-in ChatGPT prompt card to generate correctly formatted questions.
3. Choose the time per question.
4. Start the test.
5. Select answers before time runs out.
6. Review results after submitting.
7. Retry only incorrect or unanswered questions if needed.

---

## Tech Stack

- React
- TypeScript
- Vite
- CSS
- localStorage

---

## Local Setup

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

---

## Project Structure

```text
.
├── index.html
├── package.json
├── package-lock.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── src/
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   └── main.tsx
└── README.md
```

---

## Deployment

The app is deployed on Vercel:

[https://quiz-test-app-five.vercel.app/](https://quiz-test-app-five.vercel.app/)

Because it is a static frontend app, it can also be deployed to platforms like Netlify, GitHub Pages, or any static hosting service.

---

## Notes

- No backend is required.
- No database is used.
- Quiz recovery is handled locally through the browser.
- Clearing browser storage will remove saved quiz progress.

---

## Author

Built as a focused entry-test practice tool for students who want quick MCQ practice, timed sessions, and clear performance review.
