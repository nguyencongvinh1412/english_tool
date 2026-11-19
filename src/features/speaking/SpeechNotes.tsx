/**
 * SpeechNotes
 * What the speech check heard: pronunciation level, mispronounced words with a tip, and fluency numbers
 */
import type React from 'react';
import { Badge, Banner, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import type { PronunciationLevel, SpeechAssessment } from '@/shared/speechApi';
import './speaking.css';

const LEVEL_TONE: Record<PronunciationLevel, 'success' | 'warning' | 'danger'> = { good: 'success', fair: 'warning', needs_work: 'danger' };

interface Props {
  assessment: SpeechAssessment | null;
  /** A take is still being checked */
  checking?: boolean;
  /** Hide the fluency row (read-aloud practice) */
  hideFluency?: boolean;
}

export const SpeechNotes: React.FC<Props> = ({ assessment, checking = false, hideFluency = false }) => {
  const { t } = useI18n();
  const copy = t.speechCheck;

  if (!assessment) {
    return checking ? (
      <div className="speech-notes speech-notes--checking">
        <Spinner size={16} /> {copy.checking}
      </div>
    ) : null;
  }

  const level = assessment.overall?.pronunciation;
  const fluency = hideFluency ? undefined : assessment.fluency;

  return (
    <div className="speech-notes">
      <div className="speech-notes__head">
        <span className="speech-notes__title">{copy.pronunciation}</span>
        {level && <Badge tone={LEVEL_TONE[level]}>{copy.levels[level]}</Badge>}
        {checking && <Spinner size={14} label={copy.checking} />}
      </div>

      {fluency && (
        <ul className="speech-notes__stats">
          <li>{copy.wpm(fluency.wpm)}</li>
          <li>{copy.pauses(fluency.longPauses)}</li>
          <li>{copy.fillers(fluency.fillers)}</li>
        </ul>
      )}

      {assessment.issues.length ? (
        <ul className="speech-notes__issues">
          {assessment.issues.map((issue) => (
            <li key={issue.word}>
              <span className="speech-notes__word" lang="en">
                {issue.word}
              </span>
              {issue.heardAs && (
                <span className="speech-notes__heard">
                  {copy.heardAs} <em lang="en">{issue.heardAs}</em>
                </span>
              )}
              {issue.sound && <code className="speech-notes__sound">{issue.sound}</code>}
              {issue.tip && <p className="speech-notes__tip">{issue.tip}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="speech-notes__none">{copy.noIssues}</p>
      )}

      {assessment.accuracy === 'basic' && <Banner tone="info">{copy.basic}</Banner>}
      <p className="speech-notes__note">{copy.aiNote}</p>
    </div>
  );
};
