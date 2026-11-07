/**
 * MePage
 * One page of settings, grouped: goal, plan and credits, settings, tools, appearance and account.
 * It is a list of settings, so unlike other pages it has no main button.
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Icon, Segmented, Tag } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth, useCurrentUser } from '@/app/AuthProvider';
import { ROUTES } from '@/app/routes';
import { hasRoadmap, roadmapApi } from '@/shared/roadmapApi';
import { placementApi } from '@/shared/placementApi';
import { billingApi, tasksLeft } from '@/shared/billingApi';
import { useFuriganaPreference, type FuriganaMode } from '@/shared/ja/furigana';
import { ACCENTS, THEME_MODES, useAccent, useTheme, type Accent } from '@/shared/theme';
import './me.css';

interface RowProps {
  label: string;
  value?: React.ReactNode;
  to?: string;
  tag?: string;
  control?: React.ReactNode;
}

/** One settings row: a link (chevron), a plain value, or an inline control */
const Row: React.FC<RowProps> = ({ label, value, to, tag, control }) => {
  const body = (
    <>
      <span className="me__row-label">{label}</span>
      <span className="me__row-side">
        {tag && <Tag tone="notice">{tag}</Tag>}
        {value !== undefined && <span className="me__row-value">{value}</span>}
        {control}
        {to && <Icon name="chevronRight" size={18} />}
      </span>
    </>
  );
  return <li>{to ? <Link to={to} className="me__row">{body}</Link> : <div className="me__row">{body}</div>}</li>;
};

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="me__group">
    <h2 className="me__group-title">{title}</h2>
    <Card padding="sm">
      <ul className="me__rows">{children}</ul>
    </Card>
  </section>
);

export const MePage: React.FC = () => {
  const { t, locale } = useI18n();
  const user = useCurrentUser();
  const { logout, changeLocale } = useAuth();
  const [mode, setMode] = useTheme();
  const [accent, setAccent] = useAccent();
  const [furigana, setFurigana] = useFuriganaPreference();
  const [planName, setPlanName] = useState<string | null>(null);
  const [roadmapPct, setRoadmapPct] = useState<number | null | undefined>(undefined);
  const [placementLevel, setPlacementLevel] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    billingApi
      .plans()
      .then((info) => setPlanName(info.plans.find((p) => p.id === info.current.planId)?.name ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    roadmapApi
      .get()
      .then((d) => setRoadmapPct(hasRoadmap(d) ? Math.round(d.progress.overall * 100) : null))
      .catch(() => {});
    placementApi
      .get()
      .then((d) => setPlacementLevel(d.latest?.overall ?? null))
      .catch(() => {});
  }, []);

  const checks = tasksLeft(user.credits, 'writing');
  const creditsValue = checks === null ? t.me.values.unlimited : checks <= 0 ? t.me.values.creditsOut : t.today.creditsChip(checks);
  const goalText =
    user.studyLanguage === 'ja'
      ? user.jaTargetLevel
        ? `JLPT ${user.jaTargetLevel}`
        : t.me.values.noGoal
      : user.targetExam === 'toeic' || user.targetExam === 'ielts'
        ? `${user.targetExam.toUpperCase()}${user.targetScore ? ` ${user.targetScore}` : ''}`
        : user.cefrLevel
          ? user.cefrLevel
          : t.me.values.noGoal;

  return (
    <div className="me">
      <h1 className="me__title">{t.me.title}</h1>

      <div className="me__cols">
        <Group title={t.me.groups.goal}>
          <Row label={t.me.rows.goal} value={goalText} to={ROUTES.ME_ACCOUNT} />
          <Row
            label={t.me.rows.roadmap}
            value={roadmapPct === undefined ? '…' : roadmapPct === null ? t.me.values.noRoadmap : t.me.values.roadmapProgress(roadmapPct)}
            to={roadmapPct === null ? ROUTES.ROADMAP_NEW : ROUTES.ROADMAP}
          />
          <Row label={t.me.rows.placement} value={placementLevel === undefined ? '…' : (placementLevel ?? t.me.values.noPlacement)} to={ROUTES.PLACEMENT} />
        </Group>

        <Group title={t.me.groups.plan}>
          <Row label={t.me.rows.plan} value={planName ?? '…'} to={ROUTES.ME_PLAN} />
          <Row label={t.me.rows.credits} value={creditsValue} to={ROUTES.ME_PLAN} tag={checks !== null && checks <= 0 ? t.me.values.creditsOut : undefined} />
          <Row label={t.me.rows.model} to={ROUTES.ME_PLAN} />
        </Group>

        <Group title={t.me.groups.settings}>
          <Row
            label={t.me.rows.language}
            control={
              <Segmented
                label={t.me.rows.language}
                value={locale}
                onChange={changeLocale}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'vi', label: 'Tiếng Việt' },
                ]}
              />
            }
          />
          <Row label={t.me.rows.notifications} to={ROUTES.ME_NOTIFICATIONS} />
          <Row label={t.me.rows.install} to={ROUTES.ME_INSTALL} />
          {user.studyLanguage === 'ja' && (
            <Row
              label={t.me.rows.furigana}
              control={
                <Segmented
                  label={t.me.rows.furigana}
                  value={(furigana ?? 'always') as FuriganaMode}
                  onChange={setFurigana}
                  options={(['always', 'tap', 'off'] as FuriganaMode[]).map((value) => ({ value, label: t.japanese.furigana[value] }))}
                />
              }
            />
          )}
        </Group>

        <Group title={t.me.groups.tools}>
          <Row label={t.me.rows.maps} to={ROUTES.MAPS} />
          <Row label={t.me.rows.privacy} to={ROUTES.PRIVACY} />
          {user.role === 'admin' && <Row label={t.me.admin} value={t.me.adminHint} to={ROUTES.ADMIN} />}
        </Group>

        <section className="me__group">
          <h2 className="me__group-title">{t.me.groups.appearance}</h2>
          <Card className="me__appearance">
            <div className="me__field">
              <span className="me__row-label">{t.me.appearance.accent}</span>
              <div className="me__swatches" role="group" aria-label={t.me.appearance.accent}>
                {ACCENTS.map((value: Accent) => (
                  <button key={value} type="button" aria-pressed={accent === value} className={`me__swatch me__swatch--${value} ${accent === value ? 'me__swatch--on' : ''}`} onClick={() => setAccent(value)}>
                    <span className="me__dot" aria-hidden="true" />
                    {accent === value ? '✓ ' : ''}
                    {t.me.appearance.accents[value]}
                  </button>
                ))}
              </div>
            </div>
            <div className="me__field">
              <span className="me__row-label">{t.me.appearance.mode}</span>
              <Segmented label={t.me.appearance.mode} value={mode} onChange={setMode} options={THEME_MODES.map((value) => ({ value, label: t.me.appearance.modes[value] }))} />
            </div>
            <p className="me__hint">{t.me.appearance.saved}</p>
          </Card>
        </section>

        <Group title={t.me.groups.account}>
          <Row label={t.me.rows.account} to={ROUTES.ME_ACCOUNT} />
        </Group>
      </div>

      <Button variant="secondary" onClick={logout} icon="logout">
        {t.me.signOut}
      </Button>
    </div>
  );
};
