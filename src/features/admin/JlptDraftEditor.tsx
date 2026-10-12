/**
 * JlptDraftEditor
 * Edits one parsed JLPT group of an imported test: texts, questions with answers 1-4,
 * pictures cropped from the book, and for listening the recording and scripts
 */
import type React from 'react';
import { useRef, useState } from 'react';
import { Button, Icon, Select, TextInput, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { mediaUrl, type AudioSegment } from '@/shared/examApi';
import { MONDAI, MONDAI_SECTION, type Mondai } from '@/shared/jlptApi';
import { uploadMedia } from './importApi';
import { PhotoCropModal } from './ImportPages';
import { AnswerPicker, AudioPicker, LabeledInput, type DraftGroupEditorProps } from './DraftGroupEditor';
import { scriptToText, textToScript } from './draftScript';

const NUMBERS = ['1', '2', '3', '4'];
const AUTO_EXPLANATION = /^(Answer key: \d|Answer missing from the key\.)$/;

type Payload = Record<string, unknown>;
type Explanation = { vi: string; en: string };
type Entry = Payload & { number?: number; options: string[]; answerIndex: number; explanation: Explanation; imageAssetId?: string | null };
type Target = { list: 'questions' | 'items' | 'passages'; index: number };

const optionCount = (mondai: Mondai) => (mondai === 'listen-expression' || mondai === 'listen-response' ? 3 : 4);

/**
 * New answer; the explanation written from the key follows it
 */
function withAnswer<T extends Entry>(entry: T, index: number): T {
  const auto = AUTO_EXPLANATION.test(entry.explanation?.en ?? '');
  return { ...entry, answerIndex: index, explanation: auto ? { vi: `Đáp án theo sách: ${index + 1}`, en: `Answer key: ${index + 1}` } : entry.explanation };
}

/**
 * Picture of a question, item or passage with crop and upload buttons
 */
const PictureField: React.FC<{ assetId?: string | null; canCrop: boolean; onCrop: () => void; onUpload: () => void; onRemove: () => void }> = ({
  assetId,
  canCrop,
  onCrop,
  onUpload,
  onRemove,
}) => {
  const { t } = useI18n();
  return (
    <div className="draft-picture">
      {assetId ? (
        <img src={mediaUrl(assetId)} alt={t.imports.photo} />
      ) : (
        <span className="draft-p1__placeholder">
          <Icon name="image" size={22} />
        </span>
      )}
      <span className="draft-p1__buttons">
        {canCrop && (
          <Button size="sm" variant="secondary" icon="crop" onClick={onCrop}>
            {t.imports.cropPhoto}
          </Button>
        )}
        <Button size="sm" variant="ghost" icon="upload" onClick={onUpload}>
          {t.imports.uploadPhoto}
        </Button>
        {assetId && <Button size="sm" variant="ghost" icon="trash" aria-label={t.imports.removePicture} onClick={onRemove} />}
      </span>
    </div>
  );
};

/**
 * Options 1-4 and the answer
 */
const OptionsEditor: React.FC<{ entry: Entry; count: number; label: string; onChange: (entry: Entry) => void }> = ({ entry, count, label, onChange }) => {
  const { t } = useI18n();
  const options = Array.from({ length: count }, (_, i) => entry.options[i] ?? '');
  return (
    <>
      <AnswerPicker count={count} labels={NUMBERS} value={entry.answerIndex} label={t.imports.answer} onChange={(i) => onChange(withAnswer(entry, i))} />
      <div className="draft-q__options">
        {options.map((option, i) => (
          <label key={i} className="draft-q__option">
            <span className="draft-q__letter">{NUMBERS[i]}</span>
            <TextInput value={option} lang="ja" aria-label={`${label} (${NUMBERS[i]})`} onChange={(e) => onChange({ ...entry, options: options.map((o, j) => (j === i ? e.target.value : o)) })} />
          </label>
        ))}
      </div>
    </>
  );
};

export const JlptDraftEditor: React.FC<DraftGroupEditorProps> = ({ group, recordings, docUrl, isPdf, pageCount, onChange, onMondaiChange }) => {
  const { t } = useI18n();
  const toast = useToast();
  const mondai = group.mondai!;
  const payload = group.payload;
  const listening = MONDAI_SECTION[mondai] === 'listening';
  const count = optionCount(mondai);
  const [crop, setCrop] = useState<Target | null>(null);
  const uploadFor = useRef<Target | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = <T,>(name: Target['list']) => (payload[name] ?? []) as T[];
  const setEntry = (name: Target['list'], index: number, value: Payload) =>
    onChange({ ...payload, [name]: list<Payload>(name).map((entry, i) => (i === index ? value : entry)) });
  const setPicture = (target: Target, assetId: string | null) => {
    const current = list<Payload>(target.list)[target.index];
    setEntry(target.list, target.index, { ...current, imageAssetId: assetId });
  };
  const numberOf = (target: Target) => (list<Entry>(target.list)[target.index]?.number ?? group.numbers[0]) as number;

  const upload = async (file: File | undefined) => {
    const target = uploadFor.current;
    if (!file || !target) return;
    try {
      const [asset] = await uploadMedia([file]);
      setPicture(target, asset.id);
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const picture = (target: Target, assetId?: string | null) => (
    <PictureField
      assetId={assetId}
      canCrop={isPdf && Boolean(docUrl)}
      onCrop={() => setCrop(target)}
      onUpload={() => {
        uploadFor.current = target;
        fileRef.current?.click();
      }}
      onRemove={() => setPicture(target, null)}
    />
  );

  const speakers = (payload.speakers ?? {}) as Record<'A' | 'B', { name: string; gender: 'female' | 'male' }>;

  return (
    <div className="draft-group__body jlpt-draft" lang="ja">
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="visually-hidden" onChange={(e) => void upload(e.target.files?.[0])} />

      {onMondaiChange && (
        <div className="draft-field jlpt-draft__type">
          <label className="draft-field__label" htmlFor={`type-${group.key}`}>
            {t.imports.questionType}
          </label>
          <Select id={`type-${group.key}`} value={mondai} onChange={(e) => onMondaiChange(e.target.value as Mondai)}>
            {MONDAI.filter((m) => (MONDAI_SECTION[m] === 'listening') === listening).map((m) => (
              <option key={m} value={m}>
                {t.jlpt.mondai[m].title} · {t.jlpt.sections[MONDAI_SECTION[m]]}
              </option>
            ))}
          </Select>
        </div>
      )}

      {listening && (
        <>
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
          <div className="draft-script__speakers">
            {(['A', 'B'] as const).map((key) => (
              <span key={key} className="draft-script__speaker">
                <strong>{key}</strong>
                <TextInput
                  aria-label={`${key} name`}
                  value={speakers[key]?.name ?? ''}
                  onChange={(e) => onChange({ ...payload, speakers: { ...speakers, [key]: { ...speakers[key], name: e.target.value } } })}
                />
                <Select
                  aria-label={`${key} voice`}
                  value={speakers[key]?.gender ?? 'female'}
                  onChange={(e) => onChange({ ...payload, speakers: { ...speakers, [key]: { ...speakers[key], gender: e.target.value } } })}
                >
                  <option value="female">♀</option>
                  <option value="male">♂</option>
                </Select>
              </span>
            ))}
          </div>
          {list<Entry>('items').map((item, index) => {
            const target: Target = { list: 'items', index };
            const label = t.imports.questionLabel(item.number ?? index + 1);
            return (
              <div key={index} className="draft-q jlpt-draft__item">
                <div className="draft-q__head">
                  <span className="draft-q__number">{label}</span>
                </div>
                {picture(target, item.imageAssetId)}
                {mondai === 'listen-expression' && (
                  <LabeledInput label={t.imports.situation} value={(item.situation as string) ?? ''} onChange={(situation) => setEntry('items', index, { ...item, situation })} />
                )}
                <LabeledInput
                  label={t.imports.script}
                  hint={t.imports.jlptScriptHint}
                  multiline
                  rows={4}
                  value={scriptToText((item.script ?? []) as { speaker: string; text: string }[])}
                  onChange={(value) => setEntry('items', index, { ...item, script: textToScript(value, false).map((l) => ({ ...l, speaker: l.speaker === 'B' ? 'B' : 'A' })) })}
                />
                {mondai !== 'listen-response' && (
                  <LabeledInput label={t.imports.prompt} value={(item.question as string) ?? ''} onChange={(question) => setEntry('items', index, { ...item, question })} />
                )}
                <OptionsEditor entry={item} count={count} label={label} onChange={(next) => setEntry('items', index, next)} />
              </div>
            );
          })}
        </>
      )}

      {!listening && (
        <>
          {list<Payload & { text: string }>('passages').map((passage, index) => (
            <div key={index} className="draft-passage">
              <div className="draft-passage__head">
                <LabeledInput label={t.imports.kind} value={(passage.label as string) ?? ''} onChange={(label) => setEntry('passages', index, { ...passage, label })} />
                <LabeledInput label={t.imports.title} value={(passage.title as string) ?? ''} onChange={(title) => setEntry('passages', index, { ...passage, title })} />
              </div>
              <LabeledInput label={t.imports.passage} multiline rows={7} value={passage.text ?? ''} onChange={(text) => setEntry('passages', index, { ...passage, text })} />
              {picture({ list: 'passages', index }, passage.imageAssetId as string | undefined)}
            </div>
          ))}
          {list<Entry>('questions').map((question, index) => {
            const label = t.imports.questionLabel(question.number ?? index + 1);
            return (
              <div key={index} className="draft-q">
                <div className="draft-q__head">
                  <span className="draft-q__number">{label}</span>
                  <TextInput
                    aria-label={t.imports.prompt}
                    className="draft-q__prompt"
                    value={(question.prompt as string) ?? ''}
                    lang="ja"
                    onChange={(e) => setEntry('questions', index, { ...question, prompt: e.target.value })}
                  />
                </div>
                <OptionsEditor entry={question} count={count} label={label} onChange={(next) => setEntry('questions', index, next)} />
                {question.imageAssetId || group.photoPages?.[String(question.number)] ? picture({ list: 'questions', index }, question.imageAssetId) : null}
              </div>
            );
          })}
          <p className="draft-note">{t.imports.jlptPromptHint}</p>
        </>
      )}

      {crop && docUrl && (
        <PhotoCropModal
          open
          docUrl={docUrl}
          pageCount={pageCount}
          initialPage={group.photoPages?.[String(numberOf(crop))] ?? 1}
          onClose={() => setCrop(null)}
          onCropped={(assetId) => {
            setPicture(crop, assetId);
            setCrop(null);
          }}
        />
      )}
    </div>
  );
};
