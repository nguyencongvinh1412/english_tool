/**
 * Japanese speaking: pronunciation drills, AI conversation (polite or casual) and role-play scenarios
 */
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Banner, Button, Card, EmptyState, Icon, PageHeader, Segmented, Select, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useClaude, useSpeechRecognition } from '@/hooks';
import { useProgress } from '@/shared/progress';
import { speakOnce } from '@/shared/speech';
import { InlineMarkdown } from '@/shared/InlineMarkdown';
import { JaText } from '@/shared/ja/JaText';
import { matchJapanese, normalizeJapanese, plainText, readingText } from '@/shared/ja/text';
import { JLPT_CONTENT_LEVELS, type JlptLevel } from '@/shared/contentApi';
import { ChatPanel } from '@/features/speaking/ChatPanel';
import { RecordButton } from '@/features/speaking/RecordButton';
import { useSessionRecorder } from '@/features/speaking/useSessionRecorder';
import '@/features/speaking/speaking.css';
import { JA_PHRASES, JA_SCENARIOS, JA_TOPICS, type JaPhrase, type JaScenario } from './jaSpeaking';
import { useJaLevel } from './useJaPractice';
import './japanese.css';

/** Phrases are offered up to N3; harder levels practise the N3 set */
const PHRASE_LEVELS: JlptLevel[] = ['N5', 'N4', 'N3'];

/**
 * Share of the target heard, by sound: the transcript may write the same sounds with other kanji,
 * so both the written form and the reading count
 */
function similarity(target: string, heard: string): number {
  const said = normalizeJapanese(heard);
  const lcs = (a: string, b: string) => {
    const row = new Array<number>(b.length + 1).fill(0);
    for (const ca of a) {
      let previous = 0;
      for (let j = 1; j <= b.length; j++) {
        const current = row[j];
        row[j] = ca === b[j - 1] ? previous + 1 : Math.max(row[j], row[j - 1]);
        previous = current;
      }
    }
    return row[b.length];
  };
  const forms = [normalizeJapanese(plainText(target)), normalizeJapanese(readingText(target))];
  return Math.round(Math.max(...forms.map((form) => (form.length ? (lcs(said, form) / form.length) * 100 : 0))));
}

/* ---------- Pronunciation ---------- */

export const JaPronunciationPage: React.FC = () => {
  const { t, locale } = useI18n();
  const { level: goal, furigana } = useJaLevel();
  const { record } = useProgress();
  const [level, setLevel] = useState<JlptLevel>(PHRASE_LEVELS.includes(goal) ? goal : 'N3');
  const [phrase, setPhrase] = useState<JaPhrase | null>(null);
  const [askedCoach, setAskedCoach] = useState(false);
  const { isListening, transcript, interimTranscript, error: speechError, isSupported, startListening, stopListening, resetTranscript } =
    useSpeechRecognition('ja');
  const coachContext = useMemo(() => ({ mode: 'ja-pronunciation' as const }), []);
  const { messages, isLoading, error: aiError, sendUserMessage, clearMessages } = useClaude({ context: coachContext });
  const coachReply = [...messages].reverse().find((m) => m.role === 'assistant')?.content ?? null;

  const pick = (nextLevel = level) => {
    const pool = JA_PHRASES.filter((p) => p.level === nextLevel && p !== phrase);
    setPhrase(pool[Math.floor(Math.random() * pool.length)] ?? null);
    setAskedCoach(false);
    resetTranscript();
    clearMessages();
  };

  // Scored once recording has stopped and a transcript arrived
  const heard = !isListening ? transcript : '';
  const score = useMemo(() => (phrase && heard ? similarity(phrase.text, heard) : null), [phrase, heard]);
  const recorded = useRef<string | null>(null);

  useEffect(() => {
    if (score === null || !phrase) return;
    const key = `${phrase.text}:${heard}`;
    if (recorded.current === key) return;
    recorded.current = key;
    const title = plainText(phrase.text);
    void record({ activity: 'pronunciation', language: 'ja', contentRef: title, title, score, maxScore: 100 }).catch(() => {});
  }, [score, phrase, heard, record]);

  const units = phrase && heard ? matchJapanese(phrase.text, heard).units : [];

  const askCoach = () => {
    if (!phrase) return;
    setAskedCoach(true);
    void sendUserMessage(`Target: ${plainText(phrase.text)} (${readingText(phrase.text)})\nHeard: ${heard}\nMatch: ${score}%`);
  };

  return (
    <div className="speak">
      <PageHeader eyebrow="日本語" title={t.skills.activities.jaPronunciation.title} description={t.jaPractice.pronunciationIntro} />
      {!isSupported && <Banner tone="danger">{t.pronunciation.unsupported}</Banner>}

      <div className="speak-toolbar">
        <Segmented<JlptLevel>
          label={t.dashboard.level}
          value={level}
          onChange={(next) => {
            setLevel(next);
            pick(next);
          }}
          options={PHRASE_LEVELS.map((l) => ({ value: l, label: l, tone: 'speaking' }))}
        />
        <Button icon={phrase ? 'chevronRight' : 'sparkles'} onClick={() => pick()} disabled={isListening}>
          {phrase ? t.pronunciation.nextPhrase : t.pronunciation.getPhrase}
        </Button>
      </div>

      {!phrase ? (
        <EmptyState icon="mic" title={t.pronunciation.emptyTitle}>
          {t.pronunciation.emptyBody}
        </EmptyState>
      ) : (
        <>
          <Card padding="lg" tone="speaking" className="phrase-card reveal" key={phrase.text}>
            <div className="phrase-card__meta">
              <Badge tone="speaking">{phrase.level}</Badge>
            </div>
            <p className="phrase-card__text ja-phrase">
              <JaText text={phrase.text} defaultMode={furigana} />
            </p>
            <p className="phrase-card__category">{phrase.translation[locale]}</p>
            <Button variant="secondary" size="sm" icon="headphones" onClick={() => speakOnce(phrase.text, 0.85)}>
              {t.pronunciation.listen}
            </Button>
          </Card>

          {isSupported && (
            <div className="speak-recorder">
              <RecordButton
                isRecording={isListening}
                onStart={() => {
                  resetTranscript();
                  setAskedCoach(false);
                  clearMessages();
                  startListening();
                }}
                onStop={stopListening}
                startLabel={t.pronunciation.record}
                stopLabel={t.pronunciation.stop}
              />
              {(isListening || transcript) && (
                <p className="speak-live" aria-live="polite">
                  <span className="speak-live__label">{t.pronunciation.youSaid}</span>
                  <span lang="ja">
                    {transcript}
                    {interimTranscript && <span className="speak-live__interim"> {interimTranscript}</span>}
                  </span>
                </p>
              )}
            </div>
          )}
          {speechError && <Banner tone="danger">{speechError}</Banner>}

          {score !== null && (
            <Card padding="lg" className="score-card reveal">
              <div className="score-card__top">
                <div className="score-ring" style={{ ['--pct' as string]: score }}>
                  <span>{score}%</span>
                </div>
                <div>
                  <p className="score-card__label">{t.pronunciation.accuracy}</p>
                  <p className="score-card__feedback">
                    {score >= 90 ? t.pronunciation.feedback.excellent : score >= 70 ? t.pronunciation.feedback.good : score >= 50 ? t.pronunciation.feedback.fair : t.pronunciation.feedback.low}
                  </p>
                </div>
              </div>
              <p className="score-card__label">{t.jaPractice.soundCheck}</p>
              <p className="ja-units" lang="ja">
                {units.map((unit, index) => (
                  <span key={index} className={`ja-unit ${unit.ok ? 'ja-unit--ok' : 'ja-unit--miss'}`}>
                    {unit.reading ? (
                      <ruby>
                        {unit.text}
                        <rt>{unit.reading}</rt>
                      </ruby>
                    ) : (
                      unit.text
                    )}
                  </span>
                ))}
              </p>
              {!askedCoach ? (
                <Button variant="secondary" icon="sparkles" onClick={askCoach} disabled={isLoading}>
                  {t.pronunciation.aiFeedback}
                </Button>
              ) : (
                <div className="coach">
                  <p className="coach__title">
                    <Icon name="sparkles" size={18} /> {t.pronunciation.aiCoach}
                  </p>
                  {isLoading ? (
                    <p className="coach__loading">
                      <Spinner size={18} /> {t.pronunciation.analyzing}
                    </p>
                  ) : (
                    coachReply && (
                      <p className="coach__body">
                        <InlineMarkdown text={coachReply} japanese />
                      </p>
                    )
                  )}
                  {aiError && <Banner tone="danger">{aiError}</Banner>}
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
};

/* ---------- Conversation ---------- */

export const JaConversationPage: React.FC = () => {
  const { t, locale } = useI18n();
  const { level: goal } = useJaLevel();
  const [topic, setTopic] = useState(JA_TOPICS[0].value);
  const [politeness, setPoliteness] = useState<'polite' | 'casual'>('polite');
  const [level, setLevel] = useState<JlptLevel>(goal);
  const [session, setSession] = useState(0);
  const context = useMemo(
    () => ({ mode: 'ja-conversation' as const, topic: topic === 'free conversation' ? undefined : topic, politeness, level }),
    [topic, politeness, level]
  );
  const { messages, isLoading, error, sendUserMessage, clearMessages } = useClaude({ context });

  useSessionRecorder(messages, { key: `${topic}:${politeness}:${session}`, activity: 'conversation', contentRef: `ja:${topic}`, title: `日本語 · ${topic}` });

  const restart = () => {
    setSession((n) => n + 1);
    clearMessages();
  };

  return (
    <div className="speak">
      <PageHeader eyebrow="日本語" title={t.skills.activities.jaConversation.title} description={t.jaPractice.conversationIntro} />
      <div className="speak-toolbar ja-chat-toolbar">
        <label className="ja-chat-toolbar__field">
          <span>{t.chat.topic}</span>
          <Select
            value={topic}
            onChange={(event) => {
              setTopic(event.target.value);
              restart();
            }}
          >
            {JA_TOPICS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label[locale]}
              </option>
            ))}
          </Select>
        </label>
        <Segmented<'polite' | 'casual'>
          label={t.jaPractice.politeness}
          value={politeness}
          onChange={(value) => {
            setPoliteness(value);
            restart();
          }}
          options={[
            { value: 'polite', label: t.jaPractice.polite, tone: 'speaking' },
            { value: 'casual', label: t.jaPractice.casual, tone: 'speaking' },
          ]}
        />
        <Segmented<JlptLevel>
          label={t.dashboard.level}
          value={level}
          onChange={(value) => {
            setLevel(value);
            restart();
          }}
          options={JLPT_CONTENT_LEVELS.map((l) => ({ value: l, label: l, tone: 'speaking' }))}
        />
        <Button variant="ghost" icon="plus" onClick={restart}>
          {t.chat.newConversation}
        </Button>
      </div>
      <ChatPanel messages={messages} isLoading={isLoading} error={error} onSend={sendUserMessage} language="ja" />
    </div>
  );
};

/* ---------- Scenarios ---------- */

const JaScenarioSession: React.FC<{ scenario: JaScenario; onBack: () => void }> = ({ scenario, onBack }) => {
  const { t, locale } = useI18n();
  const { level: goal } = useJaLevel();
  const context = useMemo(
    () => ({
      mode: 'ja-scenario' as const,
      scenario: { aiRole: scenario.aiRole, userRole: scenario.userRole, context: scenario.context },
      // Never easier than the scenario itself
      level: JLPT_CONTENT_LEVELS.indexOf(goal) > JLPT_CONTENT_LEVELS.indexOf(scenario.level) ? scenario.level : goal,
    }),
    [scenario, goal]
  );
  const { messages, isLoading, error, sendUserMessage } = useClaude({ context });
  useSessionRecorder(messages, { key: scenario.id, activity: 'scenario', contentRef: `ja:${scenario.id}`, title: plainText(scenario.title) });

  return (
    <div className="speak">
      <div>
        <Button variant="ghost" icon="arrowLeft" onClick={onBack}>
          {t.scenarios.back}
        </Button>
      </div>
      <Card padding="lg" tone="speaking" className="scene-brief">
        <div className="scene-brief__head">
          <h1 className="scene-brief__title">
            <JaText text={scenario.title} />
          </h1>
          <Badge tone="speaking">{scenario.level}</Badge>
        </div>
        <p>{scenario.description[locale]}</p>
      </Card>
      <ChatPanel
        messages={messages}
        isLoading={isLoading}
        error={error}
        onSend={sendUserMessage}
        suggestions={messages.length < 4 ? scenario.suggestions : undefined}
        suggestionsLabel={t.scenarios.suggestions}
        language="ja"
      />
    </div>
  );
};

export const JaScenariosPage: React.FC = () => {
  const { t, locale } = useI18n();
  const [active, setActive] = useState<JaScenario | null>(null);

  if (active) return <JaScenarioSession key={active.id} scenario={active} onBack={() => setActive(null)} />;

  return (
    <div className="speak">
      <PageHeader eyebrow="日本語" title={t.skills.activities.jaScenarios.title} description={t.jaPractice.scenariosIntro} />
      <div className="scene-grid">
        {JA_SCENARIOS.map((scenario, index) => (
          <button key={scenario.id} type="button" className="scene-btn reveal" style={{ ['--i' as string]: index }} onClick={() => setActive(scenario)}>
            <Card interactive tone="speaking" className="scene-card">
              <div className="scene-card__head">
                <h2 className="scene-card__title">
                  <JaText text={scenario.title} />
                </h2>
                <Badge tone="speaking">{scenario.level}</Badge>
              </div>
              <p className="scene-card__description">{scenario.description[locale]}</p>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
};
