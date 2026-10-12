/**
 * JlptLibrary
 * JLPT mock tests: level picker, mini and full tests, one section at a time, and past results
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Banner, Button, Card, Icon, PageHeader, Segmented, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { JLPT_CONTENT_LEVELS, type JlptLevel } from '@/shared/contentApi';
import { examApi, type SessionSummary } from '@/shared/examApi';
import { jlptApi, type JlptCatalog, type JlptMode, type JlptSection } from '@/shared/jlptApi';
import { useJaLevel } from '@/features/japanese/useJaPractice';
import { examPath } from './examRoutes';
import './exams.css';
import './jlpt.css';

const SECTION_ICON: Record<JlptSection, 'type' | 'pen' | 'book' | 'headphones'> = {
  vocab: 'type',
  grammar: 'pen',
  reading: 'book',
  listening: 'headphones',
};

export const JlptLibrary: React.FC = () => {
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();
  const { level: goal } = useJaLevel();
  const [level, setLevel] = useState<JlptLevel>(goal);
  const [catalog, setCatalog] = useState<JlptCatalog | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    jlptApi.catalog().then(setCatalog).catch(setError);
    examApi
      .list()
      .then(({ sessions: list }) => setSessions(list))
      .catch(setError);
  }, []);

  const start = async (mode: JlptMode, options: { section?: JlptSection; importId?: string } = {}) => {
    setStarting(options.importId ?? options.section ?? mode);
    setError(null);
    try {
      const { session } = await jlptApi.start(level, mode, options);
      navigate(examPath(session.id));
    } catch (err) {
      setError(err);
      setStarting(null);
    }
  };

  const info = catalog?.levels.find((l) => l.level === level);
  const officialTests = catalog?.officialTests.filter((test) => test.level === level) ?? [];
  const inProgress = sessions?.find((s) => s.status === 'in_progress' && s.exam === 'jlpt');
  const finished = sessions?.filter((s) => s.status === 'submitted' && s.exam === 'jlpt') ?? [];
  const label = (s: SessionSummary) =>
    s.title ? `JLPT ${s.level} · ${s.title}` : `JLPT ${s.level} · ${t.jlpt.modeLabel[s.mode as JlptMode]}${s.mode === 'part' && s.jlptSections[0] ? ` · ${t.jlpt.sections[s.jlptSections[0]]}` : ''}`;

  return (
    <div className="exams jlpt-library">
      <PageHeader eyebrow="JLPT 日本語能力試験" title={t.japanese.examsTitle} description={t.japanese.examsSubtitle} />
      <Segmented<JlptLevel>
        label={t.dashboard.level}
        value={level}
        onChange={setLevel}
        options={JLPT_CONTENT_LEVELS.map((l) => ({ value: l, label: l, tone: 'exam' }))}
      />

      {inProgress && (
        <Banner
          tone="info"
          action={
            <Button size="sm" variant="exam" icon="chevronRight" onClick={() => navigate(examPath(inProgress.id))}>
              {t.exams.resumeButton}
            </Button>
          }
        >
          {t.exams.resume}: {label(inProgress)}
        </Banner>
      )}
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}

      {!info ? (
        error === null && <Spinner size={32} label={t.common.loading} />
      ) : (
        <>
          <div className="exam-modes">
            <Card padding="lg" className="exam-mode reveal">
              <span className="exam-mode__icon">
                <Icon name="bolt" size={26} />
              </span>
              <h2 className="exam-mode__title">{t.exams.mini}</h2>
              <p className="exam-mode__body">{t.jlpt.miniBody(info.mini.questions, info.mini.minutes)}</p>
              <Button variant="exam" onClick={() => start('mini')} loading={starting === 'mini'} disabled={starting !== null}>
                {starting === 'mini' ? t.exams.starting : t.exams.start}
              </Button>
            </Card>
            <Card padding="lg" className="exam-mode exam-mode--full reveal" style={{ ['--i' as string]: 1 }}>
              <span className="exam-mode__icon">
                <Icon name="exam" size={26} />
              </span>
              <h2 className="exam-mode__title">{t.jlpt.fullTitle(level)}</h2>
              <p className="exam-mode__body">{t.jlpt.fullBody(info.full.questions, info.full.minutes)}</p>
              <Button variant="exam" onClick={() => start('full')} loading={starting === 'full'} disabled={starting !== null}>
                {starting === 'full' ? t.exams.starting : t.exams.start}
              </Button>
            </Card>
          </div>

          {officialTests.length > 0 && (
            <section>
              <h2 className="exams__section-title">{t.exams.officialTitle}</h2>
              <p className="exams__section-intro">{t.jlpt.officialIntro}</p>
              <div className="exam-parts">
                {officialTests.map((test) => (
                  <Card key={test.id} padding="md" className="exam-part exam-part--official">
                    <div className="exam-part__head">
                      <Badge tone="exam">{t.exams.modeLabel.official}</Badge>
                    </div>
                    <p className="exam-part__title">{test.title}</p>
                    <p className="exam-part__meta">
                      {t.exams.officialMeta(test.questions, test.minutes)} · {test.sections.map((s) => t.jlpt.sections[s]).join(', ')}
                    </p>
                    <Button size="sm" variant="exam" onClick={() => start('official', { importId: test.id })} loading={starting === test.id} disabled={starting !== null}>
                      {t.exams.start}
                    </Button>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="exams__section-title">{t.jlpt.bySection}</h2>
            <div className="exam-parts">
              {info.sections.map((s) => (
                <Card key={s.section} padding="md" className="exam-part">
                  <div className="exam-part__head">
                    <Icon name={SECTION_ICON[s.section]} size={18} />
                    <span className="exam-part__name" lang="ja">
                      {t.jlpt.sectionsJa[s.section]}
                    </span>
                  </div>
                  <p className="exam-part__title">{t.jlpt.sections[s.section]}</p>
                  <p className="exam-part__meta">{t.exams.partMeta(s.questions, s.minutes)}</p>
                  <Button size="sm" variant="secondary" onClick={() => start('part', { section: s.section })} loading={starting === s.section} disabled={starting !== null}>
                    {t.exams.start}
                  </Button>
                </Card>
              ))}
            </div>
          </section>
          <p className="exams__section-intro">{t.jlpt.structureNote}</p>
        </>
      )}

      <section>
        <h2 className="exams__section-title">{t.exams.history}</h2>
        {sessions === null ? (
          <Spinner size={24} label={t.common.loading} />
        ) : finished.length === 0 ? (
          <p className="exams__empty">{t.exams.noHistory}</p>
        ) : (
          <ul className="exam-history">
            {finished.map((s) => {
              const result = s.result && 'passMark' in s.result ? s.result : null;
              return (
                <li key={s.id}>
                  <button type="button" className="exam-history__row" onClick={() => navigate(examPath(s.id))}>
                    <span className="exam-history__what">
                      <strong>{label(s)}</strong>
                      <span>{formatDate(s.submittedAt ?? s.startedAt)}</span>
                    </span>
                    {result?.sections.map((section) => (
                      <span key={section.id} className="exam-history__score">
                        {t.jlpt.scoreSections[section.id]} <strong>{section.scaled}</strong>
                      </span>
                    ))}
                    {result && result.total !== null && (
                      <>
                        <span className="exam-history__total">{result.total}</span>
                        <Badge tone={result.passed ? 'success' : 'danger'}>{result.passed ? t.jlpt.passed : t.jlpt.failed}</Badge>
                      </>
                    )}
                    <Icon name="chevronRight" size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
