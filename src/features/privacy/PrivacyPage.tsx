/**
 * PrivacyPage
 * Plain-language privacy notice; readable without signing in
 */
import type React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card } from '@/design';
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
        <Button variant="ghost" size="sm" icon="arrowLeft" onClick={() => navigate(-1)}>
          {t.privacy.back}
        </Button>
        <h1 className="privacy__title">{t.privacy.title}</h1>
        <p className="privacy__updated">{t.privacy.updated}</p>
        <p className="privacy__intro">{t.privacy.intro}</p>

        {t.privacy.sections.map((section) => (
          <Card key={section.title} padding="lg" className="privacy__section">
            <h2>{section.title}</h2>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>
        ))}
      </main>
    </div>
  );
};
