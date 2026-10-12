/**
 * WordDetails
 * An English word with pronunciation, meanings, collocations and example, and a sentence-writing practice
 */
import type React from 'react';
import { useState } from 'react';
import { Badge, Banner, Button, Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { speakOnce } from '@/shared/speech';
import { enVocabApi, type EnWord, type SentenceFeedback } from '@/shared/enVocabApi';

/**
 * Word, pronunciation, meanings, collocations and example
 */
export const WordDetails: React.FC<{ word: EnWord }> = ({ word }) => {
  const { t, locale } = useI18n();
  return (
    <div className="vocab-back en-word">
      <p className="en-word__head">
        <span className="en-word__term" lang="en">
          {word.term}
        </span>
        <button type="button" className="vocab-card__speak en-word__speak" onClick={() => speakOnce(word.term)} aria-label={t.chat.listen}>
          <Icon name="headphones" size={18} />
        </button>
      </p>
      <p className="en-word__meta">
        {word.ipa && <span className="en-word__ipa">/{word.ipa}/</span>}
        {word.pos && <span>{t.enVocab.pos[word.pos as keyof typeof t.enVocab.pos] ?? word.pos}</span>}
        {word.cefr && <Badge tone="reading">{word.cefr}</Badge>}
      </p>
      {word.meaningVi && <p className="vocab-back__meaning">{word.meaningVi}</p>}
      {word.meaningsEn[0] && (
        <p className={word.meaningVi ? 'vocab-back__english' : 'vocab-back__meaning'} lang="en">
          {word.meaningsEn[0]}
        </p>
      )}
      {word.collocations.length > 0 && (
        <p className="en-word__collocations" lang="en">
          {word.collocations.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </p>
      )}
      {word.example && (
        <p className="vocab-back__example">
          <span lang="en">{word.example}</span>
          {word.exampleVi && locale === 'vi' && <span className="vocab-back__example-vi"> — {word.exampleVi}</span>}
        </p>
      )}
    </div>
  );
};

/**
 * Learner writes a sentence with the word; the AI says whether it is used well
 */
export const SentencePractice: React.FC<{ word: EnWord }> = ({ word }) => {
  const { t } = useI18n();
  const [sentence, setSentence] = useState('');
  const [result, setResult] = useState<SentenceFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const check = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sentence.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      setResult((await enVocabApi.sentence(word.id, sentence)).feedback);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="en-sentence" onSubmit={check}>
      <label className="en-sentence__label" htmlFor={`sentence-${word.id}`}>
        {t.wordBank.sentenceTitle}
      </label>
      <div className="en-type en-sentence__row">
        <input
          id={`sentence-${word.id}`}
          className="input"
          value={sentence}
          maxLength={400}
          lang="en"
          placeholder={t.wordBank.sentencePlaceholder}
          onChange={(e) => setSentence(e.target.value)}
        />
        <Button type="submit" size="sm" loading={busy} disabled={sentence.trim().length < 3}>
          {t.wordBank.sentenceCheck}
        </Button>
      </div>
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      {result && (
        <div className={`en-sentence__result en-sentence__result--${result.correct ? 'ok' : 'fix'}`}>
          <p>
            <Icon name={result.correct ? 'check' : 'pen'} size={16} /> {result.feedback}
          </p>
          {result.improved && result.improved !== sentence.trim() && (
            <p lang="en">
              <strong>{t.wordBank.improved}:</strong> {result.improved}
            </p>
          )}
        </div>
      )}
    </form>
  );
};
