/**
 * PrivacyPage
 * Plain-language privacy notice; readable without signing in
 */
import type React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Icon } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { Logo } from '@/app/AppShell';
import { LocaleToggle } from '@/app/LocaleToggle';
import './privacy.css';

export const PrivacyPage: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <div className="privacy">
      <header className="privacy__bar">
        <Logo />
        <LocaleToggle />
      </header>

      <main className="privacy__main">
        <div className="privacy__head">
          <button type="button" className="privacy__back" aria-label={t.privacy.back} onClick={() => navigate(-1)}>
            <Icon name="arrowLeft" size={18} />
          </button>
          <div>
            <h1 className="privacy__title">{t.privacy.title}</h1>
            <p className="privacy__updated">{t.privacy.updated}</p>
          </div>
        </div>
        <p className="privacy__intro">{t.privacy.intro}</p>

        <Card padding="lg" className="privacy__card">
          {t.privacy.sections.map((section) => (
            <section key={section.title} className="privacy__section">
              <h2>{section.title}</h2>
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </Card>
      </main>
    </div>
  );
};
