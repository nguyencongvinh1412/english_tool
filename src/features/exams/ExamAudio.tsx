/**
 * ExamAudio
 * The audio player card of a listening question: a play button, what it is doing ("Playing", "Played") and how far it
 * is. In test modes the clip plays once, as in the real test, and starts only when the learner presses play.
 */
import type React from 'react';
import { Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';

export const ExamAudio: React.FC<{
  playing: boolean;
  /** Already played in a test mode: locked */
  locked: boolean;
  /** 0-1, or null when the length is unknown (a recording) */
  progress: number | null;
  playOnce: boolean;
  onPlay: () => void;
  onStop?: () => void;
}> = ({ playing, locked, progress, playOnce, onPlay, onStop }) => {
  const { t } = useI18n();
  const state = playing ? t.exams.playing : locked ? t.exams.played : t.exams.playAudio;
  return (
    <div className="exam-audio-card">
      <button
        type="button"
        className="exam-audio-card__play"
        onClick={playing && !playOnce ? onStop : onPlay}
        disabled={locked || (playing && playOnce)}
        aria-label={playing && !playOnce ? t.exams.stopAudio : t.exams.playAudio}
      >
        <Icon name={playing && !playOnce ? 'x' : 'headphones'} size={22} />
      </button>
      <div className="exam-audio-card__body">
        <div className="exam-audio-card__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress ?? 0) * 100)} aria-label={state}>
          <div
            className={`exam-audio-card__bar ${playing && progress === null ? 'exam-audio-card__bar--busy' : ''}`}
            style={{ width: `${Math.round((locked && !playing ? 1 : (progress ?? 0)) * 100)}%` }}
          />
        </div>
        <span className="exam-audio-card__state" aria-live="polite">
          {state}
        </span>
      </div>
      {playOnce && <span className="exam-audio-card__once">{t.exams.playOnceShort}</span>}
    </div>
  );
};
