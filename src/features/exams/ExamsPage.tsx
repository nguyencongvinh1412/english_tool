/**
 * ExamsPage
 * TOEIC test library: resume banner, mini/full tests, single parts, and past results
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Badge, Banner, Button, Card, ErrorState, Icon, Skeleton } from '@/design';
import { ROUTES } from '@/app/routes';
import { billingApi } from '@/shared/billingApi';
import { useAuth, useCurrentUser } from '@/app/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { examApi, type Catalog, type ExamMode, type SessionSummary, type ToeicPart } from '@/shared/examApi';
import { examPath } from './examRoutes';
import { IeltsLibrary } from './IeltsLibrary';
import { JlptLibrary } from './JlptLibrary';
import './ielts.css';
import './exams.css';

const EnglishExamsPage: React.FC = () => {
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const exam: 'toeic' | 'ielts' = (params.get('exam') ?? user?.targetExam) === 'ielts' ? 'ielts' : 'toeic';
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [fullLocked, setFullLocked] = useState(false);
  const [showParts, setShowParts] = useState(false);

  useEffect(() => {
    // Full tests and single parts need a paid plan once limits are enforced
    billingApi
      .plans()
      .then((info) => setFullLocked(info.current.enforced && !info.plans.find((p) => p.id === info.current.planId)?.limits.fullTests))
      .catch(() => {});
    examApi.catalog().then(setCatalog).catch(setError);
    examApi
      .list()
      .then(({ sessions: list }) => setSessions(list))
      .catch(setError);
  }, []);

  const start = async (mode: ExamMode, options: { part?: ToeicPart; importId?: string } = {}): Promise<void> => {
    setStarting(options.importId ?? (options.part ? `part-${options.part}` : mode));
    setError(null);
    try {
      const { session } = await examApi.start(mode, options);
      navigate(examPath(session.id));
    } catch (err) {
      setError(err);
      setStarting(null);
    }
  };

  // The list endpoint already submits overdue tests, so any in-progress one can be resumed
  const inProgress = sessions?.find((s) => s.status === 'in_progress');
  const finished = sessions?.filter((s) => s.status === 'submitted' && s.exam === exam) ?? [];

  const sessionLabel = (s: SessionSummary) => {
    if (s.exam === 'jlpt') return `JLPT ${s.level ?? ''}`;
    if (s.exam === 'ielts') {
      const part = s.mode === 'part' && s.components[0] ? ` · ${t.ielts.components[s.components[0] as keyof typeof t.ielts.components]}` : '';
      return `IELTS ${t.ielts.modeLabel[s.mode]}${part}`;
    }
    return s.title ?? `${t.exams.modeLabel[s.mode]} ${s.mode === 'part' && s.parts.length === 1 ? t.exams.partName(s.parts[0]) : ''}`;
  };
  const examTabs: { value: 'toeic' | 'ielts'; label: string }[] = [
    { value: 'toeic', label: 'TOEIC' },
    { value: 'ielts', label: 'IELTS' },
  ];
  const header = (
    <>
      <h1 className="tests__title">{t.nav.tests}</h1>
      <div className="tests__tabs" role="group" aria-label={t.ielts.examSwitch}>
        {examTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={exam === tab.value}
            className={`tests__tab ${exam === tab.value ? 'tests__tab--on' : ''}`}
            // Always explicit: without the param the page falls back to the profile's target exam
            onClick={() => setParams({ exam: tab.value }, { replace: true })}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </>
  );

  if (!catalog && exam === 'toeic') {
    return (
      <div className="tests">
        {header}
        {error !== null ? (
          <ErrorState
            title={t.today.errorTitle}
            action={
              <Button variant="secondary" onClick={() => window.location.reload()}>
                {t.today.retry}
              </Button>
            }
          >
            {errorMessage(error, t)}
          </ErrorState>
        ) : (
          <div className="tests__skeleton">
            <Skeleton height={90} label={t.common.loading} />
            <Skeleton height={140} />
          </div>
        )}
      </div>
    );
  }

  const lockPlus = (
    <Link to={ROUTES.ME_PLAN} className="tests__lock">
      <Icon name="lock" size={16} />
      {t.tests.plus}
    </Link>
  );

  return (
    <div className="tests">
      {header}

      {error !== null && <Banner tone="warning">{errorMessage(error, t)}</Banner>}

      <div className="tests__grid">
        <div className="tests__main">
          {inProgress && (
            <Card className="tests__resume">
              <div>
                <span className="tests__label">{t.tests.resumeLabel}</span>
                <strong className="tests__resume-title">{sessionLabel(inProgress)}</strong>
              </div>
              <Button size="lg" onClick={() => navigate(examPath(inProgress.id))}>
                {t.exams.resumeButton}
              </Button>
            </Card>
          )}

          {exam === 'ielts' ? (
            <IeltsLibrary />
          ) : (
            catalog && (
              <>
                <Card padding="sm">
                  <ul className="tests__rows">
                    <li className="tests__row">
                      <span className="tests__row-text">
                        <strong>{t.exams.mini}</strong>
                        <span>{t.exams.miniBody(catalog.modes.mini.minutes)}</span>
                      </span>
                      <Button size="sm" onClick={() => start('mini')} loading={starting === 'mini'} disabled={starting !== null}>
                        {starting === 'mini' ? t.exams.starting : t.exams.start}
                      </Button>
                    </li>
                    <li className="tests__row">
                      <span className="tests__row-text">
                        <strong>{t.exams.full}</strong>
                        <span>{t.exams.fullBody(catalog.modes.full.questions, catalog.modes.full.minutes)}</span>
                      </span>
                      {fullLocked ? (
                        lockPlus
                      ) : (
                        <Button size="sm" onClick={() => start('full')} loading={starting === 'full'} disabled={starting !== null}>
                          {starting === 'full' ? t.exams.starting : t.exams.start}
                        </Button>
                      )}
                    </li>
                    <li className="tests__row">
                      <span className="tests__row-text">
                        <strong>{t.exams.byPart}</strong>
                        <span>{t.tests.partHint}</span>
                      </span>
                      {fullLocked ? (
                        lockPlus
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => setShowParts((v) => !v)} aria-expanded={showParts}>
                          {showParts ? t.common.close : t.tests.choosePart}
                        </Button>
                      )}
                    </li>
                  </ul>
                </Card>

                {showParts && !fullLocked && (
                  <div className="exam-parts">
                    {catalog.parts.map((part) => (
                      <Card key={part.part} padding="md" className="exam-part">
                        <div className="exam-part__head">
                          <Badge tone={part.section === 'listening' ? 'listening' : 'reading'}>
                            {part.section === 'listening' ? t.exams.listening : t.exams.reading}
                          </Badge>
                          <span className="exam-part__name">{t.exams.partName(part.part)}</span>
                        </div>
                        <p className="exam-part__title">{t.exams.partTitles[part.part]}</p>
                        <p className="exam-part__meta">{t.exams.partMeta(part.questions, part.minutes)}</p>
                        <Button size="sm" variant="secondary" onClick={() => start('part', { part: part.part })} loading={starting === `part-${part.part}`} disabled={starting !== null}>
                          {t.exams.start}
                        </Button>
                      </Card>
                    ))}
                  </div>
                )}

                {catalog.officialTests.length > 0 && (
                  <section>
                    <h2 className="tests__section">{t.exams.officialTitle}</h2>
                    <p className="exams__section-intro">{t.exams.officialIntro}</p>
                    <div className="exam-parts">
                      {catalog.officialTests.map((test) => (
                        <Card key={test.id} padding="md" className="exam-part exam-part--official">
                          <div className="exam-part__head">
                            <Badge tone="exam">{t.exams.modeLabel.official}</Badge>
                          </div>
                          <p className="exam-part__title">{test.title}</p>
                          <p className="exam-part__meta">
                            {t.exams.officialMeta(test.questions, test.minutes)} · {test.parts.map((p) => `P${p}`).join(' ')}
                          </p>
                          <Button size="sm" onClick={() => start('official', { importId: test.id })} loading={starting === test.id} disabled={starting !== null}>
                            {t.exams.start}
                          </Button>
                        </Card>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )
          )}
        </div>

        <aside className="tests__side">
          <Card padding="md">
            <h2 className="tests__section">{t.exams.history}</h2>
            {sessions === null ? (
              <Skeleton height={60} label={t.common.loading} />
            ) : finished.length === 0 ? (
              <p className="exams__empty">{t.exams.noHistory}</p>
            ) : (
              <ul className="exam-history">
                {finished.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="exam-history__row" onClick={() => navigate(examPath(s.id))}>
                      <span className="exam-history__what">
                        <strong>{sessionLabel(s)}</strong>
                        <span>{formatDate(s.submittedAt ?? s.startedAt)}</span>
                      </span>
                      {s.result && 'totalScaled' in s.result
                        ? s.result.totalScaled !== null && <span className="exam-history__total">{s.result.totalScaled}</span>
                        : s.result && 'overall' in s.result && typeof s.result.overall === 'number' && <span className="exam-history__total">{s.result.overall.toFixed(1)}</span>}
                      <Icon name="chevronRight" size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
};

/**
 * Mock tests for the language being learned
 */
export const ExamsPage: React.FC = () => {
  const { studyLanguage } = useCurrentUser();
  return studyLanguage === 'ja' ? <JlptLibrary /> : <EnglishExamsPage />;
};
