/**
 * DictationPage Component
 * Listening and typing practice, inspired by DailyDictation:
 * pick a lesson (built-in or AI-generated), then listen and type each sentence
 */

import type React from 'react';
import { useState, useCallback } from 'react';
import { DictationPractice } from '@/components/DictationPractice';
import { DICTATION_LESSONS, type DictationLesson } from '@/constants/dictations';
import { DIFFICULTIES, type Difficulty } from '@/constants/phrases';
import { generateDictationLesson } from '@/services/dictationGenerator';

/** localStorage key for best scores per lesson */
const SCORES_STORAGE_KEY = 'english-tool:dictation-scores';

/** Best score (0-100) per lesson ID */
type LessonScores = Record<string, number>;

/**
 * Load best scores from localStorage
 * @returns Saved scores, or an empty object if unavailable
 */
function loadScores(): LessonScores {
  try {
    const raw = localStorage.getItem(SCORES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LessonScores) : {};
  } catch {
    return {};
  }
}

/**
 * Save best scores to localStorage
 * @param scores - Scores to save
 */
function saveScores(scores: LessonScores): void {
  try {
    localStorage.setItem(SCORES_STORAGE_KEY, JSON.stringify(scores));
  } catch {
    // Storage unavailable - scores only last for this session
  }
}

/**
 * Dictation practice page
 * Shows the lesson picker, or the practice view once a lesson is selected
 *
 * @returns DictationPage JSX element
 */
export const DictationPage: React.FC = () => {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [activeLesson, setActiveLesson] = useState<DictationLesson | null>(null);
  const [scores, setScores] = useState<LessonScores>(loadScores);
  const [topic, setTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const lessons = DICTATION_LESSONS.filter((lesson) => lesson.difficulty === difficulty);

  /** Record the best score for a finished lesson */
  const handleComplete = useCallback((lessonId: string, score: number) => {
    // AI lessons are one-off, so their scores are not kept
    if (lessonId.startsWith('ai-')) return;

    setScores((prev) => {
      const next = { ...prev, [lessonId]: Math.max(prev[lessonId] ?? 0, score) };
      saveScores(next);
      return next;
    });
  }, []);

  /** Generate a new lesson with AI and start it */
  const handleGenerate = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!topic.trim() || isGenerating) return;

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const lesson = await generateDictationLesson(topic.trim(), difficulty);
      setActiveLesson(lesson);
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : 'Failed to generate lesson');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="page dictation-page">
      <header className="page-header">
        <h1 className="page-title">Dictation Practice</h1>
        <p className="page-description">
          Listen to each sentence and type exactly what you hear. Improve your listening,
          spelling, and typing at the same time.
        </p>
      </header>

      {activeLesson ? (
        <DictationPractice
          key={activeLesson.id}
          lesson={activeLesson}
          onComplete={handleComplete}
          onExit={() => setActiveLesson(null)}
        />
      ) : (
        <>
          <section className="difficulty-selector">
            {DIFFICULTIES.map((level) => (
              <button
                key={level}
                type="button"
                className={`difficulty-selector__btn ${
                  difficulty === level ? 'difficulty-selector__btn--active' : ''
                } difficulty-selector__btn--${level}`}
                onClick={() => setDifficulty(level)}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </section>

          <section className="dictation-lessons">
            {lessons.map((lesson) => (
              <button
                key={lesson.id}
                type="button"
                className="dictation-lesson-card"
                onClick={() => setActiveLesson(lesson)}
              >
                <h3 className="card-title">{lesson.title}</h3>
                <p className="card-description">{lesson.sentences.length} sentences</p>
                {scores[lesson.id] !== undefined && (
                  <span className="dictation-lesson-card__score">Best: {scores[lesson.id]}%</span>
                )}
              </button>
            ))}
          </section>

          <section className="dictation-generator">
            <h2 className="section-title">Generate a lesson with AI</h2>
            <p className="card-description">
              Enter any topic and the AI will write a passage at {difficulty} level for you to
              practice.
            </p>
            <form className="dictation-generator__form" onSubmit={handleGenerate}>
              <input
                type="text"
                className="dictation-generator__input"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="e.g. ordering food, a job interview, space travel"
                maxLength={100}
                disabled={isGenerating}
              />
              <button
                type="submit"
                className="action-btn"
                disabled={!topic.trim() || isGenerating}
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            </form>
            {generateError && (
              <div className="chat-error">
                <span className="chat-error__message">{generateError}</span>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
