/**
 * ExamsPage
 * TOEIC test library: resume banner, mini/full tests, single parts, and past results
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Banner, Button, Card, Icon, PageHeader, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { examApi, type Catalog, type ExamMode, type SessionSummary, type ToeicPart } from '@/shared/examApi';
import { examPath } from './examRoutes';
import './exams.css';

export const ExamsPage: React.FC = () => {
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();
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
  const finished = sessions?.filter((s) => s.status === 'submitted') ?? [];

  if (!catalog) {
    return (
      <div className="exams">
        <PageHeader eyebrow="TOEIC" title={t.exams.title} description={t.exams.subtitle} />
        {error !== null ? <Banner tone="danger">{errorMessage(error, t)}</Banner> : <Spinner size={32} label={t.common.loading} />}
      </div>
    );
  }

  const sessionLabel = (s: SessionSummary) =>
    s.title ?? `${t.exams.modeLabel[s.mode]} ${s.mode === 'part' && s.parts.length === 1 ? t.exams.partName(s.parts[0]) : ''}`;

  return (
    <div className="exams">
      <PageHeader eyebrow="TOEIC" title={t.exams.title} description={t.exams.subtitle} />

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
                  {s.result?.sections.listening && (
                    <span className="exam-history__score">
                      {t.exams.listening} <strong>{s.result.sections.listening.scaled}</strong>
                    </span>
                  )}
                  {s.result?.sections.reading && (
                    <span className="exam-history__score">
                      {t.exams.reading} <strong>{s.result.sections.reading.scaled}</strong>
                    </span>
                  )}
                  {s.result?.totalScaled !== null && s.result?.totalScaled !== undefined && (
                    <span className="exam-history__total">{s.result.totalScaled}</span>
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
