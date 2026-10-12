/**
 * ImportEditor
 * One import: mark page ranges -> AI reading progress -> review, fix and publish
 */
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Banner, Button, Card, Icon, ProgressBar, Spinner, TextInput, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { importApi, STATUS_TONE, uploadMedia, type Draft, type DraftGroup, type ImportDetail, type ImportRanges, type PageRange } from './importApi';
import { canvasToJpeg, HIGH_RES_SCALE, openPdf, renderPage } from './pdfPages';
import { PagePreview } from './ImportPages';
import { DraftGroupEditor } from './DraftGroupEditor';
import { MONDAI_SECTION, type Mondai } from '@/shared/jlptApi';

/** Poll interval while the server parses */
const PARSE_POLL_MS = 2500;
/** Pages with less text than this are sent to OCR as images (matches the server) */
const MIN_TEXT_CHARS = 40;
/** Page images uploaded per request */
const IMAGE_BATCH = 8;
const THUMB_SCALE = 0.32;
const SOURCE_SCALE = 1.4;

type RangeKey = keyof ImportRanges;
const RANGE_KEYS: RangeKey[] = ['questions', 'answers', 'transcripts'];

/**
 * Pages inside any of the ranges
 */
function pagesInRanges(ranges: ImportRanges): Set<number> {
  const pages = new Set<number>();
  for (const range of Object.values(ranges) as (PageRange | undefined)[]) {
    if (!range) continue;
    for (let n = range[0]; n <= range[1]; n++) pages.add(n);
  }
  return pages;
}

/**
 * Step 1: page thumbnails and range inputs
 */
const RangesStep: React.FC<{ job: ImportDetail; onStarted: (job: ImportDetail) => void; onCancel?: () => void }> = ({ job, onStarted, onCancel }) => {
  const { t } = useI18n();
  const last = job.pageCount;
  const [ranges, setRanges] = useState<Record<RangeKey, [string, string]>>(() => {
    const initial = job.ranges ?? {};
    return {
      questions: [String(initial.questions?.[0] ?? 1), String(initial.questions?.[1] ?? last)],
      answers: [String(initial.answers?.[0] ?? ''), String(initial.answers?.[1] ?? '')],
      transcripts: [String(initial.transcripts?.[0] ?? ''), String(initial.transcripts?.[1] ?? '')],
    };
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const parsed: ImportRanges = {};
  for (const key of RANGE_KEYS) {
    const [from, to] = ranges[key].map(Number);
    if (from >= 1 && to >= from && to <= last) parsed[key] = [from, to];
  }
  const labels: Record<RangeKey, string> = { questions: t.imports.rangeQuestions, answers: t.imports.rangeAnswers, transcripts: t.imports.rangeTranscripts };

  const start = async (): Promise<void> => {
    if (!parsed.questions) return;
    setError(null);
    try {
      // Scanned pages need images for OCR; render them here because the server has no PDF renderer
      const wanted = pagesInRanges(parsed);
      const scans = job.isPdf && job.documentUrl ? job.pages.filter((p) => wanted.has(p.n) && p.text.length < MIN_TEXT_CHARS && !p.imageUrl) : [];
      if (scans.length > 0) {
        const doc = await openPdf(job.documentUrl!);
        const images: { n: number; assetId: string }[] = [];
        for (let i = 0; i < scans.length; i += IMAGE_BATCH) {
          setBusy(t.imports.preparingPages(i, scans.length));
          const batch = scans.slice(i, i + IMAGE_BATCH);
          const blobs = await Promise.all(batch.map(async (p) => ({ blob: await canvasToJpeg(await renderPage(doc, p.n, HIGH_RES_SCALE)), name: `page-${p.n}.jpg` })));
          const assets = await uploadMedia(blobs);
          batch.forEach((p, j) => images.push({ n: p.n, assetId: assets[j].id }));
        }
        await importApi.setPageImages(job.id, images);
      }
      setBusy(t.imports.progress.starting);
      const { import: started } = await importApi.parse(job.id, parsed);
      onStarted(started);
    } catch (err) {
      setError(err);
      setBusy(null);
    }
  };

  return (
    <div className="import-step">
      <Card padding="lg" className="import-ranges">
        <p className="import-ranges__intro">{t.imports.rangesIntro}</p>
        <div className="import-ranges__grid">
          {RANGE_KEYS.map((key) => (
            <fieldset key={key} className={`import-range ${parsed[key] ? 'import-range--set' : ''}`}>
              <legend>
                {labels[key]}
                {key !== 'questions' && <span className="import-range__opt"> · {t.imports.optional}</span>}
              </legend>
              {(['from', 'to'] as const).map((end, i) => (
                <label key={end} className="import-range__input">
                  <span>{t.imports[end]}</span>
                  <TextInput
                    type="number"
                    min={1}
                    max={last}
                    inputMode="numeric"
                    value={ranges[key][i]}
                    onChange={(e) => setRanges((r) => ({ ...r, [key]: i === 0 ? [e.target.value, r[key][1]] : [r[key][0], e.target.value] }))}
                  />
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
        <div className="import-actions">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={busy !== null}>
              {t.common.cancel}
            </Button>
          )}
          <Button icon="sparkles" onClick={start} loading={busy !== null} disabled={!parsed.questions}>
            {busy ?? t.imports.startParse}
          </Button>
        </div>
      </Card>

      <ol className="page-strip" aria-label={t.imports.sourcePage}>
        {job.pages.map((page) => {
          const tag = RANGE_KEYS.find((key) => parsed[key] && page.n >= parsed[key]![0] && page.n <= parsed[key]![1]);
          return (
            <li key={page.n} className={`page-strip__item ${tag ? `page-strip__item--${tag}` : ''}`}>
              <div className="page-strip__thumb">
                <PagePreview docUrl={job.documentUrl} isPdf={job.isPdf} page={page} scale={THUMB_SCALE} lazy />
              </div>
              <span className="page-strip__label">
                {page.n}
                {page.text.length < MIN_TEXT_CHARS && <span className="page-strip__scan"> · scan</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

/**
 * Step 2: progress while the server parses
 */
const ParseProgress: React.FC<{ job: ImportDetail }> = ({ job }) => {
  const { t } = useI18n();
  const progress = job.progress;
  const share = progress && progress.total > 0 ? progress.done / progress.total : 0;
  return (
    <Card padding="lg" className="import-progress">
      <Spinner size={36} />
      <p className="import-progress__step">
        {t.imports.progress[progress?.step ?? 'starting'] ?? progress?.step}
        {progress && progress.total > 1 && ` · ${progress.done}/${progress.total}`}
      </p>
      <ProgressBar value={share} tone="exam" label={t.imports.stepParse} />
      <p className="import-progress__note">{t.imports.progressNote}</p>
    </Card>
  );
};

/**
 * Source page viewer beside the review list
 */
const SourceViewer: React.FC<{ job: ImportDetail; page: number; onPage: (n: number) => void }> = ({ job, page, onPage }) => {
  const { t } = useI18n();
  return (
    <aside className="source-viewer" aria-label={t.imports.sourcePage}>
      <div className="source-viewer__bar">
        <Button size="sm" variant="ghost" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} aria-label="‹">
          ‹
        </Button>
        <span>{t.imports.page(page)}</span>
        <Button size="sm" variant="ghost" onClick={() => onPage(Math.min(job.pageCount, page + 1))} disabled={page >= job.pageCount} aria-label="›">
          ›
        </Button>
      </div>
      <div className="source-viewer__page">
        <PagePreview docUrl={job.documentUrl} isPdf={job.isPdf} page={job.pages.find((p) => p.n === page)} scale={SOURCE_SCALE} />
      </div>
    </aside>
  );
};

/**
 * Upload of listening recordings for the whole test
 */
const RecordingsPanel: React.FC<{ draft: Draft; onChange: (draft: Draft) => void }> = ({ draft, onChange }) => {
  const { t } = useI18n();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const recordings = draft.recordings ?? [];

  const upload = async (files: FileList | null): Promise<void> => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const assets = await uploadMedia([...files]);
      onChange({ ...draft, recordings: [...recordings, ...assets.map((a) => ({ assetId: a.id, name: a.originalName }))] });
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Card padding="md" className="import-recordings">
      <div className="import-recordings__head">
        <h3>
          <Icon name="headphones" size={18} /> {t.imports.recordings}
        </h3>
        <input ref={inputRef} type="file" multiple accept="audio/*,.mp3,.m4a,.wav,.ogg" className="visually-hidden" onChange={(e) => void upload(e.target.files)} />
        <Button size="sm" variant="secondary" icon="upload" loading={busy} onClick={() => inputRef.current?.click()}>
          {t.imports.uploadAudio}
        </Button>
      </div>
      <p className="import-recordings__intro">{t.imports.recordingsIntro}</p>
      {recordings.length > 0 && (
        <ul className="import-recordings__list">
          {recordings.map((r) => (
            <li key={r.assetId}>
              <Icon name="headphones" size={14} /> {r.name}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

/**
 * Collapsible group card with its issues
 */
const GroupCard: React.FC<{
  group: DraftGroup;
  job: ImportDetail;
  draft: Draft;
  onChange: (payload: Record<string, unknown>) => void;
  onMondaiChange: (mondai: Mondai) => void;
  onShowPage: (n: number) => void;
}> = ({ group, job, draft, onChange, onMondaiChange, onShowPage }) => {
  const { t } = useI18n();
  const errors = group.issues.filter((i) => i.level === 'error');
  const warnings = group.issues.filter((i) => i.level === 'warning');
  const photoPage = group.photoPages ? Object.values(group.photoPages)[0] : undefined;

  return (
    <details className={`draft-group ${errors.length ? 'draft-group--error' : ''}`} open={errors.length > 0}>
      <summary className="draft-group__summary">
        <span className="draft-group__title">
          {group.mondai ? (
            <>
              <span lang="ja">{t.jlpt.mondai[group.mondai].title}</span> · {t.jlpt.sections[MONDAI_SECTION[group.mondai]]} ({group.numbers[0]}–{group.numbers[1]})
            </>
          ) : (
            t.imports.group(group.part!, group.numbers[0], group.numbers[1])
          )}
        </span>
        <span className="draft-group__badges">
          {errors.length > 0 ? <Badge tone="danger">{errors.length}</Badge> : <Badge tone="success" icon="check">OK</Badge>}
          {warnings.length > 0 && <Badge tone="warning">{warnings.length}</Badge>}
        </span>
      </summary>
      {group.issues.length > 0 && (
        <ul className="draft-issues" aria-label={t.imports.issues}>
          {group.issues.map((issue, i) => (
            <li key={i} className={`draft-issues__item draft-issues__item--${issue.level}`}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      {photoPage && (
        <button type="button" className="draft-group__page-link" onClick={() => onShowPage(photoPage)}>
          {t.imports.sourcePage}: {t.imports.page(photoPage)}
        </button>
      )}
      <DraftGroupEditor
        group={group}
        recordings={draft.recordings ?? []}
        docUrl={job.documentUrl}
        isPdf={job.isPdf}
        pageCount={job.pageCount}
        onChange={onChange}
        onMondaiChange={group.mondai ? onMondaiChange : undefined}
      />
    </details>
  );
};

/**
 * Step 3: review and publish
 */
const ReviewStep: React.FC<{ job: ImportDetail; onJob: (job: ImportDetail) => void; onReparse: () => void }> = ({ job, onJob, onReparse }) => {
  const { t } = useI18n();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(job.draft!);
  const [title, setTitle] = useState(job.title);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [page, setPage] = useState(job.ranges.questions?.[0] ?? 1);

  const change = (next: Draft) => {
    setDraft(next);
    setDirty(true);
  };

  const save = async (): Promise<ImportDetail | null> => {
    setBusy('save');
    try {
      const { import: saved } = await importApi.saveDraft(job.id, draft, title.trim() || undefined);
      // Keep the local payloads (the editor state) but take the server's recomputed issues
      setDraft((current) => ({ ...current, groups: current.groups.map((g, i) => ({ ...g, issues: saved.draft!.groups[i]?.issues ?? g.issues })) }));
      setDirty(false);
      onJob(saved);
      toast(t.imports.saved, 'success');
      return saved;
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const publish = async (): Promise<void> => {
    if (dirty && !(await save())) return;
    setBusy('publish');
    try {
      const { import: published } = await importApi.publish(job.id);
      onJob(published);
      toast(t.imports.publishedToast, 'success');
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    } finally {
      setBusy(null);
    }
  };

  const errorGroups = draft.groups.filter((g) => g.issues.some((i) => i.level === 'error')).length;
  const hasListening = draft.groups.some((g) => (g.mondai ? MONDAI_SECTION[g.mondai] === 'listening' : g.part! <= 4));

  return (
    <div className="import-review">
      <div className="import-review__bar">
        <TextInput className="import-review__title" aria-label={t.imports.titleLabel} value={title} maxLength={120} onChange={(e) => {
          setTitle(e.target.value);
          setDirty(true);
        }} />
        <span className={`import-review__state ${dirty ? 'import-review__state--dirty' : ''}`}>{dirty ? t.imports.unsaved : ''}</span>
        <Button variant="ghost" size="sm" onClick={onReparse} disabled={busy !== null}>
          {t.imports.reparse}
        </Button>
        <Button variant="secondary" onClick={() => void save()} loading={busy === 'save'} disabled={!dirty || busy !== null}>
          {t.imports.save}
        </Button>
        <Button variant="exam" icon="check" onClick={publish} loading={busy === 'publish'} disabled={busy !== null || errorGroups > 0}>
          {job.status === 'published' ? t.imports.republish : t.imports.publish}
        </Button>
      </div>

      <Banner tone={errorGroups ? 'warning' : 'success'}>{t.imports.errorsLeft(errorGroups)}</Banner>
      {job.coverage.map((c) => (
        <Banner key={c.part} tone="info">
          {t.imports.coverageMissing(c.part, c.missing.length)}: {c.missing.slice(0, 12).join(', ')}
          {c.missing.length > 12 && '…'}
        </Banner>
      ))}

      <div className="import-review__layout">
        <div className="import-review__groups">
          {hasListening && <RecordingsPanel draft={draft} onChange={change} />}
          {draft.groups.map((group, index) => (
            <GroupCard
              key={`${group.part ?? group.mondai}-${group.key}`}
              group={group}
              job={job}
              draft={draft}
              onShowPage={setPage}
              onChange={(payload) => change({ ...draft, groups: draft.groups.map((g, i) => (i === index ? { ...g, payload } : g)) })}
              onMondaiChange={(mondai) => change({ ...draft, groups: draft.groups.map((g, i) => (i === index ? { ...g, mondai } : g)) })}
            />
          ))}
        </div>
        <SourceViewer job={job} page={page} onPage={setPage} />
      </div>
    </div>
  );
};

export const ImportEditor: React.FC<{ id: string; onBack: () => void }> = ({ id, onBack }) => {
  const { t } = useI18n();
  const [job, setJob] = useState<ImportDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reparsing, setReparsing] = useState(false);

  const load = useCallback(async () => {
    try {
      setJob((await importApi.get(id)).import);
    } catch (err) {
      setError(err);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    importApi
      .get(id)
      .then(({ import: loaded }) => !cancelled && setJob(loaded))
      .catch((err) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const parsing = job?.status === 'parsing';
  useEffect(() => {
    if (!parsing) return;
    const timer = setInterval(() => void load(), PARSE_POLL_MS);
    return () => clearInterval(timer);
  }, [parsing, load]);

  if (!job) {
    return error !== null ? <Banner tone="danger">{errorMessage(error, t)}</Banner> : <Spinner size={32} label={t.common.loading} />;
  }

  const step = job.status === 'parsing' ? 2 : job.draft && !reparsing ? 3 : 1;
  const steps = [t.imports.stepPages, t.imports.stepParse, t.imports.stepReview];

  return (
    <div className="import-editor">
      <div className="import-editor__head">
        <Button variant="ghost" size="sm" icon="arrowLeft" onClick={onBack}>
          {t.imports.back}
        </Button>
        <h2 className="import-editor__title">{job.title}</h2>
        <Badge tone={STATUS_TONE[job.status]}>{t.imports.status[job.status]}</Badge>
      </div>

      <ol className="import-steps">
        {steps.map((label, i) => (
          <li key={label} className={`import-steps__item ${i + 1 === step ? 'import-steps__item--current' : ''} ${i + 1 < step ? 'import-steps__item--done' : ''}`}>
            <span className="import-steps__dot">{i + 1 < step ? <Icon name="check" size={14} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {job.status === 'failed' && job.error && <Banner tone="danger">{job.error}</Banner>}
      {reparsing && job.draft && <Banner tone="warning">{t.imports.reparseWarning}</Banner>}

      {step === 1 && (
        <RangesStep
          job={job}
          onCancel={reparsing ? () => setReparsing(false) : undefined}
          onStarted={(started) => {
            setReparsing(false);
            setJob(started);
          }}
        />
      )}
      {step === 2 && <ParseProgress job={job} />}
      {step === 3 && <ReviewStep key={job.id} job={job} onJob={setJob} onReparse={() => setReparsing(true)} />}
    </div>
  );
};
