import { useState } from 'react';
import profileImageUrl from '../assets/asim-profile.png';

type AboutModalProps = {
  open: boolean;
  onClose: () => void;
};

export function AboutModal({ open, onClose }: AboutModalProps) {
  const [profileImageFailed, setProfileImageFailed] = useState(false);

  if (!open) {
    return null;
  }

  return (
    <div className="about-overlay" role="dialog" aria-modal="true" aria-labelledby="about-title">
      <section className="about-panel">
        <button className="ghost-button about-close" type="button" onClick={onClose} aria-label="Close About Me">
          Close
        </button>

        <div className="about-hero">
          <div className="about-photo-card">
            {profileImageFailed ? (
              <div className="about-photo-fallback" aria-label="Muhammad Asim Ilyas Rathore profile initials">
                MA
              </div>
            ) : (
              <img
                src={profileImageUrl}
                alt="Muhammad Asim Ilyas Rathore"
                onError={() => setProfileImageFailed(true)}
              />
            )}
          </div>

          <div className="about-intro">
            <p className="eyebrow">Creator Profile</p>
            <h2 id="about-title">Muhammad Asim Ilyas Rathore</h2>
            <p>
              Creator of Entry Test Quiz, built to help students practise university-entry MCQs with clearer feedback,
              realistic timing, and focused review.
            </p>
            <div className="about-tags" aria-label="Profile highlights">
              <span>Entry test practice</span>
              <span>AI-assisted learning</span>
              <span>Student-focused tools</span>
            </div>
          </div>
        </div>

        <div className="about-grid">
          <article className="about-card featured">
            <span>Purpose</span>
            <h3>Make practice feel simple, serious, and useful.</h3>
            <p>
              This app is designed for students preparing for tests like HAT, NTS, GAT, FAST, NUST, COMSATS, and other
              university entry exams.
            </p>
          </article>

          <article className="about-card">
            <span>Motivation</span>
            <p>
              Many students have MCQs in PDFs, notes, screenshots, or rough text. Entry Test Quiz turns that material
              into a clean practice workflow: import, review, attempt, and learn from mistakes.
            </p>
          </article>

          <article className="about-card">
            <span>What this project offers</span>
            <ul>
              <li>Manual MCQ paste with validation.</li>
              <li>AI paper and lecture-slide import.</li>
              <li>Timed quiz modes with skip and question palette.</li>
              <li>Results review with explanations and AI Tutor help.</li>
            </ul>
          </article>

          <article className="about-card">
            <span>Design promise</span>
            <p>
              The goal is a clean, student-friendly tool: fewer distractions, visible progress, helpful recovery from
              errors, and enough structure to practise with confidence.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
