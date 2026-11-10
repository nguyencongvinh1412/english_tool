/**
 * ErrorBookPage
 * The learner's mistakes, sorted: listening by kind (with a tip for each), reading by kind of question, writing and
 * speaking by band descriptor criterion. Always worked out from what they did, so there is nothing to keep by hand.
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, ErrorState, ProgressBar, Skeleton, Tag } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { formatBand, ieltsPathApi, type CriterionBand, type ErrorBook, type ListeningCategory } from '@/shared/ieltsPathApi';
import './ieltsPath.css';

const CATEGORY_ORDER: ListeningCategory[] = ['spelling', 'plural', 'distractor', 'misheard', 'missed'];

const Criteria: React.FC<{ criteria: CriterionBand[]; lowest: CriterionBand | null }> = ({ criteria, lowest }) => {
  const { t } = useI18n();
  return (
    <ul className="errbook__bars">
      {criteria.map((c) => (
        <li key={c.key} className="errbook__bar">
          <div className="errbook__bar-top">
            <strong>{c.name}</strong>
            <span>
              {formatBand(c.band)} {lowest?.key === c.key && <Tag tone="notice">{t.ieltsPath.errorBook.lowest}</Tag>}
            </span>
          </div>
          <ProgressBar value={(c.band / 9) * 100} label={c.name} size="sm" />
        </li>
      ))}
    </ul>
  );
};

export const ErrorBookPage: React.FC = () => {
  const { t } = useI18n();
  const p = t.ieltsPath;
  const e = p.errorBook;
  const [book, setBook] = useState<ErrorBook | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    ieltsPathApi
      .errors()
      .then((result) => active && setBook(result.book))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  if (failed)
    return (
      <ErrorState
        title={p.loadError}
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            {p.retry}
          </Button>
        }
      />
    );
  if (!book) return <Skeleton height={160} label={t.common.loading} />;

  return (
    <div className="errbook">
      <header className="errbook__head">
        <h1>{e.title}</h1>
        <p className="create__muted">{e.intro}</p>
        <Link to={ROUTES.IELTS_PATH} className="stage__more">
          {e.back}
        </Link>
      </header>

      {book.sessions === 0 ? (
        <EmptyState icon="sparkles" title={e.title}>
          {e.empty}
        </EmptyState>
      ) : (
        <>
          <Card padding="lg">
            <h2>{e.listening.title}</h2>
            <p className="create__muted">{e.listening.summary(book.listening.wrong, book.listening.questions)}</p>
            <ul className="errbook__bars">
              {CATEGORY_ORDER.filter((c) => book.listening.byCategory[c] > 0).map((c) => (
                <li key={c} className="errbook__bar">
                  <div className="errbook__bar-top">
                    <strong>{e.listening.categories[c].name}</strong>
                    <span>{book.listening.byCategory[c]}</span>
                  </div>
                  <ProgressBar value={book.listening.wrong > 0 ? (book.listening.byCategory[c] / book.listening.wrong) * 100 : 0} label={e.listening.categories[c].name} size="sm" />
                  <span className="create__muted">{e.listening.categories[c].tip}</span>
                </li>
              ))}
            </ul>
            {book.listening.examples.length > 0 && (
              <>
                <h3>{e.listening.examples}</h3>
                <ul className="errbook__examples">
                  {book.listening.examples.map((x, i) => (
                    <li key={i}>
                      <span lang="en">{x.prompt}</span>
                      <br />
                      <span className="create__muted">
                        {e.listening.answered}: <span lang="en">{x.answered || e.listening.blank}</span> · {e.listening.expected}: <span lang="en">{x.expected}</span> · <Tag tone="neutral">{e.listening.categories[x.category].name}</Tag>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card padding="lg">
            <h2>{e.reading.title}</h2>
            <p className="create__muted">{e.reading.summary(book.reading.questions)}</p>
            <ul className="errbook__bars">
              {book.reading.byType.map((row) => (
                <li key={row.type} className="errbook__bar">
                  <div className="errbook__bar-top">
                    <strong>{e.reading.types[row.type]}</strong>
                    <span>{e.reading.correct(row.correct, row.total)}</span>
                  </div>
                  <ProgressBar value={(row.correct / row.total) * 100} label={e.reading.types[row.type]} size="sm" />
                </li>
              ))}
            </ul>
          </Card>

          <Card padding="lg">
            <h2>{e.writing.title}</h2>
            {book.writing.graded === 0 ? <p className="create__muted">{e.writing.none}</p> : <><p className="create__muted">{e.writing.graded(book.writing.graded)}</p><Criteria criteria={book.writing.criteria} lowest={book.writing.lowest} /></>}
          </Card>

          <Card padding="lg">
            <h2>{e.speaking.title}</h2>
            {book.speaking.graded === 0 ? <p className="create__muted">{e.speaking.none}</p> : <><p className="create__muted">{e.speaking.graded(book.speaking.graded)}</p><Criteria criteria={book.speaking.criteria} lowest={book.speaking.lowest} /></>}
          </Card>
        </>
      )}
    </div>
  );
};
