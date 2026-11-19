/**
 * DictationPage
 * Lesson picker (built-in or AI-generated), then the practice loop
 */
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, Banner, Button, Card, PageHeader, Segmented, TextInput } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { DICTATION_LESSONS, type DictationLesson } from '@/constants/dictations';
import { DIFFICULTIES, type Difficulty } from '@/constants/phrases';
import { generateDictationLesson } from '@/services/dictationGenerator';
import { dictationApi, type DictationMode, type DictationPassage } from '@/shared/dictationApi';
import { errorMessage } from '@/shared/http';
import { useProgress } from '@/shared/progress';
import { progressApi } from '@/shared/progressApi';
import { DictationPractice } from './DictationPractice';
import './dictation.css';

/** Color per difficulty level */
const LEVEL_TONES: Record<Difficulty, string> = { easy: 'success', medium: 'warning', hard: 'danger' };

/** Difficulty label of a level in the lesson picker */
const DIFFICULTY_OF: Record<DictationPassage['level'], Difficulty> = { A2: 'easy', B1: 'medium', B2: 'medium', C1: 'hard' };

/** Pre-v2 per-browser best scores, moved to the account once */
const LEGACY_SCORES_KEY = 'english-tool:dictation-scores';

/** Shared across mounts so StrictMode's double effect cannot import twice */
let legacyMigration: Promise<boolean> | null = null;

/**
 * Uploads best scores saved in localStorage before accounts existed, then removes them
 */
function migrateLegacyScores(record: ReturnType<typeof useProgress>['record']): Promise<boolean> {
  legacyMigration ??= runLegacyMigration(record);
  return legacyMigration;
}

async function runLegacyMigration(record: ReturnType<typeof useProgress>['record']): Promise<boolean> {
  let scores: Record<string, number>;
  try {
    const raw = localStorage.getItem(LEGACY_SCORES_KEY);
    if (!raw) return false;
    scores = JSON.parse(raw) as Record<string, number>;
  } catch {
    return false;
  }

  for (const [lessonId, percent] of Object.entries(scores)) {
    const lesson = DICTATION_LESSONS.find((l) => l.id === lessonId);
    if (!lesson || typeof percent !== 'number') continue;
    await record({ activity: 'dictation', contentRef: lessonId, title: lesson.title, score: percent, maxScore: 100, imported: true });
  }

  try {
    localStorage.removeItem(LEGACY_SCORES_KEY);
  } catch {
    // Ignore; migration runs again harmlessly next time only if removal failed
  }
  return true;
}

export const DictationPage: React.FC = () => {
  const { t } = useI18n();
  const { record } = useProgress();
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [active, setActive] = useState<{ lesson: DictationLesson; generated: boolean; note?: string } | null>(null);
  const [summary, setSummary] = useState<{ level: DictationPassage['level']; weak: number } | null>(null);
  const [best, setBest] = useState<Record<string, number>>({});
  const [topic, setTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isLoadingNext, setIsLoadingNext] = useState(false);
  const [params, setParams] = useSearchParams();
  const autoStarted = useRef(false);

  const loadBest = useCallback(() => {
    progressApi
      .best('dictation')
      .then(({ best: scores }) => setBest(scores))
      .catch(() => {});
  }, []);

  useEffect(() => {
    migrateLegacyScores(record).finally(loadBest);
  }, [record, loadBest]);

  // How many lessons are worth doing again; read again when a lesson ends and the picker comes back
  useEffect(() => {
    if (active) return;
    dictationApi
      .summary()
      .then(setSummary)
      .catch(() => {});
  }, [active]);

  /** A passage at the learner's level: one they have not done, or one to do again (under 80% the last time) */
  const start = useCallback(
    async (mode: DictationMode): Promise<void> => {
      setIsLoadingNext(true);
      setGenerateError(null);
      try {
        const passage = await dictationApi.next(mode);
        // The fixed lessons of the app are held here, not on the server
        const fixed = passage.origin === 'builtin' ? DICTATION_LESSONS.find((l) => l.id === passage.id) : undefined;
        const lesson: DictationLesson | undefined = fixed ?? (passage.sentences.length > 0 ? { id: passage.id, title: passage.title, difficulty: DIFFICULTY_OF[passage.level], sentences: passage.sentences } : undefined);
        if (!lesson) throw new Error(t.errors.generic);
        setActive({ lesson, generated: false, note: passage.reason === 'redo' ? t.dictation.redoNote(passage.previousPercent ?? 0) : undefined });
      } catch (error) {
        setGenerateError(errorMessage(error, t));
      } finally {
        setIsLoadingNext(false);
      }
    },
    [t]
  );

  // A step of the study plan opens a fresh passage straight away
  useEffect(() => {
    if (params.get('next') !== '1' || autoStarted.current) return;
    autoStarted.current = true;
    setParams({}, { replace: true });
    void start('auto');
  }, [params, setParams, start]);

  const handleGenerate = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!topic.trim() || isGenerating) return;

    setIsGenerating(true);
    setGenerateError(null);
    try {
      setActive({ lesson: await generateDictationLesson(topic.trim(), difficulty), generated: true });
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : t.errors.generic);
    } finally {
      setIsGenerating(false);
    }
  };

  if (active) {
    return (
      <DictationPractice
        key={active.lesson.id}
        lesson={active.lesson}
        isGenerated={active.generated}
        note={active.note}
        onExit={() => setActive(null)}
        onCompleted={loadBest}
      />
    );
  }

  const lessons = DICTATION_LESSONS.filter((lesson) => lesson.difficulty === difficulty);

  return (
    <div className="dict">
      <PageHeader eyebrow={t.nav.listening} title={t.dictation.title} description={t.dictation.description} />

      <Card padding="lg" tone="listening" className="dict-generator">
        <h2 className="dict-generator__title">{t.dictation.nextTitle}</h2>
        <p className="dict-generator__body">{t.dictation.nextBody}</p>
        <div className="dict-generator__form">
          <Button icon="chevronRight" loading={isLoadingNext} onClick={() => void start('new')}>
            {isLoadingNext ? t.dictation.nextLoading : t.dictation.nextStart}
          </Button>
          <Button variant="secondary" icon="swap" disabled={isLoadingNext || !summary || summary.weak === 0} onClick={() => void start('redo')}>
            {t.dictation.redoStart(summary?.weak ?? 0)}
          </Button>
          <Button variant="ghost" icon="sparkles" disabled={isLoadingNext} onClick={() => void start('auto')}>
            {t.dictation.mixStart}
          </Button>
        </div>
        {generateError && <Banner tone="danger">{generateError}</Banner>}
      </Card>

      <Segmented<Difficulty>
        label={t.dashboard.level}
        value={difficulty}
        onChange={setDifficulty}
        options={DIFFICULTIES.map((level) => ({ value: level, label: t.dictation.levels[level], tone: LEVEL_TONES[level] }))}
      />

      <div className="dict-lessons">
        {lessons.map((lesson, index) => (
          <button
            key={lesson.id}
            type="button"
            className="dict-lesson-btn reveal"
            style={{ ['--i' as string]: index }}
            onClick={() => setActive({ lesson, generated: false })}
          >
            <Card interactive tone="listening" className="dict-lesson">
              <h3 className="dict-lesson__title">{lesson.title}</h3>
              <p className="dict-lesson__meta">{t.dictation.sentences(lesson.sentences.length)}</p>
              {best[lesson.id] !== undefined && (
                <Badge tone={best[lesson.id] >= 80 ? 'success' : 'neutral'} icon="check">
                  {t.dictation.best(best[lesson.id])}
                </Badge>
              )}
            </Card>
          </button>
        ))}
      </div>

      <Card padding="lg" className="dict-generator">
        <h2 className="dict-generator__title">{t.dictation.generateTitle}</h2>
        <p className="dict-generator__body">{t.dictation.generateBody(t.dictation.levels[difficulty].toLowerCase())}</p>
        <form className="dict-generator__form" onSubmit={handleGenerate}>
          <TextInput
            aria-label={t.dictation.generateTitle}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder={t.dictation.generatePlaceholder}
            maxLength={100}
            disabled={isGenerating}
          />
          <Button type="submit" icon="sparkles" loading={isGenerating} disabled={!topic.trim()}>
            {isGenerating ? t.dictation.generating : t.dictation.generate}
          </Button>
        </form>
        {generateError && <Banner tone="danger">{generateError}</Banner>}
      </Card>
    </div>
  );
};
