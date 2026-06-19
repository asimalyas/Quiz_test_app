import type { TutorMessage, TutorRole } from '../types';

export function makeTutorMessage(role: TutorRole, text: string): TutorMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
  };
}

export function renderTutorText(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .split('\n')
    .map((line, lineIndex) => {
      const headingMatch = line.match(/^(\s*(?:\d+\.\s*)?[^:]{2,72}:)(\s.*)?$/);

      if (headingMatch) {
        return (
          <span className="tutor-text-line" key={`${line}-${lineIndex}`}>
            <strong className="tutor-line-heading">{headingMatch[1]}</strong>
            {headingMatch[2] ?? ''}
          </span>
        );
      }

      return (
        <span className="tutor-text-line" key={`${line}-${lineIndex}`}>
          {line}
        </span>
      );
    });
}
