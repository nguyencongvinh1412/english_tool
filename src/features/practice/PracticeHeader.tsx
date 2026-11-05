/**
 * PracticeHeader
 * The frame header of every practice activity: a close button that asks before leaving, the skill label, the
 * title, where the exercise came from ("From Today · 15 min") and a way back to Today.
 */
import type React from 'react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Badge, Button, Icon, Modal, Tag, type TagTone } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { useFocusMode } from './useFocusMode';
import { useFromToday } from './useFromToday';
import './practice.css';

const SKILL_BY_PREFIX: [string, 'listening' | 'reading' | 'speaking' | 'writing' | 'vocab'][] = [
  [ROUTES.VOCABULARY, 'vocab'],
  ['/japanese/vocab', 'vocab'],
  [ROUTES.LISTENING, 'listening'],
  [ROUTES.READING, 'reading'],
  [ROUTES.SPEAKING, 'speaking'],
  [ROUTES.WRITING, 'writing'],
  ['/japanese/dictation', 'listening'],
  ['/japanese/listening', 'listening'],
  ['/japanese/reading', 'reading'],
  ['/japanese/pronunciation', 'speaking'],
  ['/japanese/conversation', 'speaking'],
  ['/japanese/scenarios', 'speaking'],
  ['/japanese/writing', 'writing'],
];

/** Tag tone and name of the skill an exercise belongs to, from where it lives */
function useSkill(): { tone: TagTone; label: string } | null {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const skill = SKILL_BY_PREFIX.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1];
  return skill ? { tone: skill === 'vocab' ? 'neutral' : skill, label: t.today.kinds[skill] } : null;
}

export const PracticeHeader: React.FC<{ title: React.ReactNode; level: string | null; onBack: () => void; extra?: React.ReactNode }> = ({ title, level, onBack, extra }) => {
  const { t } = useI18n();
  const a = t.activity;
  const skill = useSkill();
  const { fromToday, minutes } = useFromToday();
  const [confirming, setConfirming] = useState(false);
  useFocusMode();

  return (
    <>
      <header className="activity-head">
        <button type="button" className="activity-head__close" aria-label={a.close} onClick={() => setConfirming(true)}>
          <Icon name="x" size={20} />
        </button>
        <div className="activity-head__text">
          <div className="activity-head__line">
            {skill && <Tag tone={skill.tone}>{skill.label}</Tag>}
            <h1 className="activity-head__title" lang={typeof title === 'string' ? 'en' : undefined}>
              {title}
            </h1>
            {level && <Badge tone="neutral">{level}</Badge>}
            {extra}
          </div>
          {fromToday && <p className="activity-head__from">{minutes ? a.fromTodayMinutes(minutes) : a.fromToday}</p>}
        </div>
        {fromToday && (
          <Link to={ROUTES.HOME} className="activity-head__today">
            {a.backToToday}
          </Link>
        )}
      </header>
      <Modal
        open={confirming}
        title={a.exitTitle}
        onClose={() => setConfirming(false)}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="ghost" onClick={onBack}>
              {a.leave}
            </Button>
            <Button onClick={() => setConfirming(false)}>{a.stay}</Button>
          </>
        }
      >
        <p>{a.exitBody}</p>
      </Modal>
    </>
  );
};
