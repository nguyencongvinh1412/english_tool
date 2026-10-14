/**
 * ComparePage
 * Two easily confused grammar points side by side: summaries, how they differ, timelines and forms
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Banner, Card, Icon, LinkButton, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { ROUTES } from '@/app/routes';
import { grammarApi, grammarPath, type GrammarPoint } from '@/shared/grammarApi';
import { TenseTimeline } from './TenseTimeline';
import './grammar.css';

export const ComparePage: React.FC = () => {
  const { t, locale } = useI18n();
  const { a = '', b = '' } = useParams();
  const [points, setPoints] = useState<[GrammarPoint, GrammarPoint] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([grammarApi.point(a), grammarApi.point(b)])
      .then(([first, second]) => setPoints([first.point, second.point]))
      .catch(setError);
  }, [a, b]);

  if (error !== null) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!points) return <Spinner size={30} label={t.common.loading} />;

  const [left, right] = points;
  // What each card says about the other one
  const notes = [left.content?.contrastNotes.find((n) => n.with === right.id), right.content?.contrastNotes.find((n) => n.with === left.id)].filter(Boolean);

  return (
    <div className="grammar-compare-page">
      <Link to={ROUTES.GRAMMAR} className="grammar-point__back">
        <Icon name="arrowLeft" size={16} /> {t.grammar.title}
      </Link>
      <h1 className="grammar-compare-page__title">
        {left.title[locale]} <span>{t.grammar.versus}</span> {right.title[locale]}
      </h1>

      {notes.length > 0 && (
        <Card padding="lg" className="grammar-section grammar-section--contrast">
          <h2>{t.grammar.contrastTitle}</h2>
          {notes.map((note, i) => (
            <p key={i}>{note!.note[locale]}</p>
          ))}
        </Card>
      )}

      <div className="grammar-compare-page__columns">
        {points.map((point) => (
          <Card key={point.id} padding="lg" className="grammar-compare-page__column">
            <h2>
              {point.title[locale]} <Badge tone="reading">{point.cefr}</Badge>
            </h2>
            {point.content ? (
              <>
                <p>{point.content.summary[locale]}</p>
                {point.timeline && <TenseTimeline timeline={point.timeline} label={point.title[locale]} />}
                <h3>{t.grammar.forms}</h3>
                {point.content.forms.map((form, i) => (
                  <div key={i} className="grammar-form">
                    <span className="grammar-form__label">{form.label[locale]}</span>
                    <code className="grammar-form__pattern" lang="en">
                      {form.pattern}
                    </code>
                    <span lang="en">{form.example.en}</span>
                  </div>
                ))}
                {point.content.signals.length > 0 && (
                  <>
                    <h3>{t.grammar.signals}</h3>
                    <div className="grammar-links__items">
                      {point.content.signals.map((signal) => (
                        <span key={signal} className="grammar-chip grammar-chip--plain" lang="en">
                          {signal}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <p>{t.grammar.notReady}</p>
            )}
            <LinkButton to={grammarPath(point.id)} variant="secondary" icon="book">
              {t.grammar.openPoint}
            </LinkButton>
          </Card>
        ))}
      </div>
    </div>
  );
};
