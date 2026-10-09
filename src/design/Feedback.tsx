/**
 * Feedback components: Spinner, ProgressBar, Banner
 */
import type React from 'react';
import { Icon, type IconName } from './Icon';
import './Feedback.css';

/**
 * Circular loading indicator
 */
export const Spinner: React.FC<{ size?: number; label?: string }> = ({ size = 24, label }) => (
  <span
    className="spinner"
    style={{ width: size, height: size }}
    role={label ? 'status' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  />
);

interface ProgressBarProps {
  /** 0 - 100 */
  value: number;
  /** Fill color token name, e.g. "brand", "listening" */
  tone?: string;
  label?: string;
  size?: 'sm' | 'md';
}

/**
 * Rounded progress bar with a glossy highlight
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({ value, tone = 'brand', label, size = 'md' }) => {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      className={`progress progress--${size}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
    >
      <div className="progress__fill" style={{ width: `${clamped}%`, background: `var(--${tone})` }} />
    </div>
  );
};

type BannerTone = 'info' | 'success' | 'warning' | 'danger';

const BANNER_ICONS: Record<BannerTone, IconName> = {
  info: 'sparkles',
  success: 'check',
  warning: 'bolt',
  danger: 'x',
};

/**
 * Inline message box for errors, warnings and notices
 */
export const Banner: React.FC<{ tone?: BannerTone; children: React.ReactNode; action?: React.ReactNode }> = ({
  tone = 'info',
  children,
  action,
}) => (
  <div className={`banner banner--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
    <Icon name={BANNER_ICONS[tone]} size={18} />
    <div className="banner__body">{children}</div>
    {action}
  </div>
);
