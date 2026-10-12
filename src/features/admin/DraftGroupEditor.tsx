/**
 * DraftGroupEditor
 * Edits one parsed group of an imported test in its exam shape (per TOEIC part)
 */
import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button, Icon, Select, TextInput, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { mediaUrl, type AudioSegment } from '@/shared/examApi';
import { playSegment } from '@/shared/audioSegment';
import { uploadMedia, type DraftGroup, type DraftRecording } from './importApi';
import { PhotoCropModal } from './ImportPages';
import { scriptToText, textToScript } from './draftScript';
import { JlptDraftEditor } from './JlptDraftEditor';
import type { Mondai } from '@/shared/jlptApi';

const LETTERS = ['A', 'B', 'C', 'D'];
const SPEAKER_KEYS = ['A', 'B', 'C'] as const;
/** Default explanations written by the parser; kept in sync when the answer changes */
const AUTO_EXPLANATION = /^(Answer key: \([A-D]\)\.|Answer missing from the key\.)$/;

type Payload = Record<string, unknown>;
type Mcq = { prompt: string; options: string[]; answerIndex: number; explanation: string; type?: string };
type Speaker = { name: string; gender: 'female' | 'male' };

/**
 * "m:ss" or seconds -> seconds
 */
function parseTime(value: string): number | undefined {
  const text = value.trim();
  if (!text) return undefined;
  const match = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(text);
  if (!match) return undefined;
  return Number(match[1] ?? 0) * 60 + Number(match[2]);
}

/**
 * Seconds -> "m:ss"
 */
function formatTime(seconds: number | undefined): string {
  if (seconds === undefined) return '';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Answer chosen with letter buttons; keeps an auto explanation in sync
 */
export const AnswerPicker: React.FC<{ count: number; value: number; onChange: (index: number) => void; label: string; labels?: string[] }> = ({
  count,
  value,
  onChange,
  label,
  labels = LETTERS,
}) => (
  <div className="answer-pick" role="radiogroup" aria-label={label}>
    {labels.slice(0, count).map((letter, index) => (
      <button
        key={letter}
        type="button"
        role="radio"
        aria-checked={value === index}
        className={`answer-pick__opt ${value === index ? 'answer-pick__opt--on' : ''}`}
        onClick={() => onChange(index)}
      >
        {letter}
      </button>
    ))}
  </div>
);

/**
 * Answer + explanation update for a question or item
 */
function withAnswer<T extends { answerIndex: number; explanation: string }>(item: T, index: number): T {
  const explanation = AUTO_EXPLANATION.test(item.explanation) ? `Answer key: (${LETTERS[index]}).` : item.explanation;
  return { ...item, answerIndex: index, explanation };
}

/**
 * Small labelled text input
 */
export const LabeledInput: React.FC<{ label: string; value: string; onChange: (value: string) => void; multiline?: boolean; rows?: number; hint?: string }> = ({
  label,
  value,
  onChange,
  multiline,
  rows = 3,
  hint,
}) => {
  const id = useId();
  return (
    <div className="draft-field">
      <label htmlFor={id} className="draft-field__label">
        {label}
      </label>
      {multiline ? (
        <textarea id={id} className="input draft-field__area" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} lang="en" />
      ) : (
        <TextInput id={id} value={value} onChange={(e) => onChange(e.target.value)} lang="en" />
      )}
      {hint && <p className="draft-field__hint">{hint}</p>}
    </div>
  );
};

/**
 * Printed multiple-choice question
 */
const QuestionEditor: React.FC<{ number: number; question: Mcq; showPrompt: boolean; onChange: (q: Mcq) => void }> = ({ number, question, showPrompt, onChange }) => {
  const { t } = useI18n();
  const options = [0, 1, 2, 3].map((i) => question.options[i] ?? '');
  return (
    <div className="draft-q">
      <div className="draft-q__head">
        <span className="draft-q__number">{t.imports.questionLabel(number)}</span>
        {showPrompt ? (
          <TextInput
            aria-label={t.imports.prompt}
            className="draft-q__prompt"
            value={question.prompt}
            lang="en"
            onChange={(e) => onChange({ ...question, prompt: e.target.value })}
          />
        ) : (
          <span className="draft-q__fixed">{question.prompt}</span>
        )}
        <AnswerPicker count={4} value={question.answerIndex} label={t.imports.answer} onChange={(i) => onChange(withAnswer(question, i))} />
      </div>
      <div className="draft-q__options">
        {options.map((option, i) => (
          <label key={i} className="draft-q__option">
            <span className="draft-q__letter">{LETTERS[i]}</span>
            <TextInput
              value={option}
              lang="en"
              aria-label={`${t.imports.questionLabel(number)} (${LETTERS[i]})`}
              onChange={(e) => onChange({ ...question, options: options.map((o, j) => (j === i ? e.target.value : o)) })}
            />
          </label>
        ))}
      </div>
    </div>
  );
};

/**
 * Recording attached to a listening group, with start/end and a preview
 */
export const AudioPicker: React.FC<{
  audio: AudioSegment | undefined;
  recordings: DraftRecording[];
  onChange: (audio: AudioSegment | undefined) => void;
}> = ({ audio, recordings, onChange }) => {
  const { t } = useI18n();
  const id = useId();
  const stopRef = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState(false);
  // Times are typed as text and parsed on blur so partial input like "1:" is allowed
  const [startText, setStartText] = useState(formatTime(audio?.start));
  const [endText, setEndText] = useState(formatTime(audio?.end));

  useEffect(() => () => stopRef.current?.(), []);

  const commitTimes = () => {
    if (!audio) return;
    onChange({ assetId: audio.assetId, start: parseTime(startText), end: parseTime(endText) });
  };

  const togglePreview = () => {
    if (playing) {
      stopRef.current?.();
      return;
    }
    if (!audio) return;
    setPlaying(true);
    stopRef.current = playSegment({ assetId: audio.assetId, start: parseTime(startText), end: parseTime(endText) }, () => {
      stopRef.current = null;
      setPlaying(false);
    });
  };

  return (
    <div className="draft-audio">
      <div className="draft-field">
        <label htmlFor={id} className="draft-field__label">
          {t.imports.recording}
        </label>
        <Select id={id} value={audio?.assetId ?? ''} onChange={(e) => onChange(e.target.value ? { assetId: e.target.value } : undefined)}>
          <option value="">{t.imports.noRecording}</option>
          {recordings.map((r) => (
            <option key={r.assetId} value={r.assetId}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>
      {audio && (
        <>
          <div className="draft-field draft-audio__time">
            <label className="draft-field__label" htmlFor={`${id}-start`}>
              {t.imports.segmentStart}
            </label>
            <TextInput id={`${id}-start`} inputMode="decimal" placeholder="0:00" value={startText} onChange={(e) => setStartText(e.target.value)} onBlur={commitTimes} />
          </div>
          <div className="draft-field draft-audio__time">
            <label className="draft-field__label" htmlFor={`${id}-end`}>
              {t.imports.segmentEnd}
            </label>
            <TextInput id={`${id}-end`} inputMode="decimal" placeholder="—" value={endText} onChange={(e) => setEndText(e.target.value)} onBlur={commitTimes} />
          </div>
          <Button size="sm" variant="secondary" icon="headphones" onClick={togglePreview}>
            {playing ? t.imports.stop : t.imports.preview}
          </Button>
        </>
      )}
    </div>
  );
};

/**
 * Transcript and speakers of a Part 3/4 group
 */
const ScriptEditor: React.FC<{ payload: Payload; single: boolean; onChange: (payload: Payload) => void }> = ({ payload, single, onChange }) => {
  const { t } = useI18n();
  const speakers = (payload.speakers ?? {}) as Record<string, Speaker>;
  const [text, setText] = useState(scriptToText((payload.script ?? []) as { speaker: string; text: string }[]));
  const keys = SPEAKER_KEYS.filter((key) => speakers[key] || (key === 'A'));

  const setSpeaker = (key: string, change: Partial<Speaker>) =>
    onChange({ ...payload, speakers: { ...speakers, [key]: { ...(speakers[key] ?? { name: key, gender: 'female' }), ...change } } });

  return (
    <div className="draft-script">
      <div className="draft-script__speakers">
        {keys.map((key) => (
          <span key={key} className="draft-script__speaker">
            <strong>{key}</strong>
            <TextInput aria-label={`${key} name`} value={speakers[key]?.name ?? ''} onChange={(e) => setSpeaker(key, { name: e.target.value })} />
            <Select aria-label={`${key} voice`} value={speakers[key]?.gender ?? 'female'} onChange={(e) => setSpeaker(key, { gender: e.target.value as Speaker['gender'] })}>
              <option value="female">♀</option>
              <option value="male">♂</option>
            </Select>
          </span>
        ))}
        {!single && keys.length < 3 && (
          <Button size="sm" variant="ghost" icon="plus" onClick={() => setSpeaker(SPEAKER_KEYS[keys.length], { name: SPEAKER_KEYS[keys.length], gender: 'male' })}>
            {SPEAKER_KEYS[keys.length]}
          </Button>
        )}
      </div>
      <LabeledInput
        label={t.imports.script}
        hint={t.imports.scriptHint}
        multiline
        rows={6}
        value={text}
        onChange={(value) => {
          setText(value);
          onChange({ ...payload, script: textToScript(value, single) });
        }}
      />
    </div>
  );
};

export interface DraftGroupEditorProps {
  group: DraftGroup;
  recordings: DraftRecording[];
  docUrl: string | null;
  isPdf: boolean;
  pageCount: number;
  onChange: (payload: Payload) => void;
  /** JLPT: the AI may tag a 問題 with the wrong type */
  onMondaiChange?: (mondai: Mondai) => void;
}

export const DraftGroupEditor: React.FC<DraftGroupEditorProps> = (props) =>
  props.group.mondai ? <JlptDraftEditor {...props} /> : <ToeicDraftEditor {...props} />;

const ToeicDraftEditor: React.FC<DraftGroupEditorProps> = ({ group, recordings, docUrl, isPdf, pageCount, onChange }) => {
  const { t } = useI18n();
  const toast = useToast();
  const { payload } = group;
  const part = group.part!;
  const first = group.numbers[0];
  const [cropFor, setCropFor] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<number | null>(null);

  const questions = (payload.questions ?? []) as Mcq[];
  const items = (payload.items ?? []) as Payload[];
  const setQuestion = (index: number, question: Mcq) => onChange({ ...payload, questions: questions.map((q, i) => (i === index ? question : q)) });
  const setItem = (index: number, item: Payload) => onChange({ ...payload, items: items.map((it, i) => (i === index ? item : it)) });

  const uploadPhoto = async (file: File | undefined): Promise<void> => {
    const index = uploadFor.current;
    if (!file || index === null) return;
    try {
      const [asset] = await uploadMedia([file]);
      setItem(index, { ...items[index], imageAssetId: asset.id });
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    }
  };

  return (
    <div className="draft-group__body">
      {part <= 4 && (
        <AudioPicker
          key={(payload.audio as AudioSegment | undefined)?.assetId ?? 'none'}
          audio={payload.audio as AudioSegment | undefined}
          recordings={recordings}
          onChange={(audio) => {
            const next = { ...payload };
            if (audio) next.audio = audio;
            else delete next.audio;
            onChange(next);
          }}
        />
      )}

      {part === 1 && (
        <>
          <p className="draft-note">{t.imports.spokenOptional}</p>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="visually-hidden" onChange={(e) => void uploadPhoto(e.target.files?.[0])} />
          {items.map((item, index) => {
            const statements = [0, 1, 2, 3].map((i) => ((item.statements as string[] | undefined) ?? [])[i] ?? '');
            return (
              <div key={index} className="draft-p1">
                <div className="draft-p1__photo">
                  {item.imageAssetId ? (
                    <img src={mediaUrl(item.imageAssetId as string)} alt={t.exams.photoAlt(first + index)} />
                  ) : (
                    <span className="draft-p1__placeholder">
                      <Icon name="image" size={28} />
                    </span>
                  )}
                  <span className="draft-p1__buttons">
                    {isPdf && docUrl && (
                      <Button size="sm" variant="secondary" icon="crop" onClick={() => setCropFor(index)}>
                        {t.imports.cropPhoto}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="upload"
                      onClick={() => {
                        uploadFor.current = index;
                        fileRef.current?.click();
                      }}
                    >
                      {t.imports.uploadPhoto}
                    </Button>
                  </span>
                </div>
                <div className="draft-p1__text">
                  <div className="draft-q__head">
                    <span className="draft-q__number">{t.imports.questionLabel(first + index)}</span>
                    <AnswerPicker
                      count={4}
                      value={item.answerIndex as number}
                      label={t.imports.answer}
                      onChange={(i) => setItem(index, withAnswer(item as { answerIndex: number; explanation: string }, i))}
                    />
                  </div>
                  {statements.map((statement, i) => (
                    <label key={i} className="draft-q__option">
                      <span className="draft-q__letter">{LETTERS[i]}</span>
                      <TextInput
                        value={statement}
                        lang="en"
                        aria-label={`${t.imports.questionLabel(first + index)} (${LETTERS[i]})`}
                        onChange={(e) => setItem(index, { ...item, statements: statements.map((s, j) => (j === i ? e.target.value : s)) })}
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          {cropFor !== null && docUrl && (
            <PhotoCropModal
              open
              docUrl={docUrl}
              pageCount={pageCount}
              initialPage={group.photoPages?.[String(first + cropFor)] ?? 1}
              onClose={() => setCropFor(null)}
              onCropped={(assetId) => {
                setItem(cropFor, { ...items[cropFor], imageAssetId: assetId });
                setCropFor(null);
              }}
            />
          )}
        </>
      )}

      {part === 2 && (
        <>
          <p className="draft-note">{t.imports.spokenOptional}</p>
          {items.map((item, index) => {
            const options = [0, 1, 2].map((i) => ((item.options as string[] | undefined) ?? [])[i] ?? '');
            return (
              <div key={index} className="draft-q">
                <div className="draft-q__head">
                  <span className="draft-q__number">{t.imports.questionLabel(first + index)}</span>
                  <TextInput
                    className="draft-q__prompt"
                    aria-label={t.imports.prompt}
                    value={(item.question as string) ?? ''}
                    lang="en"
                    onChange={(e) => setItem(index, { ...item, question: e.target.value })}
                  />
                  <AnswerPicker
                    count={3}
                    value={item.answerIndex as number}
                    label={t.imports.answer}
                    onChange={(i) => setItem(index, withAnswer(item as { answerIndex: number; explanation: string }, i))}
                  />
                </div>
                <div className="draft-q__options">
                  {options.map((option, i) => (
                    <label key={i} className="draft-q__option">
                      <span className="draft-q__letter">{LETTERS[i]}</span>
                      <TextInput
                        value={option}
                        lang="en"
                        aria-label={`${t.imports.questionLabel(first + index)} (${LETTERS[i]})`}
                        onChange={(e) => setItem(index, { ...item, options: options.map((o, j) => (j === i ? e.target.value : o)) })}
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {(part === 3 || part === 4) && (
        <>
          <ScriptEditor payload={payload} single={part === 4} onChange={onChange} />
          <LabeledInput
            label={t.imports.graphic}
            multiline
            rows={2}
            value={(payload.graphic as string) ?? ''}
            onChange={(value) => {
              const next: Payload = { ...payload, graphic: value };
              if (!value.trim()) delete next.graphic;
              onChange(next);
            }}
          />
        </>
      )}

      {part === 6 && (
        <>
          <LabeledInput label={t.imports.title} value={(payload.title as string) ?? ''} onChange={(value) => onChange({ ...payload, title: value })} />
          <LabeledInput
            label={t.imports.passage}
            hint={t.imports.passageHint}
            multiline
            rows={8}
            value={(payload.passage as string) ?? ''}
            onChange={(value) => onChange({ ...payload, passage: value })}
          />
        </>
      )}

      {part === 7 && (
        <div className="draft-passages">
          {((payload.passages ?? []) as { kind: string; title: string; text: string }[]).map((passage, index, all) => {
            const setPassage = (change: Partial<typeof passage>) => onChange({ ...payload, passages: all.map((p, i) => (i === index ? { ...p, ...change } : p)) });
            return (
              <div key={index} className="draft-passage">
                <div className="draft-passage__head">
                  <LabeledInput label={t.imports.kind} value={passage.kind} onChange={(kind) => setPassage({ kind })} />
                  <LabeledInput label={t.imports.title} value={passage.title} onChange={(title) => setPassage({ title })} />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="trash"
                    aria-label={t.imports.removePassage}
                    onClick={() => onChange({ ...payload, passages: all.filter((_, i) => i !== index) })}
                  />
                </div>
                <LabeledInput label={t.imports.passage} multiline rows={7} value={passage.text} onChange={(text) => setPassage({ text })} />
              </div>
            );
          })}
          <Button
            size="sm"
            variant="ghost"
            icon="plus"
            onClick={() => onChange({ ...payload, passages: [...((payload.passages ?? []) as object[]), { kind: 'text', title: '', text: '' }] })}
          >
            {t.imports.addPassage}
          </Button>
        </div>
      )}

      {part >= 3 &&
        questions.map((question, index) => (
          <QuestionEditor key={index} number={first + index} question={question} showPrompt={part !== 6} onChange={(q) => setQuestion(index, q)} />
        ))}
    </div>
  );
};
