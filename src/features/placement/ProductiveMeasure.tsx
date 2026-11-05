/**
 * ProductiveMeasure
 * Optional measuring of Writing or Speaking after the level test: a short prompt, the learner's own words (typed, or
 * said into the microphone and corrected as text), and the level the AI places them at. A rough measure from one
 * sample, so it is said so, and it costs AI credits.
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Banner, Button, Modal } from '@/design';
import { useCurrentUser } from '@/app/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { useSpeechRecognition } from '@/hooks';
import { RecordButton } from '@/features/speaking/RecordButton';
import { CREDIT_COST, tasksLeft } from '@/shared/billingApi';
import { errorMessage } from '@/shared/http';
import { placementApi, type ProductiveSkill } from '@/shared/placementApi';

/** The shortest sample the server accepts, in words (mirrors server/placement/productive.ts) */
const MIN_WORDS: Record<ProductiveSkill, number> = { writing: 40, speaking: 25 };
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export const ProductiveMeasure: React.FC<{ skill: ProductiveSkill; open: boolean; onClose: () => void; onMeasured: (level: string) => void }> = ({ skill, open, onClose, onMeasured }) => {
  const { t } = useI18n();
  const user = useCurrentUser();
  const m = t.placement.measure;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<{ level: string; reason: string } | null>(null);
  const { isListening, transcript, interimTranscript, isSupported, errorKind, startListening, stopListening, resetTranscript } = useSpeechRecognition();
  const cost = skill === 'writing' ? CREDIT_COST.writing : CREDIT_COST.speaking;
  const creditsOut = (tasksLeft(user.credits, skill === 'writing' ? 'writing' : 'speaking') ?? 1) < 1;

  // Each finished recording is added to the text
  useEffect(() => {
    if (!isListening && transcript) {
      setText((before) => `${before} ${transcript}`.trim());
      resetTranscript();
    }
  }, [isListening, transcript, resetTranscript]);

  const count = words(text);
  const enough = count >= MIN_WORDS[skill];

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const verdict = await placementApi.productive(skill, text);
      setResult(verdict);
      onMeasured(verdict.level);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={m.title[skill]}
      onClose={onClose}
      closeLabel={t.common.close}
      footer={
        result ? (
          <Button onClick={onClose}>{m.done}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              {m.later}
            </Button>
            <Button onClick={() => void submit()} loading={busy} disabled={!enough || creditsOut}>
              {m.check}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="placement-measure">
          <p>{m.resultLine(result.level)}</p>
          <p className="placement__hint">{result.reason}</p>
          <p className="placement__hint">{m.rough}</p>
        </div>
      ) : (
        <div className="placement-measure">
          <p lang="en">
            <strong>{m.prompt[skill]}</strong>
          </p>
          {creditsOut && <Banner tone="warning">{m.noCredits}</Banner>}
          {error !== null && <Banner tone="warning">{errorMessage(error, t)}</Banner>}
          {skill === 'speaking' && errorKind === 'denied' && <Banner tone="warning">{t.ielts.micDenied}</Banner>}
          {skill === 'speaking' && isSupported && (
            <RecordButton size="md" isRecording={isListening} onStart={startListening} onStop={stopListening} startLabel={t.ielts.record} stopLabel={t.ielts.stopRecord} />
          )}
          <textarea
            className="input"
            lang="en"
            rows={6}
            value={isListening ? `${text} ${transcript} ${interimTranscript}`.trim() : text}
            maxLength={3000}
            aria-label={m.title[skill]}
            placeholder={skill === 'speaking' ? t.ielts.transcriptLabel : undefined}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="placement__hint">
            {m.words(count, MIN_WORDS[skill])} · {m.cost(cost)}
          </p>
        </div>
      )}
    </Modal>
  );
};
