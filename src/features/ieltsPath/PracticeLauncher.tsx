/**
 * PracticeLauncher
 * Opens the exercise of a practice step as a test session. Making a new listening or reading exercise can take a
 * while (it is written and then checked), so the page says so; writing and speaking open at once.
 */
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Banner, Button, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { examPath } from '@/features/exams/examRoutes';
import { errorMessage } from '@/shared/http';
import { ieltsPathApi } from '@/shared/ieltsPathApi';
import './ieltsPath.css';

export const PracticeLauncher: React.FC = () => {
  const { stepId = '' } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const p = t.ieltsPath.study;
  const [error, setError] = useState<unknown>(null);
  const started = useRef(false);

  const open = useCallback(() => {
    ieltsPathApi
      .startPractice(stepId)
      .then(({ sessionId }) => navigate(examPath(sessionId), { replace: true }))
      .catch(setError);
  }, [stepId, navigate]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    open();
  }, [open]);

  if (error)
    return (
      <div className="ipath__launch">
        <Banner tone="warning">{errorMessage(error, t) || p.practiceError}</Banner>
        <div className="create__actions">
          <Button variant="ghost" onClick={() => navigate(ROUTES.HOME)}>
            {p.backToToday}
          </Button>
          <Button
            onClick={() => {
              setError(null);
              open();
            }}
          >
            {p.retry}
          </Button>
        </div>
      </div>
    );
  return (
    <div className="ipath__launch" role="status">
      <Spinner size={32} label={p.preparing} />
      <strong>{p.preparing}</strong>
      <span className="create__muted">{p.preparingHint}</span>
    </div>
  );
};
