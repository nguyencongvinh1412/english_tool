/**
 * Surface components: Card, Badge, StatTile, EmptyState, PageHeader
 */
import type React from 'react';
import { Icon, type IconName } from './Icon';
import './Surface.css';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds the 3D bottom edge and hover lift, for clickable cards */
  interactive?: boolean;
  /** Skill/brand token used for the accent edge, e.g. "listening" */
  tone?: string;
  padding?: 'sm' | 'md' | 'lg';
}

/**
 * Bordered "sticker" card
 */
export const Card: React.FC<CardProps> = ({
  interactive = false,
  tone,
  padding = 'md',
  className = '',
  style,
  ...rest
}) => (
  <div
    className={`card card--pad-${padding} ${interactive ? 'card--interactive' : ''} ${tone ? 'card--toned' : ''} ${className}`}
    style={tone ? { ...style, ['--card-tone' as string]: `var(--${tone})`, ['--card-tone-edge' as string]: `var(--${tone}-edge, var(--${tone}))` } : style}
    {...rest}
  />
);

type BadgeTone = 'neutral' | 'brand' | 'exam' | 'success' | 'warning' | 'danger' | 'listening' | 'reading' | 'speaking' | 'writing';

/**
 * Small pill label
 */
export const Badge: React.FC<{ tone?: BadgeTone; icon?: IconName; children: React.ReactNode }> = ({
  tone = 'neutral',
  icon,
  children,
}) => (
  <span className={`badge badge--${tone}`}>
    {icon && <Icon name={icon} size={14} />}
    {children}
  </span>
);

/**
 * Big number with a label, used on the dashboard and profile
 */
export const StatTile: React.FC<{ icon: IconName; tone: string; value: React.ReactNode; label: string }> = ({
  icon,
  tone,
  value,
  label,
}) => (
  <div className="stat-tile">
    <span className="stat-tile__icon" style={{ color: `var(--${tone})` }}>
      <Icon name={icon} size={26} />
    </span>
    <span className="stat-tile__value">{value}</span>
    <span className="stat-tile__label">{label}</span>
  </div>
);

/**
 * Friendly placeholder for empty lists and not-yet-built sections
 */
export const EmptyState: React.FC<{ icon: IconName; title: string; children?: React.ReactNode; action?: React.ReactNode }> = ({
  icon,
  title,
  children,
  action,
}) => (
  <div className="empty-state">
    <span className="empty-state__icon">
      <Icon name={icon} size={34} />
    </span>
    <h3 className="empty-state__title">{title}</h3>
    {children && <div className="empty-state__body">{children}</div>}
    {action}
  </div>
);

/**
 * Page title block with optional eyebrow, description and actions
 */
export const PageHeader: React.FC<{
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, description, actions }) => (
  <header className="page-head reveal">
    <div className="page-head__text">
      {eyebrow && <p className="page-head__eyebrow">{eyebrow}</p>}
      <h1 className="page-head__title">{title}</h1>
      {description && <p className="page-head__description">{description}</p>}
    </div>
    {actions && <div className="page-head__actions">{actions}</div>}
  </header>
);
