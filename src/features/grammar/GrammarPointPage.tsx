/**
 * GrammarPointPage
 * One grammar point: summary, timeline (tenses, with a second tense to compare), forms, uses with
 * examples, signal words, common mistakes, how it differs from confusable points, and links
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Banner, Button, Card, EmptyState, Icon, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { ROUTES } from '@/app/routes';
import { comparePath, grammarApi, grammarPath, type GrammarLink, type GrammarPoint, type Mastery } from '@/shared/grammarApi';
import { GrammarPractice } from './GrammarPractice';
import { speakOnce } from '@/shared/speech';
import { TenseTimeline } from './TenseTimeline';
import './grammar.css';

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

  if (error !== null) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!point) return <Spinner size={30} label={t.common.loading} />;

  const content = point.content;
  const text = (value: { en: string; vi: string }) => value[locale];
  // Tenses it is confused with that also have a timeline
  const comparable = point.timeline ? point.contrasts : [];

  return (
    <article className="grammar-point">
      <Link to={ROUTES.GRAMMAR} className="grammar-point__back">
        <Icon name="arrowLeft" size={16} /> {t.grammar.title}
      </Link>
      <header className="grammar-point__head">
        <h1>{point.title[locale]}</h1>
        {locale === 'vi' && <p className="grammar-point__en">{point.title.en}</p>}
        <div className="grammar-point__badges">
          <Badge tone="reading">{point.cefr}</Badge>
          {mastery !== 'none' && (
            <Badge tone={mastery === 'mastered' ? 'success' : mastery === 'good' ? 'reading' : 'warning'}>{t.grammar.mastery[mastery]}</Badge>
          )}
          {point.status === 'reviewed' ? (
            <Badge tone="success" icon="check">
              {t.grammar.reviewed}
            </Badge>
          ) : (
            point.status === 'draft' && <Badge tone="neutral">{t.grammar.aiDraft}</Badge>
          )}
        </div>
      </header>

      {!content ? (
        <EmptyState icon="book" title={t.common.comingSoon}>
          {t.grammar.notReady}
        </EmptyState>
      ) : (
        <>
          {practising ? (
            <GrammarPractice
              pointId={point.id}
              onClose={(next) => {
                setPractising(false);
                if (next) setMastery(next);
              }}
            />
          ) : (
            <Card padding="md" className="grammar-practice-cta">
              <span>{t.grammar.practiceIntro}</span>
              <Button icon="bolt" onClick={() => setPractising(true)}>
                {t.grammar.practice}
              </Button>
            </Card>
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

      <Card padding="lg" className="grammar-links">
        <LinkList title={t.grammar.links.builds} links={point.builds} />
        <LinkList title={t.grammar.links.contrasts} links={point.contrasts} />
        <LinkList title={t.grammar.links.related} links={point.related} />
        <LinkList title={t.grammar.links.leadsTo} links={point.leadsTo} />
      </Card>
      {content && <p className="vocab-attribution">{t.grammar.aiNote}</p>}
    </article>
  );
};
