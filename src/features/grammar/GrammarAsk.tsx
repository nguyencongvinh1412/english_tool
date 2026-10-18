/**
 * GrammarAsk
 * Ask the AI a grammar question; the answer links to the grammar points that explain it
 */
import type React from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banner, Button, Card, Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { InlineMarkdown } from '@/shared/InlineMarkdown';
import { grammarApi, grammarPath, type GrammarAnswer } from '@/shared/grammarApi';
import { mapsApi } from '@/shared/mapsApi';
import { ROUTES } from '@/app/routes';
import { mapIntent } from '@/features/maps/intent';
import { useMapProposal } from '@/features/maps/useMapProposal';

export const GrammarAsk: React.FC = () => {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { propose, dialog, asking } = useMapProposal(({ map }) => navigate(`${ROUTES.MAPS}/${map.id}`));
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ asked: string; result: GrammarAnswer } | { error: unknown } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const asked = question.trim();
    if (asked.length < 3) return;
    setBusy(true);
    try {
      // "Draw a mind map of the tenses" and the like: the AI drafts a map instead of answering a question
      const intent = mapIntent(asked);
      if (intent) {
        const latest = intent === 'update' ? (await mapsApi.list()).maps[0] : undefined;
        await propose(latest ? { intent: 'update', mapId: latest.id, instruction: asked } : intent === 'learned' ? { intent: 'create', instruction: asked } : { intent: 'topic', topic: asked });
        setQuestion('');
        setAnswer(null);
        return;
      }
      setAnswer({ asked, result: await grammarApi.ask(asked) });
    } catch (error) {
      setAnswer({ error });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding="lg" className="grammar-ask">
      <h2 className="en-group__title">
        <Icon name="chat" size={20} /> {t.grammar.askTitle}
      </h2>
      <form className="en-type grammar-ask__form" onSubmit={submit}>
        <input
          className="input"
          value={question}
          maxLength={400}
          placeholder={t.grammar.askPlaceholder}
          aria-label={t.grammar.askTitle}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <Button type="submit" icon="sparkles" loading={busy || asking} disabled={question.trim().length < 3}>
          {t.grammar.askButton}
        </Button>
      </form>
      <p className="grammar__hint">{t.maps.ai.assistantTip}</p>
      {dialog}
      {answer && 'error' in answer && <Banner tone="danger">{errorMessage(answer.error, t)}</Banner>}
      {answer && 'result' in answer && (
        <div className="grammar-ask__answer" aria-live="polite">
          <p className="grammar-ask__asked">{answer.asked}</p>
          <div className="grammar-ask__text">
            {answer.result.answer.split(/\n{2,}/).map((block, i) => {
              // Lines starting with "-" are examples; the rest is prose
              const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
              const bullets = lines.filter((line) => /^[-•*]\s/.test(line));
              const prose = lines.filter((line) => !/^[-•*]\s/.test(line));
              return (
                <div key={i}>
                  {prose.length > 0 && (
                    <p>
                      <InlineMarkdown text={prose.join(' ')} />
                    </p>
                  )}
                  {bullets.length > 0 && (
                    <ul>
                      {bullets.map((line, j) => (
                        <li key={j}>
                          <InlineMarkdown text={line.replace(/^[-•*]\s+/, '')} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          {answer.result.points.length > 0 && (
            <div className="grammar-links__items">
              <span className="grammar-ask__see">{t.grammar.askSee}</span>
              {answer.result.points.map((point) => (
                <Link key={point.id} to={grammarPath(point.id)} className="grammar-chip">
                  {point.title[locale]} <span>{point.cefr}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
