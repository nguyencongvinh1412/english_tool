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
    <div className="grammar-decide">
      <Link to={ROUTES.GRAMMAR} className="grammar-point__back">
        <Icon name="arrowLeft" size={16} /> {t.grammar.title}
      </Link>
      <header>
        <h1>{tree.title[locale]}</h1>
        <p>{tree.intro[locale]}</p>
      </header>

      {path.length > 0 && (
        <ol className="grammar-decide__trail">
          {path.map((step, i) => (
            <li key={i}>
              <span>{tree.nodes[step.node].question[locale]}</span>
              <button type="button" onClick={() => setPath(path.slice(0, i))}>
                {step.option.label[locale]} <Icon name="pen" size={12} />
              </button>
            </li>
          ))}
        </ol>
      )}

      {current && (
        <Card padding="lg" className="grammar-decide__question" key={current}>
          <h2>{tree.nodes[current].question[locale]}</h2>
          <div className="en-choices">
            {tree.nodes[current].options.map((option, i) => (
              <button key={i} type="button" className="en-choice" onClick={() => setPath([...path, { node: current, option }])}>
                <Icon name="chevronRight" size={16} />
                <span>{option.label[locale]}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {result && (
        <Card padding="lg" className="grammar-decide__result reveal">
          <p className="grammar-decide__eyebrow">{t.grammar.decideResult}</p>
          <h2>{titles.get(result.point)?.[locale] ?? result.point}</h2>
          <p lang={locale}>{result.note[locale]}</p>
          <div className="grammar-decide__actions">
            <LinkButton to={grammarPath(result.point)} icon="book">
              {t.grammar.openPoint}
            </LinkButton>
            <Button variant="ghost" icon="arrowLeft" onClick={() => setPath([])}>
              {t.grammar.startOver}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};
