/**
 * SessionSummaryView
 * Results at the end of a practice session: score, time, score by set, and the questions to look at again
 */
import type React from 'react';
import { Badge, Banner, Button, Card, PageHeader, ProgressBar, StatTile } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { splitDuration, type SessionSummary } from './session';
import './practice.css';

interface SessionSummaryViewProps {
  tone: string;
  topic: string;
  summary: SessionSummary;
  /** Language of the question text, for correct fonts and hyphenation */
  lang?: string;
  /** Renders question, answer and title text; Japanese shows furigana */
  renderText?: (text: string) => React.ReactNode;
  onReview: () => void;
  onBack: () => void;
}

export const SessionSummaryView: React.FC<SessionSummaryViewProps> = ({ tone, topic, summary, lang = 'en', renderText = (text) => text, onReview, onBack }) => {
  const { t } = useI18n();
  const s = t.quiz.session;
  const { minutes, seconds } = splitDuration(summary.durationSec);

  return (
    <div className="practice session-summary" style={{ ['--skill' as string]: `var(--${tone})`, ['--skill-edge' as string]: `var(--${tone}-edge)` }}>
      <PageHeader eyebrow={s.eyebrow} title={s.summaryTitle} description={s.topicLine(topic)} />

      <div className="session-summary__stats">
        <StatTile icon="target" tone={tone} value={`${summary.correct} / ${summary.total}`} label={`${s.score} · ${summary.percent}%`} />
        <StatTile icon="layers" tone={tone} value={summary.rounds} label={s.sets} />
        <StatTile icon="chart" tone={tone} value={s.duration(minutes, seconds)} label={s.time} />
      </div>

      <div className="practice__actions">
        <Button icon="book" onClick={onReview}>
          {s.review}
        </Button>
        <Button variant="secondary" icon="arrowLeft" onClick={onBack}>
          {s.toLibrary}
        </Button>
      </div>

      {summary.perRound.length > 1 && (
        <Card padding="lg" className="session-summary__sets">
          <h2 className="session-summary__heading">{s.perSet}</h2>
          <ul className="session-summary__list">
            {summary.perRound.map((round, index) => (
              <li key={index} className="session-set">
                <span className="session-set__name" lang={lang}>
                  {s.setNumber(index + 1)} · {renderText(round.title)}
                </span>
                <Badge tone={round.percent >= 80 ? 'success' : 'warning'}>
                  {round.correct} / {round.total}
                </Badge>
                <div className="session-set__bar">
                  <ProgressBar value={round.percent} tone={tone} size="sm" label={round.title} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card padding="lg" className="session-summary__mistakes">
        <h2 className="session-summary__heading">{s.mistakesTitle}</h2>
        {summary.mistakes.length === 0 ? (
          <Banner tone="success">{s.noMistakes}</Banner>
        ) : (
          <>
            <p className="session-summary__intro">{s.mistakesIntro(summary.mistakes.length)}</p>
            <ol className="session-miss-list">
              {summary.mistakes.map((miss, index) => (
                <li key={index} className="session-miss">
                  <span className="session-miss__where" lang={lang}>
                    {s.setNumber(miss.round)} · {renderText(miss.roundTitle)}
                  </span>
                  <p className="session-miss__prompt" lang={lang}>
                    {renderText(miss.prompt)}
                  </p>
                  <p className="session-miss__yours">
                    {miss.yourAnswer === null ? (
                      s.noAnswer
                    ) : (
                      <>
                        {s.yourAnswer}: <span lang={lang}>{renderText(miss.yourAnswer)}</span>
                      </>
                    )}
                  </p>
                  <p className="session-miss__right">
                    {s.rightAnswer}: <span lang={lang}>{renderText(miss.correctAnswer)}</span>
                  </p>
                  <p className="session-miss__why">{miss.explanation}</p>
                </li>
              ))}
            </ol>
          </>
        )}
      </Card>
    </div>
  );
};
