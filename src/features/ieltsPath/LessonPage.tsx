/**
 * LessonPage
 * One IELTS path lesson: what you can do afterwards, the teaching sections, annotated examples, useful phrases and a
 * short self-check. Finishing it ticks the step on Today; the exercise that follows is its own step.
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Banner, Button, Card, Icon, Segmented, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { errorMessage } from '@/shared/http';
import { ieltsPathApi, type LessonView } from '@/shared/ieltsPathApi';
import { PracticeHeader } from '@/features/practice/PracticeHeader';
import { ChoiceDrill, OrderDrill, Prose } from '@/features/learn/UnitPage';
import '@/features/writing/writing.css';
import '@/features/learn/learn.css';
import './ieltsPath.css';

type Lang = 'en' | 'vi';

/** Remounts per step, so each lesson starts from a clean state */
export const LessonPage: React.FC = () => {
  const { stepId = '' } = useParams();
  return <Lesson key={stepId} stepId={stepId} />;
};

const Lesson: React.FC<{ stepId: string }> = ({ stepId }) => {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const p = t.ieltsPath;
  const [view, setView] = useState<LessonView | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [lang, setLang] = useState<Lang>(locale);
  const [answers, setAnswers] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ieltsPathApi
      .lesson(stepId)
      .then((data) => !cancelled && setView(data))
      .catch((error) => !cancelled && setLoadError(error));
    return () => {
      cancelled = true;
    };
  }, [stepId]);

  if (loadError) return <Banner tone="danger">{errorMessage(loadError, t) || p.lesson.loadError}</Banner>;
  if (!view) return <Spinner size={28} label={t.common.loading} />;

  const { content, step } = view;
  const say = (text: { en: string; vi: string }) => text[lang];
  const answeredAll = Object.keys(answers).length === content.drills.length;
  const correct = Object.values(answers).filter(Boolean).length;
  const skill = step.block === 'vocab-grammar' ? 'reading' : step.block;

  const finish = async () => {
    setSaving(true);
    setSaveError(false);
    try {
      await ieltsPathApi.completeLesson(step.id, content.drills.length > 0 && answeredAll ? { correct, total: content.drills.length } : null);
      navigate(ROUTES.HOME);
    } catch {
      setSaveError(true);
      setSaving(false);
    }
  };

  return (
    <div className="practice unit" style={{ ['--skill' as string]: `var(--${skill})` }}>
      <PracticeHeader title={view.title[locale]} level={null} onBack={() => navigate(ROUTES.HOME)} />

      <div className="unit__bar">
        <span className="unit__count">{p.study.position(step.phase, step.week, step.day)}</span>
        <Segmented<Lang>
          label={p.lesson.explainIn}
          value={lang}
          onChange={setLang}
          options={[
            { value: 'vi', label: 'VI' },
            { value: 'en', label: 'EN' },
          ]}
        />
      </div>

      <Card padding="lg" tone={skill} className="unit__objectives">
        <h2 className="w-section-title">{p.lesson.objectives}</h2>
        <ul>
          {content.objectives.map((o, i) => (
            <li key={i}>
              <Icon name="target" size={16} /> {say(o)}
            </li>
          ))}
        </ul>
      </Card>

      {content.learn.map((section, i) => (
        <Card key={i} padding="lg" className="unit__section">
          <h2 className="w-section-title">{say(section.heading)}</h2>
          <Prose text={say(section.body)} />
        </Card>
      ))}

      <Card padding="lg" className="unit__section">
        <h2 className="w-section-title">{p.lesson.examples}</h2>
        {content.examples.map((example, i) => (
          <div key={i} className="model-email__part">
            <span className="model-email__label">{say(example.title)}</span>
            <p className="model-email__text ipath__example" lang="en">
              {example.text}
            </p>
            <p className="model-email__note">
              <Icon name="sparkles" size={14} /> {say(example.note)}
            </p>
          </div>
        ))}
      </Card>

      {content.phrases.length > 0 && (
        <Card padding="lg" className="unit__section">
          <h2 className="w-section-title">{p.lesson.phrases}</h2>
          <div className="phrase-groups">
            {content.phrases.map((group, i) => (
              <div key={i} className="phrase-group">
                <h3>{say(group.use)}</h3>
                <ul lang="en">
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card padding="lg" className="unit__section">
        <h2 className="w-section-title">{p.lesson.check}</h2>
        <p className="create__muted">{p.lesson.checkHint}</p>
        {content.drills.map((drill, index) => (
          <div key={index} className="drill">
            <p className="drill__prompt">
              <strong>
                {index + 1}. {say(drill.prompt)}
              </strong>
            </p>
            {drill.type === 'choice' ? (
              <ChoiceDrill drill={drill} lang={lang} onAnswer={(ok) => setAnswers((current) => ({ ...current, [index]: ok }))} />
            ) : (
              <OrderDrill drill={drill} lang={lang} onAnswer={(ok) => setAnswers((current) => ({ ...current, [index]: ok }))} />
            )}
          </div>
        ))}
        {answeredAll && <p className="drill__verdict drill__verdict--right">{p.lesson.score(correct, content.drills.length)}</p>}
      </Card>

      {saveError && <Banner tone="warning">{p.lesson.error}</Banner>}
      <div className="practice__actions unit__nav">
        <Button size="lg" icon="check" onClick={() => void finish()} disabled={!answeredAll && !step.done} loading={saving}>
          {saving ? p.lesson.saving : step.done ? p.lesson.finished : p.lesson.finish}
        </Button>
      </div>
    </div>
  );
};
