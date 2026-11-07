/**
 * DeepTab
 * The "Deep words" tab of Vocabulary: today's word, the queue, how deep the learner's words are, and the settings.
 */
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Banner, Button, Card, EmptyState, Field, Icon, Segmented, Skeleton, TextInput } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { deepWordApi, type DeepOverview, type Profile } from '@/shared/deepWordApi';
import { meaningOf } from '@/shared/enVocabApi';
import './deepword.css';

export type DeepView = { type: 'overview' } | { type: 'review' } | { type: 'session'; itemId?: string; relearn?: boolean } | { type: 'word'; itemId: string } | { type: 'network'; itemId: string } | { type: 'notebook' } | { type: 'setup' };

const splitList = (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5);

/** Settings and the context profile */
const Setup: React.FC<{ overview: DeepOverview; onDone: () => void }> = ({ overview, onDone }) => {
  const { t } = useI18n();
  const s = t.deepWord.setup;
  const { prefs } = overview;
  const [enabled, setEnabled] = useState(prefs.enabled);
  const [perDay, setPerDay] = useState<1 | 2>(prefs.perDay);
  const [work, setWork] = useState(prefs.profile.work ?? '');
  const [interests, setInterests] = useState((prefs.profile.interests ?? []).join(', '));
  const [situations, setSituations] = useState((prefs.profile.situations ?? []).join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const save = async (skipProfile: boolean) => {
    setBusy(true);
    setError(null);
    const profile: Profile = { work: work.trim() || undefined, interests: splitList(interests), situations: splitList(situations) };
    try {
      await deepWordApi.setPrefs({ enabled, perDay, ...(skipProfile ? { profileSkipped: true } : { profile }) });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dw">
      <h2 className="dw__title">{s.title}</h2>
      <Card padding="lg" className="dw__card">
        <label className="dw__row">
          <input type="checkbox" role="switch" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <strong>{s.enable}</strong>
        </label>
        <div className="dw__section">
          <span className="dw__h">{s.perDay}</span>
          <Segmented
            label={s.perDay}
            value={String(perDay)}
            onChange={(v) => setPerDay(v === '2' ? 2 : 1)}
            options={[
              { value: '1', label: s.perDayOptions[1] },
              { value: '2', label: s.perDayOptions[2] },
            ]}
          />
        </div>
        <div className="dw__section">
          <h3 className="dw__h">{s.profileTitle}</h3>
          <p className="dw__muted">{s.profileBody}</p>
          <Field label={s.work}>{(id) => <TextInput id={id} value={work} maxLength={80} placeholder={s.workPlaceholder} onChange={(e) => setWork(e.target.value)} />}</Field>
          <Field label={s.interests}>{(id) => <TextInput id={id} value={interests} onChange={(e) => setInterests(e.target.value)} />}</Field>
          <Field label={s.situations}>{(id) => <TextInput id={id} value={situations} placeholder={s.situationsPlaceholder} onChange={(e) => setSituations(e.target.value)} />}</Field>
        </div>
        {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
        <div className="dw__row">
          <Button onClick={() => void save(false)} loading={busy}>
            {s.save}
          </Button>
          {!prefs.profileSkipped && !prefs.profile.work && (
            <Button variant="ghost" onClick={() => void save(true)} disabled={busy}>
              {s.skip}
            </Button>
          )}
          <Button variant="ghost" onClick={onDone} disabled={busy}>
            {t.deepWord.notebook.back}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export const DeepTab: React.FC<{ view: DeepView; onView: (view: DeepView) => void }> = ({ view, onView }) => {
  const { t } = useI18n();
  const d = t.deepWord;
  const [overview, setOverview] = useState<DeepOverview | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    deepWordApi.overview().then(setOverview).catch(setError);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const remove = async (itemId: string) => {
    await deepWordApi.queueRemove(itemId).catch(() => undefined);
    load();
  };

  if (error !== null && !overview) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!overview) return <Skeleton height={160} label={t.common.loading} />;

  if (view.type === 'setup')
    return (
      <Setup
        overview={overview}
        onDone={() => {
          load();
          onView({ type: 'overview' });
        }}
      />
    );

  const { prefs, today } = overview;
  const total = overview.stages.reduce((n, c) => n + c, 0);
  const max = Math.max(1, ...overview.stages);

  if (!prefs.enabled)
    return (
      <div className="dw">
        <EmptyState icon="sparkles" title={d.off.title} action={<Button onClick={() => onView({ type: 'setup' })}>{d.off.enable}</Button>}>
          {d.off.body}
        </EmptyState>
      </div>
    );

  return (
    <div className="dw">
      <p className="dw__muted">{d.intro}</p>

      {overview.review.welcomeBack && <Banner tone="info">{d.review.welcomeBack}</Banner>}

      <Card padding="lg" className="dw__card">
        <p className="dw__kicker">{d.today.title}</p>
        {today.word && (today.state === 'ready' || today.state === 'resume') ? (
          <>
            <div className="dw__row">
              <span className="dw__term" lang="en">
                {today.word.term}
                {today.word.ipa && <span className="dw__ipa">/{today.word.ipa}/</span>}
              </span>
              {today.word.pos && <Badge>{today.word.pos}</Badge>}
            </div>
            <p className="dw__muted">{meaningOf(today.word)}</p>
            <div className="dw__row">
              <Button size="lg" icon="chevronRight" onClick={() => onView({ type: 'session' })}>
                {today.state === 'resume' ? d.today.resume : d.today.start}
              </Button>
              <span className="dw__muted">{d.today.minutes}</span>
            </div>
          </>
        ) : today.state === 'done' ? (
          <>
            <h2 className="dw__h">
              <Icon name="check" size={18} /> {d.today.doneTitle}
            </h2>
            <p className="dw__muted">{d.today.doneBody}</p>
          </>
        ) : (
          <>
            <h2 className="dw__h">{d.today.emptyTitle}</h2>
            <p className="dw__muted">{d.today.emptyBody}</p>
          </>
        )}
      </Card>

      {overview.forgetful.length > 0 && (
        <Card padding="md" className="dw__card">
          <h2 className="dw__h">{d.forgetful.title}</h2>
          <p className="dw__muted">{d.forgetful.body}</p>
          <ul className="dw__list">
            {overview.forgetful.map((w) => (
              <li key={w.id} className="dw__item">
                <div className="dw__item-main">
                  <strong lang="en">{w.term}</strong> <span className="dw__muted">{d.forgetful.lapses(w.lapses)}</span>
                </div>
                <Button size="sm" variant="secondary" onClick={() => onView({ type: 'session', itemId: w.id, relearn: true })}>
                  {d.forgetful.relearn}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card padding="md" className="dw__card">
        <h2 className="dw__h">{d.review.cardTitle}</h2>
        {overview.review.session > 0 ? (
          <>
            <p>{d.review.cardBody(overview.review.session, overview.review.minutes)}</p>
            {overview.review.due > overview.review.session && <p className="dw__muted">{d.review.cardMore(overview.review.due - overview.review.session)}</p>}
            <div>
              <Button icon="bolt" onClick={() => onView({ type: 'review' })}>
                {d.review.start}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p>{d.review.none}</p>
            <p className="dw__muted">{d.review.noneBody}</p>
          </>
        )}
      </Card>

      <Card padding="md" className="dw__card">
        <div className="dw__row dw__row--between">
          <h2 className="dw__h">{d.stages.title}</h2>
          <Button variant="ghost" size="sm" onClick={() => onView({ type: 'notebook' })}>
            {d.notebook.open}
          </Button>
        </div>
        {total === 0 ? (
          <p className="dw__muted">{d.stages.empty}</p>
        ) : (
          <ul className="dw-funnel">
            {d.stageNames.map((name, i) => (
              <li key={name}>
                <span>{name}</span>
                <span className="dw-funnel__bar" aria-hidden="true">
                  <span style={{ width: `${(overview.stages[i] / max) * 100}%` }} />
                </span>
                <span>{d.stages.words(overview.stages[i])}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="md" className="dw__card">
        <h2 className="dw__h">{d.queue.title}</h2>
        {overview.queue.length === 0 ? (
          <p className="dw__muted">{d.queue.empty}</p>
        ) : (
          <ul className="dw__list">
            {overview.queue.map((w) => (
              <li key={w.id} className="dw__item">
                <div className="dw__item-main">
                  <button type="button" className="dw__chip" onClick={() => onView({ type: 'word', itemId: w.id })} lang="en">
                    {w.term}
                  </button>{' '}
                  <span className="dw__muted">{d.queue.sources[w.source] ?? w.source}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void remove(w.id)}>
                  {d.queue.remove}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div>
        <Button variant="ghost" icon="cpu" onClick={() => onView({ type: 'setup' })}>
          {d.setup.edit}
        </Button>
      </div>
    </div>
  );
};
