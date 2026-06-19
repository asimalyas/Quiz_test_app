import type { Screen } from '../types';

type AppHeaderProps = {
  screen: Screen;
  hasSession: boolean;
  onNewTest: () => void;
  onOpenAbout: () => void;
};

export function AppHeader({ screen, hasSession, onNewTest, onOpenAbout }: AppHeaderProps) {
  return (
    <header className={screen === 'quiz' ? 'quiz-topbar' : 'topbar'}>
      {screen === 'quiz' ? (
        <div>
          <strong>Quiz in Progress</strong>
          <p>Stay focused and complete your attempt.</p>
        </div>
      ) : (
        <div>
          <p className="eyebrow">Entry test practice</p>
          <h1>Entry Test Quiz</h1>
          <p className="app-subtitle">Paste your MCQs, practise under time pressure, and review your performance.</p>
        </div>
      )}
      <div className="topbar-actions">
        <button className="secondary-button about-trigger" type="button" onClick={onOpenAbout}>
          About Me
        </button>
        {hasSession && (
          <button className="ghost-button" type="button" onClick={onNewTest}>
            New Test
          </button>
        )}
      </div>
    </header>
  );
}
