/**
 * DeepSession
 * The five-stage session on one word: meet it, understand it, see it in context, use it yourself, connect it.
 * The stage and answers are saved as the learner goes, so leaving does not lose them.
 */
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Banner, Button, Card, Icon, Spinner } from '@/design';
import { PracticeHeader } from '@/features/practice/PracticeHeader';
import { ActivityProgress } from '@/features/practice/ActivityProgress';
import { useI18n } from '@/i18n/I18nProvider';
import { ApiRequestError, errorMessage } from '@/shared/http';
import { deepWordApi, type Cells, type DeepProgress, type SessionStart } from '@/shared/deepWordApi';
import { DepthGrid, StageLadder } from './DepthMeter';
import { StageConnect, StageContext, StageMeet, StageProduce, StageUnderstand } from './stages';
import './deepword.css';

type Summary = { progress: DeepProgress; startCells: Cells | null; schedule: string[]; deferred: boolean };

export const DeepSession: React.FC<{ itemId?: string; relearn?: boolean; onExit: () => void; onOpenWord: (itemId: string) => void }> = ({ itemId, relearn, onExit, onOpenWord }) => {
  const { t, locale } = useI18n();
  const d = t.deepWord.session;
  const [data, setData] = useState<SessionStart | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [progress, setProgress] = useState<DeepProgress | null>(null);
  const [stage, setStage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [attempt, setAttempt] = useState(0);
  const startCells = useRef<Cells | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    deepWordApi
      .start(itemId, relearn)
      .then((start) => {
        if (!live) return;
        setData(start);
        setProgress(start.progress);
        setStage(Math.min(5, Math.max(1, start.progress.sessionStage)));
        startCells.current = (start.progress.sessionData.startCells as Cells | undefined) ?? start.progress.cells;
      })
      .catch((err: unknown) => live && setError(err));
    return () => {
      live = false;
    };
  }, [itemId, relearn, attempt]);

  const save = useCallback(
    (next: number, extra?: Record<string, unknown>) => {
      if (!data) return;
      void deepWordApi.save(data.word.id, next, extra).catch(() => undefined);
    },
    [data]
  );

  const go = (next: number, extra?: Record<string, unknown>) => {
    setStage(next);
    save(next, extra);
    window.scrollTo({ top: 0 });
  };

  const report = (kind: 'guess' | 'recall' | 'listen', aspect: 'form' | 'meaning' | 'use', result: 'pass' | 'partial' | 'fail', assisted = false) => {
    if (!data) return;
    void deepWordApi
      .attempt({ itemId: data.word.id, kind, aspect, result, assisted })
      .then((r) => setProgress(r.progress))
      .catch(() => undefined);
  };

  const finish = async (link: string[]) => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      setSummary({ ...(await deepWordApi.complete(data.word.id, link)), startCells: startCells.current });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (error !== null && !data) {
    const limit = error instanceof ApiRequestError && error.code === 'deep_daily_limit';
    return (
      <div className="dw">
        <Banner tone={limit ? 'info' : 'danger'} action={limit ? undefined : <Button size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>{d.retry}</Button>}>
          {limit ? d.errors.limit : errorMessage(error, t)}
        </Banner>
        <div>
          <Button variant="secondary" icon="arrowLeft" onClick={onExit}>
            {t.deepWord.notebook.back}
          </Button>
        </div>
      </div>
    );
  }

  if (!data || !progress) {
    return (
      <div className="dw" aria-busy="true">
        <Card padding="lg" className="dw__card">
          <Spinner size={28} label={d.loading} />
          <p>
            <strong>{d.loading}</strong>
          </p>
          <p className="dw__muted">{d.loadingBody}</p>
        </Card>
      </div>
    );
  }

  if (summary) {
    return (
      <div className="dw">
        <Card padding="lg" className="dw__card reveal">
          <Icon name="check" size={36} />
          <h2 className="dw__title">{d.end.title}</h2>
          <p>{d.end.body(data.word.term)}</p>
          {summary.deferred && <Banner tone="info">{d.end.deferred}</Banner>}
          <StageLadder stage={summary.progress.stage} />
          <h3 className="dw__h">{d.end.changed}</h3>
          <DepthGrid cells={summary.progress.cells} before={summary.startCells} />
          <p className="dw__muted">
            {d.s5.scheduleTitle}: {summary.schedule.map((s) => new Date(s).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB', { day: 'numeric', month: 'numeric' })).join(' · ')}
          </p>
          <div className="dw__row">
            <Button onClick={onExit}>{d.end.backOverview}</Button>
            <Button variant="secondary" onClick={() => onOpenWord(data.word.id)}>
              {d.end.wordPage}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="dw">
      <PracticeHeader title={d.title} level={null} onBack={onExit} />
      <ActivityProgress label={d.stageLabel(stage, d.steps[stage - 1])} index={stage - 1} total={5} />
      {relearn && stage <= 3 && <Banner tone="info">{d.relearnNote}</Banner>}
      {data.beginner && stage >= 2 && stage <= 3 && <Banner tone="info">{d.beginnerNote}</Banner>}
      <Card padding="lg" key={stage}>
        {stage === 1 && <StageMeet data={data} report={report} onNext={() => go(2)} />}
        {stage === 2 && <StageUnderstand data={data} onNext={() => go(3)} />}
        {stage === 3 && <StageContext data={data} report={report} saved={progress.sessionData} onSave={(extra) => save(3, extra)} onNext={() => go(4)} />}
        {stage === 4 && <StageProduce data={data} progress={progress} onProgress={setProgress} onNext={() => go(5)} onDeferred={(p) => { setProgress(p); go(5); }} />}
        {stage === 5 && <StageConnect data={data} busy={busy} onFinish={(link) => void finish(link)} />}
      </Card>
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
    </div>
  );
};
