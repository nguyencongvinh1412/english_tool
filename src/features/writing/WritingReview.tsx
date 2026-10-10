/**
 * WritingReview
 * Writing task card and the corrected response with an improved version, shared by practice and IELTS tests
 */
import type React from 'react';
import { useMemo } from 'react';
import { Card, Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { InlineMarkdown } from '@/shared/InlineMarkdown';
import type { WritingFeedback, WritingPrompt } from '@/shared/contentApi';
import { ChartView } from './ChartView';
import './writing.css';

/**
 * The learner's response with each corrected phrase highlighted
 */
const AnnotatedResponse: React.FC<{ text: string; corrections: WritingFeedback['corrections'] }> = ({ text, corrections }) => {
  const parts = useMemo(() => {
    const found = corrections
      .map((c, index) => ({ ...c, index, at: text.indexOf(c.original) }))
      .filter((c) => c.at >= 0 && c.original.length > 0)
      .sort((a, b) => a.at - b.at);

    const out: React.ReactNode[] = [];
    let cursor = 0;
    for (const c of found) {
      if (c.at < cursor) continue; // overlapping correction; skip
      out.push(text.slice(cursor, c.at));
      out.push(
        <mark key={c.index} className="annot" title={`${c.corrected}: ${c.explanation}`}>
          {c.original}
          <sup>{c.index + 1}</sup>
        </mark>
      );
      cursor = c.at + c.original.length;
    }
    out.push(text.slice(cursor));
    return out;
  }, [text, corrections]);

  return (
    <p className="annotated" lang="en">
      {parts}
    </p>
  );
};

/**
 * Task card: question or email, chart, instructions
 */
export const WritingPromptCard: React.FC<{ task: WritingPrompt }> = ({ task }) => {
  const { t } = useI18n();
  return (
    <Card padding="lg" tone="writing" className="w-prompt">
      <p className="w-prompt__meta">
        {t.writing.tasks[task.taskType]} · {t.writing.minWords(task.minWords)} · {t.writing.timeLimit(task.timeMinutes)}
      </p>
      {task.email ? (
        <div className="w-email" lang="en">
          <p>
            <strong>{t.writing.from}:</strong> {task.email.from}
          </p>
          <p>
            <strong>{t.writing.subject}:</strong> {task.email.subject}
          </p>
          <p className="w-email__body">{task.email.body}</p>
        </div>
      ) : (
        <p className="w-prompt__question" lang="en">
          {task.prompt}
        </p>
      )}
      {task.chart && <ChartView chart={task.chart} />}
      <p className="w-prompt__instructions" lang="en">
        {task.instructions}
      </p>
    </Card>
  );
};

/**
 * Annotated response, list of corrections and the improved version
 */
export const WritingReview: React.FC<{ response: string; feedback: WritingFeedback }> = ({ response, feedback }) => {
  const { t } = useI18n();
  return (
    <>
      <Card padding="lg">
        <h2 className="w-section-title">{t.writing.yourResponse}</h2>
        <AnnotatedResponse text={response} corrections={feedback.corrections} />
        {feedback.corrections.length > 0 && (
          <>
            <h3 className="w-section-title w-section-title--sm">{t.writing.corrections}</h3>
            <ol className="corrections">
              {feedback.corrections.map((c, index) => (
                <li key={index}>
                  <span className="corrections__from" lang="en">
                    {c.original}
                  </span>
                  <Icon name="chevronRight" size={16} />
                  <span className="corrections__to" lang="en">
                    {c.corrected}
                  </span>
                  <p className="corrections__why">
                    <InlineMarkdown text={c.explanation} />
                  </p>
                </li>
              ))}
            </ol>
          </>
        )}
      </Card>

      <Card padding="lg">
        <h2 className="w-section-title">{t.writing.improvedVersion}</h2>
        <p className="improved" lang="en">
          {feedback.improvedVersion}
        </p>
      </Card>
    </>
  );
};
