/**
 * ExamsPage
 * TOEIC test library: resume banner, mini/full tests, single parts, and past results
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Banner, Button, Card, EmptyState, Icon, LinkButton, PageHeader, Segmented, Spinner } from '@/design';
import { useAuth, useCurrentUser } from '@/app/AuthProvider';
import { ROUTES } from '@/app/routes';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { examApi, type Catalog, type ExamMode, type IeltsSummaryResult, type SessionSummary, type ToeicPart } from '@/shared/examApi';
import { examPath } from './examRoutes';
import { IeltsLibrary } from './IeltsLibrary';
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

  useEffect(() => {
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
    if (s.exam === 'ielts') {
      const part = s.mode === 'part' && s.components[0] ? ` · ${t.ielts.components[s.components[0] as keyof typeof t.ielts.components]}` : '';
      return `IELTS ${t.ielts.modeLabel[s.mode]}${part}`;
    }
    return s.title ?? `${t.exams.modeLabel[s.mode]} ${s.mode === 'part' && s.parts.length === 1 ? t.exams.partName(s.parts[0]) : ''}`;
  };
  const header = (
    <>
      <PageHeader
        eyebrow={exam === 'ielts' ? 'IELTS Academic' : 'TOEIC'}
        title={exam === 'ielts' ? t.ielts.title : t.exams.title}
        description={exam === 'ielts' ? t.ielts.subtitle : t.exams.subtitle}
      />
      <div className="exams__switch">
        <Segmented
          label={t.ielts.examSwitch}
          value={exam}
          onChange={(value) =>
            // Always explicit: without the param the page falls back to the profile's target exam
            setParams({ exam: value }, { replace: true })
          }
          options={[
            { value: 'toeic', label: 'TOEIC', tone: 'exam' },
            { value: 'ielts', label: 'IELTS', tone: 'listening' },
          ]}
        />
      </div>
    </>
  );

  if (!catalog && exam === 'toeic') {
    return (
      <div className="exams">
        {header}
        {error !== null ? <Banner tone="danger">{errorMessage(error, t)}</Banner> : <Spinner size={32} label={t.common.loading} />}
      </div>
    );
  }

  return (
    <div className="exams">
      {header}

      {inProgress && (
        <Banner
          tone="info"
          action={
            <Button size="sm" variant="exam" icon="chevronRight" onClick={() => navigate(examPath(inProgress.id))}>
              {t.exams.resumeButton}
            </Button>
          }
        >
          {t.exams.resume}: {sessionLabel(inProgress)}
        </Banner>
      )}

      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}

      {exam === 'ielts' ? (
        <IeltsLibrary />
      ) : (
        catalog && (
          <>
            <div className="exam-modes">
              <Card padding="lg" className="exam-mode reveal">
                <span className="exam-mode__icon">
                  <Icon name="bolt" size={26} />
                </span>
                <h2 className="exam-mode__title">{t.exams.mini}</h2>
                <p className="exam-mode__body">{t.exams.miniBody(catalog.modes.mini.minutes)}</p>
                <Button variant="exam" onClick={() => start('mini')} loading={starting === 'mini'} disabled={starting !== null}>
                  {starting === 'mini' ? t.exams.starting : t.exams.start}
                </Button>
              </Card>
              <Card padding="lg" className="exam-mode exam-mode--full reveal" style={{ ['--i' as string]: 1 }}>
                <span className="exam-mode__icon">
                  <Icon name="exam" size={26} />
                </span>
                <h2 className="exam-mode__title">{t.exams.full}</h2>
                <p className="exam-mode__body">{t.exams.fullBody(catalog.modes.full.questions, catalog.modes.full.minutes)}</p>
                <Button variant="exam" onClick={() => start('full')} loading={starting === 'full'} disabled={starting !== null}>
                  {starting === 'full' ? t.exams.starting : t.exams.start}
                </Button>
              </Card>
            </div>

            {catalog.officialTests.length > 0 && (
              <section>
                <h2 className="exams__section-title">{t.exams.officialTitle}</h2>
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
                      <Button
                        size="sm"
                        variant="exam"
                        onClick={() => start('official', { importId: test.id })}
                        loading={starting === test.id}
                        disabled={starting !== null}
                      >
                        {t.exams.start}
                      </Button>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="exams__section-title">{t.exams.byPart}</h2>
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
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => start('part', { part: part.part })}
                      loading={starting === `part-${part.part}`}
                      disabled={starting !== null}
                    >
                      {t.exams.start}
                    </Button>
                  </Card>
                ))}
              </div>
            </section>
          </>
        )
      )}

      <section>
        <h2 className="exams__section-title">{t.exams.history}</h2>
        {sessions === null ? (
          <Spinner size={24} label={t.common.loading} />
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
                  {s.result && 'sections' in s.result ? (
                    <>
                      {s.result.sections.listening && (
                        <span className="exam-history__score">
                          {t.exams.listening} <strong>{s.result.sections.listening.scaled}</strong>
                        </span>
                      )}
                      {s.result.sections.reading && (
                        <span className="exam-history__score">
                          {t.exams.reading} <strong>{s.result.sections.reading.scaled}</strong>
                        </span>
                      )}
                      {s.result.totalScaled !== null && <span className="exam-history__total">{s.result.totalScaled}</span>}
                    </>
                  ) : (
                    s.result && (
                      <>
                        {(['listening', 'reading', 'writing', 'speaking'] as const).map((c) => {
                          const band = (s.result as IeltsSummaryResult)[c]?.band;
                          return typeof band === 'number' ? (
                            <span key={c} className="exam-history__score">
                              {t.ielts.components[c]} <strong>{band.toFixed(1)}</strong>
                            </span>
                          ) : null;
                        })}
                        {'overall' in s.result && s.result.overall !== null && <span className="exam-history__total">{s.result.overall.toFixed(1)}</span>}
                      </>
                    )
                  )}
                  <Icon name="chevronRight" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

/**
 * Japanese: JLPT tests arrive in phase J4; point learners to the kana charts meanwhile
 */
const JlptExamsPage: React.FC = () => {
  const { t } = useI18n();
  return (
    <div className="exams">
      <PageHeader eyebrow="JLPT" title={t.japanese.examsTitle} description={t.japanese.examsSubtitle} />
      <EmptyState
        icon="exam"
        title={t.common.comingSoon}
        action={
          <LinkButton to={ROUTES.KANA} icon="chevronRight">
            {t.skills.activities.kana.title}
          </LinkButton>
        }
      >
        {t.japanese.examsSoon}
      </EmptyState>
    </div>
  );
};

/**
 * Mock tests for the language being learned
 */
export const ExamsPage: React.FC = () => {
  const { studyLanguage } = useCurrentUser();
  return studyLanguage === 'ja' ? <JlptExamsPage /> : <EnglishExamsPage />;
};
