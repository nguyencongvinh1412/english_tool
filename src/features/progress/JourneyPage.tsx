/**
 * JourneyPage
 * "My progress": the goal and how much of it is covered, what to do next, vocabulary by level, grammar by topic,
 * repeated mistakes, this week, trends over time and mock test scores
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Banner, Card, Icon, LinkButton, PageHeader, Spinner, StatTile } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useCurrentUser } from '@/app/AuthProvider';
import { ROUTES } from '@/app/routes';
import { errorMessage } from '@/shared/http';
import { grammarPath, type Bilingual } from '@/shared/grammarApi';
import { journeyApi, type Coverage, type HistoryPoint, type Journey, type PathStep } from '@/shared/journeyApi';
import { useGrammarTitles } from '@/features/grammar/useGrammarTitles';
import './journey.css';

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * Stacked bar: mastered, then still learning, then not started
 */
const CoverageBar: React.FC<{ total: number; seen: number; mastered: number; label: string; muted?: boolean }> = ({ total, seen, mastered, label, muted }) => (
  <span className={`jbar ${muted ? 'jbar--muted' : ''}`} role="img" aria-label={label}>
    <span className="jbar__mastered" style={{ width: `${percent(mastered, total)}%` }} />
    <span className="jbar__learning" style={{ width: `${percent(seen - mastered, total)}%` }} />
  </span>
);

const Legend: React.FC = () => {
  const { t } = useI18n();
  return (
    <ul className="jlegend">
      <li>
        <span className="jlegend__dot jlegend__dot--mastered" /> {t.journey.legend.mastered}
      </li>
      <li>
        <span className="jlegend__dot jlegend__dot--learning" /> {t.journey.legend.learning}
      </li>
      <li>
        <span className="jlegend__dot" /> {t.journey.legend.fresh}
      </li>
    </ul>
  );
};

/**
 * One headline meter: "Words up to B1: 120 of 800 mastered"
 */
const Meter: React.FC<{ title: string; coverage: Coverage }> = ({ title, coverage }) => {
  const { t } = useI18n();
  const text = `${coverage.mastered}/${coverage.total}`;
  return (
    <div className="jmeter">
      <div className="jmeter__head">
        <strong>{title}</strong>
        <span>
          {text} · {t.journey.percentMastered(percent(coverage.mastered, coverage.total))}
        </span>
      </div>
      <CoverageBar {...coverage} label={`${title}: ${text}`} />
    </div>
  );
};

/**
 * Words met and mastered over time (and grammar points mastered), drawn as lines
 */
const Trend: React.FC<{ history: HistoryPoint[]; language: 'en' | 'ja' }> = ({ history, language }) => {
  const { t, formatDate } = useI18n();
  if (history.length < 2) return <p className="grammar__hint">{t.journey.trendEmpty}</p>;

  const series = [
    { key: 'seen', label: t.journey.trend.seen, tone: 'reading', values: history.map((h) => h.vocabSeen) },
    { key: 'mastered', label: t.journey.trend.mastered, tone: 'brand', values: history.map((h) => h.vocabMastered) },
    ...(language === 'en' ? [{ key: 'grammar', label: t.journey.trend.grammar, tone: 'writing', values: history.map((h) => h.grammarMastered) }] : []),
  ];
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const W = 600;
  const H = 150;
  const x = (i: number) => (i / (history.length - 1)) * W;
  const y = (value: number) => H - (value / max) * (H - 8) - 4;

  return (
    <div className="jtrend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => `${s.label}: ${s.values[s.values.length - 1]}`).join(', ')} preserveAspectRatio="none">
        {series.map((s) => (
          <polyline key={s.key} points={s.values.map((value, i) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`).join(' ')} fill="none" stroke={`var(--${s.tone})`} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="jtrend__axis">
        <span>{formatDate(history[0].day)}</span>
        <span>{max}</span>
        <span>{formatDate(history[history.length - 1].day)}</span>
      </div>
      <ul className="jlegend">
        {series.map((s) => (
          <li key={s.key}>
            <span className="jlegend__dot" style={{ background: `var(--${s.tone})` }} /> {s.label}: {s.values[s.values.length - 1]}
          </li>
        ))}
      </ul>
    </div>
  );
};

/**
 * Where a next step leads
 */
function stepLink(step: PathStep, language: 'en' | 'ja'): string {
  const vocab = language === 'ja' ? ROUTES.JA_VOCAB : ROUTES.VOCABULARY;
  switch (step.type) {
    case 'review-words':
    case 'learn-words':
      return vocab;
    case 'review-grammar':
      return ROUTES.GRAMMAR;
    default:
      return grammarPath(step.pointId);
  }
}

export const JourneyPage: React.FC = () => {
  const { t, locale } = useI18n();
  const user = useCurrentUser();
  const [journey, setJourney] = useState<Journey | null>(null);
  const [error, setError] = useState<unknown>(null);
  const titles = useGrammarTitles();
  const title = (id: string, fallback: Bilingual = { en: id, vi: id }) => (titles.get(id) ?? fallback)[locale];

  useEffect(() => {
    journeyApi.get().then(setJourney).catch(setError);
    // Reload when the study language is switched
  }, [user.studyLanguage]);

  if (error !== null) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!journey) return <Spinner size={30} label={t.common.loading} />;

  const { goal, grammar } = journey;
  const j = t.journey;
  const goalText =
    goal.kind === 'toeic' || goal.kind === 'ielts'
      ? goal.targetScore
        ? j.goal[goal.kind](goal.targetScore, goal.targetLevel ?? '?')
        : j.goal.none
      : goal.kind === 'cefr' && goal.targetLevel
        ? j.goal.cefr(goal.targetLevel)
        : goal.kind === 'jlpt' && goal.targetLevel
          ? j.goal.jlpt(goal.targetLevel)
          : j.goal.none;
  const last = journey.covered[journey.covered.length - 1] ?? null;
  const scope = goal.targetLevel ? last : null;
  const stepText = (step: PathStep): string => {
    switch (step.type) {
      case 'review-words':
        return j.steps.reviewWords(step.count);
      case 'review-grammar':
        return j.steps.reviewGrammar(step.count);
      case 'fix-mistakes':
        return j.steps.fixMistakes(title(step.pointId), step.count);
      case 'learn-words':
        return j.steps.learnWords(step.level, step.remaining);
      case 'learn-grammar':
        return j.steps.learnGrammar(title(step.pointId), step.level);
    }
  };

  return (
    <div className="journey">
      <PageHeader eyebrow="Progress" title={j.title} description={j.intro} />

      <Card padding="lg" className="journey-goal reveal">
        <div className="journey-goal__head">
          <div>
            <p className="journey__label">{j.goalTitle}</p>
            <h2>{goalText}</h2>
            {goal.kind === 'none' && <p className="grammar__hint">{j.setGoal}</p>}
          </div>
          <LinkButton to={ROUTES.PROFILE} variant="secondary" size="sm" icon="target">
            {j.editGoal}
          </LinkButton>
        </div>
        <h3 className="journey__label">{j.coverageTitle(scope)}</h3>
        <Meter title={journey.language === 'ja' ? j.kanjiAndWords : j.words} coverage={journey.vocab.goal} />
        {grammar && <Meter title={j.grammarPoints} coverage={{ total: grammar.goal.total, seen: grammar.goal.seen, mastered: grammar.goal.mastered }} />}
        <Legend />
        <p className="grammar__hint">{j.coverageNote}</p>
      </Card>

      <Card padding="lg" className="reveal">
        <h2>{j.stepsTitle}</h2>
        {journey.steps.length === 0 ? (
          <p className="grammar__hint">{j.stepsDone}</p>
        ) : (
          <ol className="jsteps">
            {journey.steps.map((step) => (
              <li key={step.type}>
                <Link to={stepLink(step, journey.language)}>
                  <Icon name={step.type.startsWith('review') ? 'bolt' : step.type === 'fix-mistakes' ? 'flag' : 'plus'} size={18} />
                  {stepText(step)}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <div className="journey-week reveal">
        <StatTile icon="book" tone="reading" value={journey.week.newWords} label={j.newWords} />
        {grammar && <StatTile icon="graph" tone="writing" value={journey.week.grammarPractised} label={j.grammarPractised} />}
        <StatTile icon="flame" tone="speaking" value={journey.week.studyDays} label={j.studyDays} />
      </div>

      <Card padding="lg" className="reveal">
        <h2>{j.vocabTitle}</h2>
        <ul className="jrows">
          {journey.vocab.levels.map((row) => {
            const inGoal = journey.covered.includes(row.level);
            const name = row.kind ? `${row.level} · ${j.kinds[row.kind] ?? row.kind}` : row.level;
            return (
              <li key={`${row.level}:${row.kind ?? ''}`} className="jrow">
                <span className="jrow__name">
                  {name}
                  {!inGoal && goal.targetLevel && <small> {j.beyondGoal}</small>}
                </span>
                <CoverageBar total={row.total} seen={row.seen} mastered={row.mastered} label={`${name}: ${j.levelCounts(row.seen, row.mastered, row.total)}`} muted={!inGoal && Boolean(goal.targetLevel)} />
                <span className="jrow__count">{j.levelCounts(row.seen, row.mastered, row.total)}</span>
              </li>
            );
          })}
        </ul>
        <Legend />
      </Card>

      {grammar && (
        <Card padding="lg" className="reveal">
          <div className="journey-goal__head">
            <h2>{j.grammarTitle}</h2>
            <LinkButton to={ROUTES.GRAMMAR} variant="secondary" size="sm" icon="graph">
              {j.openMap}
            </LinkButton>
          </div>
          <ul className="jrows">
            {grammar.clusters.map((cluster) => (
              <li key={cluster.id} className="jrow">
                <span className="jrow__name">{cluster.title[locale]}</span>
                <CoverageBar total={cluster.total} seen={cluster.practised} mastered={cluster.mastered} label={`${cluster.title[locale]}: ${j.grammarCounts(cluster.practised, cluster.mastered, cluster.total)}`} />
                <span className="jrow__count">{j.grammarCounts(cluster.practised, cluster.mastered, cluster.total)}</span>
              </li>
            ))}
          </ul>
          <Legend />
        </Card>
      )}

      {grammar && (
        <Card padding="lg" className="reveal">
          <h2>{j.weakTitle}</h2>
          {grammar.weak.length === 0 ? (
            <p className="grammar__hint">{j.weakNone}</p>
          ) : (
            <ul className="jweak">
              {grammar.weak.map((m) => (
                <li key={m.pointId}>
                  <Link to={grammarPath(m.pointId)} className="grammar-chip">
                    {title(m.pointId)} <span>×{m.count}</span>
                  </Link>
                  {m.urgent && <Badge tone="danger">{t.grammar.reviewNow}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card padding="lg" className="reveal">
        <h2>{j.trendTitle}</h2>
        <Trend history={journey.history} language={journey.language} />
      </Card>

      <Card padding="lg" className="reveal">
        <h2>{j.examsTitle}</h2>
        {journey.exams.length === 0 ? (
          <p className="grammar__hint">{j.examsEmpty}</p>
        ) : (
          <ul className="jexams">
            {journey.exams.map((exam) => (
              <li key={exam.id}>
                <Badge tone="exam">{j.exams[exam.exam]}</Badge>
                <strong>
                  {exam.score}/{exam.max}
                </strong>
                {exam.passed !== null && <Badge tone={exam.passed ? 'success' : 'danger'}>{exam.passed ? j.passed : j.notPassed}</Badge>}
                <span className="grammar__hint">{new Date(exam.at).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB')}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
