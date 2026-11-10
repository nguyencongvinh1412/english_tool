/**
 * One skill of a gate: its status, band and the buttons that fit
 */
import type React from 'react';
import { Button, Tag } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { formatBand, type GateSkill } from '@/shared/ieltsPathApi';

const statusTone = (status: GateSkill['status']) => (status === 'done' ? 'brand' : status === 'failed' ? 'hard' : status === 'skipped' ? 'neutral' : 'notice');

export const SkillRow: React.FC<{ skill: GateSkill; finished: boolean; busy: boolean; onStart: () => void; onSkip: (skipped: boolean) => void; onOpen: () => void }> = ({ skill, finished, busy, onStart, onSkip, onOpen }) => {
  const { t } = useI18n();
  const p = t.ieltsPath;
  const name = t.ielts.components[skill.skill];
  return (
    <li className="ipath__skill">
      <div className="ipath__skill-main">
        <strong>{name}</strong>
        <span className="create__muted">
          {skill.optional ? p.optional : p.required} · {t.ieltsPath.minutes(skill.minutes)}
        </span>
      </div>
      <div className="ipath__skill-state">
        <Tag tone={statusTone(skill.status)}>{(skill.status === 'done' ? '✓ ' : '') + (p.status[skill.status] ?? skill.status)}</Tag>
        {skill.band !== null && <strong className="ipath__band">{formatBand(skill.band)}</strong>}
      </div>
      <div className="ipath__skill-actions">
        {!finished && skill.status === 'todo' && (
          <>
            <Button size="sm" onClick={onStart} disabled={busy}>
              {p.start}
            </Button>
            {skill.optional && (
              <Button size="sm" variant="ghost" onClick={() => onSkip(true)} disabled={busy}>
                {p.skip}
              </Button>
            )}
          </>
        )}
        {!finished && skill.status === 'in_progress' && (
          <Button size="sm" onClick={onOpen}>
            {p.resume}
          </Button>
        )}
        {(skill.status === 'grading' || skill.status === 'failed' || skill.status === 'done') && (
          <Button size="sm" variant="secondary" onClick={onOpen}>
            {p.seeResult}
          </Button>
        )}
        {!finished && skill.status === 'skipped' && (
          <Button size="sm" variant="ghost" onClick={() => onSkip(false)} disabled={busy}>
            {p.unskip}
          </Button>
        )}
      </div>
    </li>
  );
};

