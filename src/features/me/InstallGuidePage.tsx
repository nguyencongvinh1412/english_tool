/**
 * InstallGuidePage
 * Three steps to add the app to an iPhone's home screen. Each step has a drawn illustration; real screenshots can be
 * added to STEP_IMAGES later and replace the drawings without touching the layout.
 */
import type React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { ToolFooter, ToolHeader } from '@/features/grammar/ToolChrome';
import { dismissInstallHint } from '@/shared/installHint';
import './install.css';

/** Screenshots of the three steps, when there are any (paths under /public); otherwise the drawings are shown */
const STEP_IMAGES: (string | undefined)[] = [undefined, undefined, undefined];

const Art: React.FC<{ step: number; label: string }> = ({ step, label }) => {
  const image = STEP_IMAGES[step];
  if (image) return <img className="install-step__art" src={image} alt={label} width={96} height={72} />;
  return (
    <svg className="install-step__art" viewBox="0 0 96 72" role="img" aria-label={label}>
      <rect x="1" y="1" width="94" height="70" rx="10" fill="var(--surface-3)" stroke="var(--border)" />
      {step === 0 && (
        <>
          <rect x="14" y="52" width="68" height="10" rx="5" fill="var(--surface)" stroke="var(--border-strong)" />
          <g fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M48 36V14" />
            <path d="M40 22l8-8 8 8" />
            <path d="M38 28h-4v14h28V28h-4" />
          </g>
        </>
      )}
      {step === 1 && (
        <>
          <rect x="16" y="12" width="64" height="12" rx="4" fill="var(--surface)" stroke="var(--border-strong)" />
          <rect x="16" y="28" width="64" height="14" rx="4" fill="var(--brand-soft)" stroke="var(--brand)" strokeWidth="2" />
          <rect x="16" y="46" width="64" height="12" rx="4" fill="var(--surface)" stroke="var(--border-strong)" />
          <g stroke="var(--brand)" strokeWidth="3" strokeLinecap="round">
            <path d="M68 35h8" />
            <path d="M72 31v8" />
          </g>
        </>
      )}
      {step === 2 && (
        <>
          <rect x="30" y="14" width="36" height="36" rx="9" fill="var(--brand)" />
          <text x="48" y="39" textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff" fontFamily="sans-serif">
            Aa
          </text>
          <rect x="34" y="58" width="28" height="4" rx="2" fill="var(--border-strong)" />
        </>
      )}
    </svg>
  );
};

export const InstallGuidePage: React.FC = () => {
  const { t } = useI18n();
  const g = t.install;
  const navigate = useNavigate();
  const leave = () => {
    dismissInstallHint();
    navigate(ROUTES.ME);
  };

  return (
    <div className="tool-page">
      <ToolHeader title={g.title} back={ROUTES.ME} />
      <Card padding="lg">
        <h2 className="install__heading">{g.heading}</h2>
        <p className="grammar__hint">{g.intro}</p>
      </Card>
      <ol className="install-steps">
        {g.steps.map((text, i) => (
          <li key={text}>
            <Card padding="md" className="install-step">
              <span className="install-step__n" aria-hidden="true">
                {i + 1}
              </span>
              <strong>{text}</strong>
              <Art step={i} label={g.artLabels[i]} />
            </Card>
          </li>
        ))}
      </ol>
      <p className="grammar__hint">{g.note}</p>
      <ToolFooter>
        <Button size="lg" onClick={leave}>
          {g.understood}
        </Button>
        <button type="button" className="tool-footer__link" onClick={leave}>
          {g.later}
        </button>
      </ToolFooter>
    </div>
  );
};
