/**
 * GrammarPointPage
 * One grammar point: summary, timeline (tenses, with a second tense to compare), forms, uses with
 * examples, signal words, common mistakes, how it differs from confusable points, and links
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Banner, Button, Card, EmptyState, Icon, Spinner, Tag } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { hasRoadmap, roadmapApi } from '@/shared/roadmapApi';
import { ROUTES } from '@/app/routes';
import { comparePath, decidePath, drillPath, grammarApi, grammarPath, type GrammarLink, type GrammarMistake, type GrammarPoint, type Mastery } from '@/shared/grammarApi';
import { GrammarChat } from './GrammarChat';
import { GrammarPractice } from './GrammarPractice';
import { prefetchTexts, speakOnce } from '@/shared/speech';
import { TenseTimeline } from './TenseTimeline';
import { DECISION_TREES } from './decisions';
import './grammar.css';

const SYMBOL: Record<Mastery, string> = { none: '○', learning: '◔', good: '◕', mastered: '●' };

const LinkList: React.FC<{ title: string; links: GrammarLink[] }> = ({ title, links }) => {
  const { locale } = useI18n();
  if (links.length === 0) return null;
  return (
    <div className="grammar-links__group">
      <h3>{title}</h3>
      <div className="grammar-links__items">
        {links.map((link) => (
          <Link key={link.id} to={grammarPath(link.id)} className="grammar-chip">
            {link.title[locale]} <span>{link.cefr}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

/**
 * English sentence with a speaker button and its translation
 */
const Example: React.FC<{ example: { en: string; vi: string } }> = ({ example }) => {
  const { t, locale } = useI18n();
  return (
    <p className="grammar-example">
      <button type="button" className="grammar-example__speak" onClick={() => speakOnce(example.en)} aria-label={t.chat.listen}>
        <Icon name="headphones" size={14} />
      </button>
      <span lang="en">{example.en}</span>
      {locale === 'vi' && <span className="grammar-example__vi">{example.vi}</span>}
    </p>
  );
};

/** A fresh view per point, so nothing from the previous point lingers */
export const GrammarPointPage: React.FC = () => {
  const { pointId = '' } = useParams();
  return <PointView key={pointId} pointId={pointId} />;
};

const PointView: React.FC<{ pointId: string }> = ({ pointId }) => {
  const { t, locale } = useI18n();
  const [point, setPoint] = useState<GrammarPoint | null>(null);
  const [compare, setCompare] = useState<GrammarPoint | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [mastery, setMastery] = useState<Mastery>('none');
  const [practising, setPractising] = useState(false);
  const [mistake, setMistake] = useState<GrammarMistake | null>(null);
  const [inRoadmap, setInRoadmap] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    grammarApi
      .mistakes()
      .then(({ mistakes }) => setMistake(mistakes.find((m) => m.pointId === pointId) ?? null))
      .catch(() => {});
  }, [pointId]);

  useEffect(() => {
    if (!point) return;
    roadmapApi
      .get()
      .then((data) => setInRoadmap(hasRoadmap(data) && data.roadmap.stages.some((stage) => stage.level === point.cefr)))
      .catch(() => {});
  }, [point]);

  useEffect(() => {
    grammarApi
      .progress()
      .then(({ points }) => setMastery(points.find((p) => p.pointId === pointId)?.mastery ?? 'none'))
      .catch(() => {});
  }, [pointId]);

  useEffect(() => {
    grammarApi
      .point(pointId)
      .then(({ point: loaded }) => {
        setPoint(loaded);
        window.scrollTo({ top: 0 });
      })
      .catch(setError);
  }, [pointId]);

  const compareWith = async (id: string) => {
    if (compare?.id === id) {
      setCompare(null);
      return;
    }
    setCompare((await grammarApi.point(id)).point);
  };

  // Generate every example's audio in one request, so a click plays at once
  useEffect(() => {
    if (!point?.content) return;
    prefetchTexts([...point.content.forms.map((form) => form.example.en), ...point.content.uses.flatMap((use) => use.examples.map((example) => example.en))]);
  }, [point]);

  if (error !== null) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!point) return <Spinner size={30} label={t.common.loading} />;

  const content = point.content;
  const text = (value: { en: string; vi: string }) => value[locale];
  // Tenses it is confused with that also have a timeline
  const comparable = point.timeline ? point.contrasts : [];

  return (
    <div className={`grammar-layout ${chatOpen ? 'grammar-layout--chat' : ''}`}>
      <article className="grammar-point">
        <header className="grammar-point__head">
          <Link to={ROUTES.GRAMMAR} className="grammar-point__back" aria-label={t.grammar.title}>
            <Icon name="arrowLeft" size={18} />
          </Link>
          <div className="grammar-point__titles">
            <h1>{point.title[locale]}</h1>
            <p className="grammar-point__crumb">
              {t.nav.practice} › {t.grammar.title}
              {locale === 'vi' && <span lang="en"> · {point.title.en}</span>}
            </p>
          </div>
        </header>
        <div className="grammar-point__badges">
          <Tag tone={mastery === 'good' || mastery === 'mastered' ? 'brand' : 'neutral'}>
            <span aria-hidden="true">{SYMBOL[mastery]}</span> {t.grammar.mastery[mastery]}
          </Tag>
          {inRoadmap && <Tag tone="brand">{t.enVocab.fromRoadmap}</Tag>}
          <span className="grammar-point__level">{point.cefr}</span>
          {point.status === 'reviewed' ? (
            <Badge tone="success" icon="check">
              {t.grammar.reviewed}
            </Badge>
          ) : (
            point.status === 'draft' && <Badge tone="neutral">{t.grammar.aiDraft}</Badge>
          )}
        </div>

        {!content ? (
          <EmptyState icon="book" title={t.common.comingSoon}>
            {t.grammar.notReady}
          </EmptyState>
        ) : (
          <>
            {mistake && (
              <Banner tone={mistake.urgent ? 'warning' : 'info'}>
                {t.grammar.mistakeBanner(mistake.count)}
                {mistake.examples[0] && (
                  <span lang="en">
                    {' '}
                    <s>{mistake.examples[0].wrong}</s> → <strong>{mistake.examples[0].right}</strong>
                  </span>
                )}
              </Banner>
            )}

            {practising && (
              <GrammarPractice
                pointId={point.id}
                onClose={(next) => {
                  setPractising(false);
                  if (next) setMastery(next);
                }}
              />
            )}

            <Card padding="lg" className="grammar-summary">
              <p>{text(content.summary)}</p>
              {content.tip && (
                <p className="grammar-tip">
                  <Icon name="sparkles" size={16} /> {text(content.tip)}
                </p>
              )}
            </Card>

            {point.timeline && (
              <Card padding="lg" className="grammar-section">
                <h2>{t.grammar.timeline}</h2>
                <TenseTimeline timeline={point.timeline} label={point.title[locale]} />
                {compare?.timeline && <TenseTimeline timeline={compare.timeline} label={compare.title[locale]} />}
                {comparable.length > 0 && (
                  <div className="grammar-compare">
                    <span>{t.grammar.compareWith}</span>
                    {comparable.map((link) => (
                      <Button key={link.id} size="sm" variant={compare?.id === link.id ? 'primary' : 'secondary'} onClick={() => void compareWith(link.id)}>
                        {link.title[locale]}
                      </Button>
                    ))}
                  </div>
                )}
              </Card>
            )}

            <Card padding="lg" className="grammar-section">
              <h2>{t.grammar.forms}</h2>
              <div className="grammar-forms">
                {content.forms.map((form, i) => (
                  <div key={i} className="grammar-form">
                    <span className="grammar-form__label">{text(form.label)}</span>
                    <code className="grammar-form__pattern" lang="en">
                      {form.pattern}
                    </code>
                    <Example example={form.example} />
                  </div>
                ))}
              </div>
            </Card>

            <Card padding="lg" className="grammar-section">
              <h2>{t.grammar.uses}</h2>
              <ol className="grammar-uses">
                {content.uses.map((use, i) => (
                  <li key={i}>
                    <h3>{text(use.title)}</h3>
                    <p>{text(use.explanation)}</p>
                    {use.examples.map((example, j) => (
                      <Example key={j} example={example} />
                    ))}
                  </li>
                ))}
              </ol>
              {content.signals.length > 0 && (
                <div className="grammar-signals">
                  <h3>{t.grammar.signals}</h3>
                  <div className="grammar-links__items">
                    {content.signals.map((signal) => (
                      <span key={signal} className="grammar-chip grammar-chip--plain" lang="en">
                        {signal}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card padding="lg" className="grammar-section">
              <h2>{t.grammar.mistakes}</h2>
              <ul className="grammar-mistakes">
                {content.mistakes.map((mistake, i) => (
                  <li key={i}>
                    <p className="grammar-mistake__wrong" lang="en">
                      <Icon name="x" size={16} /> {mistake.wrong}
                    </p>
                    <p className="grammar-mistake__right" lang="en">
                      <Icon name="check" size={16} /> {mistake.right}
                    </p>
                    <p className="grammar-mistake__why">{text(mistake.why)}</p>
                  </li>
                ))}
              </ul>
            </Card>

            {content.contrastNotes.length > 0 && (
              <Card padding="lg" className="grammar-section grammar-section--contrast">
                <h2>{t.grammar.contrastTitle}</h2>
                {content.contrastNotes.map((note) => {
                  const other = point.contrasts.find((c) => c.id === note.with);
                  return (
                    <div key={note.with} className="grammar-contrast">
                      <h3>
                        {point.title[locale]} ↔ {other ? <Link to={grammarPath(other.id)}>{other.title[locale]}</Link> : note.with}
                      </h3>
                      <p>{text(note.note)}</p>
                      {other && (
                        <Link to={comparePath(point.id, other.id)} className="grammar-contrast__more">
                          {t.grammar.compareDetail} <Icon name="chevronRight" size={14} />
                        </Link>
                      )}
                    </div>
                  );
                })}
              </Card>
            )}
          </>
        )}

        {content && (
          <Card padding="lg" className="grammar-section grammar-tools-card">
            <h2>{t.grammar.relatedTools}</h2>
            <ul className="grammar-toollist">
              {point.contrasts.slice(0, 2).map((link) => (
                <li key={link.id}>
                  <Link to={comparePath(point.id, link.id)}>
                    {t.grammar.compareWithTitle(link.title[locale])} <Icon name="chevronRight" size={16} />
                  </Link>
                </li>
              ))}
              {point.timeline && DECISION_TREES[0] && (
                <li>
                  <Link to={decidePath(DECISION_TREES[0].id)}>
                    {DECISION_TREES[0].title[locale]} <Icon name="chevronRight" size={16} />
                  </Link>
                </li>
              )}
              {point.timeline && (
                <li>
                  <Link to={`${ROUTES.GRAMMAR}/timeline?t=${point.id}`}>
                    {t.grammar.timelineTool} <Icon name="chevronRight" size={16} />
                  </Link>
                </li>
              )}
              <li>
                <Link to={drillPath({ point: point.id })}>
                  {t.grammar.drill.make} <Icon name="chevronRight" size={16} />
                </Link>
              </li>
              <li>
                <Link to={ROUTES.MAPS}>
                  {t.grammar.openInMaps} <Icon name="chevronRight" size={16} />
                </Link>
              </li>
            </ul>
          </Card>
        )}

        {content && (
          <div className="grammar-point__actions">
            <Button icon="bolt" onClick={() => setPractising(true)} disabled={practising}>
              {t.grammar.practice}
            </Button>
            <Button variant="secondary" icon="sparkles" onClick={() => setChatOpen(true)}>
              {t.grammar.chat.title}
            </Button>
          </div>
        )}

        <Card padding="lg" className="grammar-links">
          <LinkList title={t.grammar.links.builds} links={point.builds} />
          <LinkList title={t.grammar.links.contrasts} links={point.contrasts} />
          <LinkList title={t.grammar.links.related} links={point.related} />
          <LinkList title={t.grammar.links.leadsTo} links={point.leadsTo} />
        </Card>
        {content && <p className="vocab-attribution">{t.grammar.aiNote}</p>}
      </article>
      <GrammarChat pointId={point.id} open={chatOpen} onOpenChange={setChatOpen} />
      {content && (
        <div className="grammar-point__cta">
          <Button icon="bolt" onClick={() => setPractising(true)} disabled={practising}>
            {t.grammar.practice}
          </Button>
          <Button variant="secondary" aria-label={t.grammar.chat.title} onClick={() => setChatOpen(true)}>
            AI
          </Button>
        </div>
      )}
    </div>
  );
};
