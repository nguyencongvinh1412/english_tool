/**
 * PageErrorBoundary
 * Keeps a page's failure inside the page: the navigation stays, the message is in the learner's language and says
 * what to do (a page that could not load usually means no connection), with a button to try again. It resets when
 * the learner goes to another page.
 */
import { Component, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, ErrorState } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';

const Failed: React.FC<{ onRetry: () => void }> = ({ onRetry }) => {
  const { t } = useI18n();
  return (
    <ErrorState
      title={t.pageError.title}
      action={
        <Button variant="secondary" onClick={onRetry}>
          {t.pageError.retry}
        </Button>
      }
    >
      {navigator.onLine ? t.pageError.body : t.pageError.offline}
    </ErrorState>
  );
};

interface Props {
  children: ReactNode;
  /** Changes when the learner moves to another page, which clears a failure */
  resetKey: string;
}

class Boundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    console.error('A page failed:', error.message);
  }

  componentDidUpdate(previous: Props): void {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }

  render(): ReactNode {
    return this.state.failed ? <Failed onRetry={() => this.setState({ failed: false })} /> : this.props.children;
  }
}

export const PageErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  return <Boundary resetKey={pathname}>{children}</Boundary>;
};
