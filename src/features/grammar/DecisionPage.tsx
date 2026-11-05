/**
 * DecisionPage
 * Walks a decision tree one question at a time and ends at a grammar point
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, EmptyState, Icon, LinkButton } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import '@/features/vocab/vocab.css';
import { ROUTES } from '@/app/routes';
import { grammarApi, grammarPath, type Bilingual } from '@/shared/grammarApi';
import { DECISION_TREES, type DecisionOption } from './decisions';
import { ToolFooter, ToolHeader } from './ToolChrome';
import './grammar.css';

export const DecisionPage: React.FC = () => {
  const { treeId = '' } = useParams();
  const tree = DECISION_TREES.find((d) => d.id === treeId);
  // key: a new tree starts from its first question
  return tree ? <Walk key={tree.id} treeId={tree.id} /> : <Missing />;
};

const Missing: React.FC = () => {
  const { t } = useI18n();
  return (
    <EmptyState icon="graph" title={t.grammar.title}>
      <Link to={ROUTES.GRAMMAR}>{t.grammar.title}</Link>
    </EmptyState>
  );
};

const Walk: React.FC<{ treeId: string }> = ({ treeId }) => {
  const { t, locale } = useI18n();
  const tree = DECISION_TREES.find((d) => d.id === treeId)!;
  // Questions answered so far, with the chosen option
  const [path, setPath] = useState<{ node: string; option: DecisionOption }[]>([]);
  /** The option picked on the current question, confirmed with Continue */
  const [picked, setPicked] = useState<number | null>(null);
  const [titles, setTitles] = useState<Map<string, Bilingual>>(new Map());

  useEffect(() => {
    grammarApi
      .map()
      .then((map) => setTitles(new Map(map.points.map((p) => [p.id, p.title]))))
      .catch(() => {});
  }, []);
  const last = path.at(-1);
  const current = last?.option.next ?? (last ? null : tree.start);
  const result = last?.option.result;

  return (
    <div className="tool-page">
      <ToolHeader title={t.grammar.decideTitle} subtitle={tree.title[locale]} />

      {path.length > 0 && (
        <ol className="tool-trail">
          {path.map((step, i) => (
            <li key={i}>
              <button type="button" onClick={() => setPath(path.slice(0, i))} aria-label={`${tree.nodes[step.node].question[locale]}: ${step.option.label[locale]}`}>
                {step.option.label[locale]} <Icon name="pen" size={12} />
              </button>
            </li>
          ))}
        </ol>
      )}

      {current && (
        <>
          <Card padding="lg" key={current}>
            <p className="grammar__hint">{t.grammar.questionN(path.length + 1)}</p>
            <h2 className="grammar-decide__q">{tree.nodes[current].question[locale]}</h2>
          </Card>
          <div className="en-choices">
            {tree.nodes[current].options.map((option, i) => (
              <button key={i} type="button" className={`tool-option ${picked === i ? 'tool-option--on' : ''}`} aria-pressed={picked === i} onClick={() => setPicked(i)}>
                {picked === i && <span aria-hidden="true">✓</span>}
                <span>{option.label[locale]}</span>
              </button>
            ))}
          </div>
          <ToolFooter>
            <Button
              size="lg"
              disabled={picked === null}
              onClick={() => {
                if (picked === null) return;
                setPath([...path, { node: current, option: tree.nodes[current].options[picked] }]);
                setPicked(null);
              }}
            >
              {t.grammar.continue}
            </Button>
          </ToolFooter>
        </>
      )}

      {result && (
        <>
          <Card padding="lg" className="reveal">
            <p className="grammar-decide__eyebrow">{t.grammar.decideResult}</p>
            <h2>{titles.get(result.point)?.[locale] ?? result.point}</h2>
            <p lang={locale}>{result.note[locale]}</p>
          </Card>
          <ToolFooter>
            <LinkButton size="lg" to={grammarPath(result.point)} icon="book">
              {t.grammar.openPoint}
            </LinkButton>
            <button type="button" className="exam-footer__link" onClick={() => setPath([])}>
              {t.grammar.startOver}
            </button>
          </ToolFooter>
        </>
      )}
    </div>
  );
};
