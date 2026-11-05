/**
 * ToolChrome
 * The frame of the grammar tools (compare, decision tree, drill): a round back button with the title and a one-line
 * subtitle, and a footer with the one primary button (fixed above the tab bar on phones).
 */
import type React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import './grammar.css';

export const ToolHeader: React.FC<{ title: React.ReactNode; subtitle?: React.ReactNode; back?: string }> = ({ title, subtitle, back = ROUTES.GRAMMAR }) => {
  const { t } = useI18n();
  return (
    <header className="tool-head">
      <Link to={back} className="grammar-point__back" aria-label={t.grammar.title}>
        <Icon name="arrowLeft" size={18} />
      </Link>
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </header>
  );
};

export const ToolFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="tool-footer">{children}</div>;
