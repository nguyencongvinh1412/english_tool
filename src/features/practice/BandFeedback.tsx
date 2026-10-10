/**
 * BandFeedback
 * Overall band ring, per-criterion bars, strengths and improvements
 */
import type React from 'react';
import { Card, Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { InlineMarkdown } from '@/shared/InlineMarkdown';
import type { BandFeedback as BandFeedbackData } from '@/shared/contentApi';
import './practice.css';

const MAX_BAND = 9;

export const BandFeedback: React.FC<{ feedback: BandFeedbackData; tone: string; note: string }> = ({ feedback, tone, note }) => {
  const { t } = useI18n();

  return (
    <Card padding="lg" className="band reveal" style={{ ['--skill' as string]: `var(--${tone})` }}>
      <div className="band__top">
        <div className="band__ring" style={{ ['--pct' as string]: (feedback.overallBand / MAX_BAND) * 100 }}>
          <span>{feedback.overallBand.toFixed(1)}</span>
        </div>
        <div>
          <p className="band__label">{t.feedback.overall}</p>
          <p className="band__note">{note}</p>
        </div>
      </div>

      <ul className="band__criteria" aria-label={t.feedback.criteria}>
        {feedback.criteria.map((criterion) => (
          <li key={criterion.key} className="band-criterion">
            <div className="band-criterion__head">
              <span className="band-criterion__name">
                <abbr title={criterion.name}>{criterion.key}</abbr> · {criterion.name}
              </span>
              <span className="band-criterion__band">{criterion.band.toFixed(1)}</span>
            </div>
            <span className="band-criterion__track">
              <span className="band-criterion__bar" style={{ width: `${(criterion.band / MAX_BAND) * 100}%` }} />
            </span>
            <p className="band-criterion__comment">
              <InlineMarkdown text={criterion.comment} />
            </p>
          </li>
        ))}
      </ul>

      <div className="band__lists">
        <div>
          <h3 className="band__list-title band__list-title--good">
            <Icon name="check" size={18} /> {t.feedback.strengths}
          </h3>
          <ul className="band__list">
            {feedback.strengths.map((item, i) => (
              <li key={i}>
                <InlineMarkdown text={item} />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="band__list-title band__list-title--fix">
            <Icon name="sparkles" size={18} /> {t.feedback.improvements}
          </h3>
          <ul className="band__list">
            {feedback.improvements.map((item, i) => (
              <li key={i}>
                <InlineMarkdown text={item} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
};
