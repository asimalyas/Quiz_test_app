import type { Screen } from '../types';

type ThemeMode = 'light' | 'dark';

type AppHeaderProps = {
  screen: Screen;
  hasSession: boolean;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  onNewTest: () => void;
  onOpenAbout: () => void;
};

export function AppHeader({ screen, hasSession, themeMode, onToggleTheme, onNewTest, onOpenAbout }: AppHeaderProps) {
  return (
    <header className={screen === 'quiz' ? 'quiz-topbar' : 'topbar'}>
      {screen === 'quiz' ? (
        <div>
          <strong>Live Quiz Session</strong>
          <p>Stay focused, track your pace, and complete the attempt.</p>
        </div>
      ) : (
        <div>
          <p className="eyebrow">Exam practice studio</p>
          <h1>Quiz Studio</h1>
          <p className="app-subtitle">Import MCQs, tune the timer, launch a clean practice test, and review every result.</p>
        </div>
      )}
      <div className="topbar-actions">
        <button
          className="theme-toggle"
          type="button"
          onClick={onToggleTheme}
          aria-label={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} theme`}
          aria-pressed={themeMode === 'dark'}
        >
          <span className="theme-toggle-track" aria-hidden="true">
            <span className="theme-toggle-knob" />
          </span>
          <span>{themeMode === 'dark' ? 'Dark' : 'Light'}</span>
        </button>
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
