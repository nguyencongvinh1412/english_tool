/**
 * Button
 * Chunky "sticker" button with a 3D bottom edge that presses down on click
 */
import type React from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Feedback';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'exam' | 'danger' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  /** Icon shown before the label */
  icon?: IconName;
  /** Shows a spinner and disables the button */
  loading?: boolean;
  /** Stretch to the container width */
  block?: boolean;
}

interface LinkButtonProps extends Omit<LinkProps, 'className'> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  block?: boolean;
  className?: string;
}

/**
 * Router link that looks like a Button (avoids nesting a button inside a link)
 */
export const LinkButton: React.FC<LinkButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  block = false,
  className = '',
  children,
  ...rest
}) => (
  <Link className={`btn btn--${variant} btn--${size} ${block ? 'btn--block' : ''} ${className}`} {...rest}>
    {icon && <Icon name={icon} size={size === 'sm' ? 16 : 20} />}
    {children && <span>{children}</span>}
  </Link>
);

/**
 * Primary action button
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  block = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    className={`btn btn--${variant} btn--${size} ${block ? 'btn--block' : ''} ${className}`}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    {...rest}
  >
    {loading ? <Spinner size={18} /> : icon && <Icon name={icon} size={size === 'sm' ? 16 : 20} />}
    {children && <span>{children}</span>}
  </button>
);
