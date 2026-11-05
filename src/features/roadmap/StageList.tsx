/**
 * StageList
 * The stages of a roadmap as cards. Only the current stage is open (progressive disclosure); with no progress
 * given (the preview), every stage shows its name, length and end date.
 */
import type React from 'react';
import { Link } from 'react-router-dom';
import { Card, ProgressBar, Tag } from '@/design';
import { ROUTES } from '@/app/routes';
import { useI18n } from '@/i18n/I18nProvider';
import { formatDay, type Stage, type StageProgress } from '@/shared/roadmapApi';
import { useStageName } from './useStageName';

interface Props {
  stages: Stage[];
  progress?: StageProgress[];
  current?: number;
}

export const StageList: React.FC<Props> = ({ stages, progress, current }) => {
  const { t } = useI18n();
  const name = useStageName();
  const r = t.roadmapPage;
  const kinds = t.today.kinds;

  return (
    <ol className="stages">
      {stages.map((stage) => {
        const p = progress?.find((x) => x.index === stage.index);
        const done = (p?.progress ?? 0) >= 1;
        const open = current === stage.index;
        const state = done ? r.stageDone : open ? r.stageNow : r.stageNext;
        return (
          <li key={stage.index}>
            <Card padding="md" className={`stage ${open ? 'stage--open' : ''} ${progress && !open && !done ? 'stage--later' : ''}`}>
              <div className="stage__head">
                <strong>{name(stage)}</strong>
                {progress && <Tag tone={open ? 'brand' : 'neutral'}>{(done ? '✓ ' : '') + state}</Tag>}
              </div>
              <p className="stage__meta">
                {t.roadmapNew.stage.weeks(stage.weeks)} · {r.endsAround(formatDay(stage.endDate))}
              </p>
              {p && <ProgressBar value={p.progress * 100} label={name(stage)} size="sm" />}
              {p && (
                <Link to={`${ROUTES.ROADMAP_STAGE}/${stage.index}`} className="stage__more">
                  {r.detail.open} ›
                </Link>
              )}
              {open && p && (
                <ul className="stage__goals">
                  {stage.objectives.vocabMastered > 0 && (
                    <li>
                      <span>{r.objectives.vocab}</span>
                      <strong>
                        {p.vocab.have} / {p.vocab.goal}
                      </strong>
                    </li>
                  )}
                  {stage.objectives.grammarGood > 0 && (
                    <li>
                      <span>{r.objectives.grammar}</span>
                      <strong>
                        {p.grammar.have} / {p.grammar.goal}
                      </strong>
                    </li>
                  )}
                  {p.sessions.map((s) => (
                    <li key={s.skill}>
                      <span>{r.objectives.sessions(kinds[s.skill as keyof typeof kinds])}</span>
                      <strong>
                        {s.have} / {s.goal}
                      </strong>
                    </li>
                  ))}
                  {p.mockTests.goal > 0 && (
                    <li>
                      <span>{r.objectives.mock}</span>
                      <strong>
                        {p.mockTests.have} / {p.mockTests.goal}
                      </strong>
                    </li>
                  )}
                </ul>
              )}
            </Card>
          </li>
        );
      })}
    </ol>
  );
};
