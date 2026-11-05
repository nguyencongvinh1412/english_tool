/**
 * PracticeHub
 * The six practice areas side by side (vocabulary and grammar are not parts of Reading), with today's
 * suggestion on top. Each card lists its activities; AI ones are labelled so credits never come as a surprise.
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, ErrorState, Skeleton, Tag, type TagTone } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useCurrentUser } from '@/app/AuthProvider';
import { tasksLeft } from '@/shared/billingApi';
import { todayApi, type Today } from '@/shared/todayApi';
import { useGrammarTitles } from '@/features/grammar/useGrammarTitles';
import { fromToday, taskKind, taskLink, taskText } from '@/features/today/todayTasks';
import { skillsFor, type ActivityId } from '@/features/skills/skills';
import './practiceHub.css';

type CardId = 'vocabulary' | 'grammar' | 'listening' | 'reading' | 'speaking' | 'writing';
type Activity = { id: ActivityId; route: string };

/** Activities that need the AI to score or reply */
const AI_ACTIVITIES = new Set<ActivityId>(['pronunciation', 'conversation', 'scenarios', 'ieltsSpeaking', 'writingEmail', 'writingTask1', 'writingTask2', 'jaPronunciation', 'jaConversation', 'jaScenarios', 'jaWriting']);
const VOCAB_GRAMMAR = new Set<ActivityId>(['enVocab', 'grammar', 'vocab', 'kana']);
const TONES: Record<CardId, TagTone> = { vocabulary: 'neutral', grammar: 'neutral', listening: 'listening', reading: 'reading', speaking: 'speaking', writing: 'writing' };

function cardsFor(language: 'en' | 'ja'): { id: CardId; activities: Activity[] }[] {
  const all = skillsFor(language).flatMap((skill) => skill.activities.map((a) => ({ skill: skill.id, id: a.id, route: a.route })));
  const pick = (ids: ActivityId[]) => all.filter((a) => ids.includes(a.id)).map(({ id, route }) => ({ id, route }));
  const bySkill = (skill: string) => all.filter((a) => a.skill === skill && !VOCAB_GRAMMAR.has(a.id)).map(({ id, route }) => ({ id, route }));
  const cards: { id: CardId; activities: Activity[] }[] = [{ id: 'vocabulary', activities: pick(language === 'en' ? ['enVocab'] : ['vocab', 'kana']) }];
  if (language === 'en') cards.push({ id: 'grammar', activities: pick(['grammar']) });
  for (const id of ['listening', 'reading', 'speaking', 'writing'] as const) cards.push({ id, activities: bySkill(id) });
  return cards;
}

export const PracticeHub: React.FC = () => {
  const { t, locale } = useI18n();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const titles = useGrammarTitles();
  const [today, setToday] = useState<Today | null>(null);
  const [failed, setFailed] = useState(false);
  const language = user.studyLanguage;
  const creditsOut = (tasksLeft(user.credits, 'writing') ?? 1) <= 0;

  const load = () => {
    todayApi
      .get(45)
      .then((data) => {
        setToday(data);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  };
  const retry = () => {
    setFailed(false);
    load();
  };
  useEffect(load, [language]);

  const next = today?.tasks.find((task) => !task.done) ?? today?.tasks[0];
  const copy = next ? taskText(next, t, (id) => titles.get(id)?.[locale] ?? id) : null;

  return (
    <div className="hub">
      <header className="hub__head">
        <h1>{t.practiceHub.title}</h1>
        <p>{t.practiceHub.subtitle}</p>
      </header>

      {failed ? (
        <ErrorState
          title={t.practiceHub.errorTitle}
          action={
            <Button variant="secondary" onClick={retry}>
              {t.practiceHub.retry}
            </Button>
          }
        />
      ) : !today ? (
        <Skeleton height={110} label={t.practiceHub.loading} />
      ) : (
        next &&
        copy && (
          <Card className="hub__top">
            <span className="hub__label">{t.practiceHub.topLabel}</span>
            <strong className="hub__top-title">{t.practiceHub.suggestion(copy.title, next.minutes)}</strong>
            <span className="hub__why">{copy.why}</span>
            <Button size="lg" onClick={() => navigate(fromToday(taskLink(next, language), next.minutes))}>
              {t.practiceHub.cta}
            </Button>
          </Card>
        )
      )}

      <div className="hub__grid">
        {cardsFor(language).map((card) => (
          <Card key={card.id} className="hub__card">
            <div className="hub__card-head">
              <h2>{t.practiceHub.cards[card.id]}</h2>
              <Tag tone={TONES[card.id]}>{t.practiceHub.cards[card.id]}</Tag>
            </div>
            {next && taskKind(next).kind === (card.id === 'vocabulary' ? 'vocab' : card.id) && <p className="hub__suggest">{copy?.title}</p>}
            <ul className="hub__list">
              {card.activities.map((activity) => {
                const ai = AI_ACTIVITIES.has(activity.id);
                return (
                  <li key={activity.id}>
                    <Link to={activity.route} className="hub__activity">
                      <span>{t.skills.activities[activity.id].title}</span>
                      {ai && <Tag tone="notice">{creditsOut ? t.practiceHub.needsCredits : t.practiceHub.aiTag}</Tag>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
};
