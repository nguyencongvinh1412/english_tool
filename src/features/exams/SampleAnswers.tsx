/**
 * SampleAnswers
 * The sample answers of the source book under a graded Writing task: a candidate's answer with its band and the
 * examiner's comment (or an examiner's model answer). Closed until opened, so the learner reads them on purpose.
 */
import type React from "react";
import { Card } from "@/design";
import { useI18n } from "@/i18n/I18nProvider";
import type { WritingPrompt } from "@/shared/contentApi";

export const SampleAnswers: React.FC<{ samples: WritingPrompt["samples"] }> = ({
  samples,
}) => {
  const { t } = useI18n();
  const s = t.ielts.sampleAnswers;
  if (!samples || samples.length === 0) return null;
  return (
    <Card padding="lg" className="ielts-samples">
      <h3>{s.title}</h3>
      <p className="ielts-samples__intro">{s.intro}</p>
      {samples.map((sample, i) => (
        <details key={i} className="ielts-samples__item">
          <summary>
            {sample.by === "examiner" || sample.band === undefined
              ? s.examiner
              : s.band(sample.band.toFixed(1))}
          </summary>
          <div lang="en" className="ielts-samples__text">
            {sample.text.split("\n\n").map((paragraph, n) => (
              <p key={n}>{paragraph}</p>
            ))}
          </div>
          {sample.comment && (
            <>
              <h4>{s.comment}</h4>
              <p className="ielts-samples__comment" lang="en">
                {sample.comment}
              </p>
            </>
          )}
        </details>
      ))}
    </Card>
  );
};
