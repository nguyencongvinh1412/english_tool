/**
 * ComparePage
 * Two easily confused grammar points side by side: summaries, how they differ, timelines and forms
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Banner, Card, LinkButton, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { drillPath, grammarApi, grammarPath, type GrammarPoint } from '@/shared/grammarApi';
import { ToolFooter, ToolHeader } from './ToolChrome';
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

  const mistake = (left.content?.mistakes[0] ?? right.content?.mistakes[0]) ?? null;

  return (
    <div className="tool-page">
      <ToolHeader title={t.grammar.compareTitle} subtitle={`${left.title[locale]} ${t.grammar.versusAnd} ${right.title[locale]}`} />

      <div className="grammar-compare-page__columns">
        {points.map((point, i) => (
          <Card key={point.id} padding="lg" className={`grammar-compare-page__column ${i === 0 ? 'grammar-compare-page__column--first' : ''}`}>
            <h2>
              {point.title[locale]} <Badge tone="neutral">{point.cefr}</Badge>
            </h2>
            {point.content ? (
              <dl className="tool-facts">
                <div>
                  <dt>{t.grammar.factStructure}</dt>
                  <dd lang="en">{point.content.forms[0]?.pattern}</dd>
                </div>
                <div>
                  <dt>{t.grammar.factUseWhen}</dt>
                  <dd>{point.content.summary[locale]}</dd>
                </div>
                {point.content.signals.length > 0 && (
                  <div>
                    <dt>{t.grammar.signals}</dt>
                    <dd lang="en">{point.content.signals.slice(0, 5).join(', ')}</dd>
                  </div>
                )}
                {point.content.forms[0] && (
                  <div>
                    <dd lang="en">{point.content.forms[0].example.en}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p>{t.grammar.notReady}</p>
            )}
          </Card>
        ))}
      </div>

      {notes.length > 0 && (
        <div className="tool-diff">
          <p>
            <strong>{t.grammar.mainDifference}:</strong> {notes[0]!.note[locale]}
          </p>
        </div>
      )}

      {mistake && (
        <Card padding="lg">
          <h2 className="grammar__hint">{t.grammar.confusing}</h2>
          <p lang="en">
            <span aria-hidden="true">✗</span> {mistake.wrong}
          </p>
          <p lang="en">
            <span aria-hidden="true">✓</span> <strong>{mistake.right}</strong>
          </p>
          <p>{mistake.why[locale]}</p>
        </Card>
      )}

      <ToolFooter>
        <LinkButton size="lg" icon="bolt" to={drillPath({ point: `${left.id},${right.id}` })}>
          {t.grammar.practicePair}
        </LinkButton>
        <Link to={grammarPath(right.id)} className="tool-footer__link">
          {t.grammar.seePoint(right.title[locale])}
        </Link>
      </ToolFooter>
    </div>
  );
};
