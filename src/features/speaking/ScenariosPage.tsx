/**
 * ScenariosPage
 * Pick a real-life situation, then role-play it with the AI
 */
import type React from 'react';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, Icon, PageHeader } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useClaude } from '@/hooks';
import { SCENARIOS, type Scenario, type ScenarioDifficulty } from '@/constants/scenarios';
import { ChatPanel } from './ChatPanel';
import { useSessionRecorder } from './useSessionRecorder';

const DIFFICULTY_TONES: Record<ScenarioDifficulty, 'success' | 'warning' | 'danger'> = {
  beginner: 'success',
  intermediate: 'warning',
  advanced: 'danger',
};

/**
 * Role-play view for one scenario (remounted per scenario so chat state resets)
 */
const ScenarioSession: React.FC<{ scenario: Scenario; onBack: () => void }> = ({ scenario, onBack }) => {
  const { t } = useI18n();
  const context = useMemo(
    () => ({
      mode: 'scenario' as const,
      scenario: { aiRole: scenario.aiRole, userRole: scenario.userRole, context: scenario.context, difficulty: scenario.difficulty },
    }),
    [scenario]
  );
  const { messages, isLoading, error, sendUserMessage } = useClaude({ context });

  useSessionRecorder(messages, { key: scenario.id, activity: 'scenario', contentRef: scenario.id, title: scenario.title });

  return (
    <div className="speak">
      <div>
        <Button variant="ghost" icon="arrowLeft" onClick={onBack}>
          {t.scenarios.back}
        </Button>
      </div>

      <Card padding="lg" tone="speaking" className="scene-brief">
        <div className="scene-brief__head">
          <h1 className="scene-brief__title">{scenario.title}</h1>
          <Badge tone={DIFFICULTY_TONES[scenario.difficulty]}>{t.scenarios.difficulty[scenario.difficulty]}</Badge>
        </div>
        <p className="scene-brief__context" lang="en">
          {scenario.context}
        </p>
        <div className="scene-brief__roles">
          <span className="role-pill role-pill--you">
            <Icon name="user" size={16} /> {t.scenarios.youAre}: <strong lang="en">{scenario.userRole}</strong>
          </span>
          <span className="role-pill role-pill--ai">
            <Icon name="sparkles" size={16} /> {t.scenarios.aiIs}: <strong lang="en">{scenario.aiRole}</strong>
          </span>
        </div>
      </Card>

      <ChatPanel
        messages={messages}
        isLoading={isLoading}
        error={error}
        onSend={sendUserMessage}
        suggestions={messages.length < 4 ? scenario.suggestedPrompts : undefined}
        suggestionsLabel={t.scenarios.suggestions}
      />
    </div>
  );
};

export const ScenariosPage: React.FC = () => {
  const { t } = useI18n();
  const [active, setActive] = useState<Scenario | null>(null);

  if (active) {
    return <ScenarioSession key={active.id} scenario={active} onBack={() => setActive(null)} />;
  }

  return (
    <div className="speak">
      <PageHeader eyebrow={t.nav.speaking} title={t.scenarios.title} description={t.scenarios.description} />

      <div className="scene-grid">
        {SCENARIOS.map((scenario, index) => (
          <button
            key={scenario.id}
            type="button"
            className="scene-btn reveal"
            style={{ ['--i' as string]: index }}
            onClick={() => setActive(scenario)}
          >
            <Card interactive tone="speaking" className="scene-card">
              <div className="scene-card__head">
                <h2 className="scene-card__title">{scenario.title}</h2>
                <Badge tone={DIFFICULTY_TONES[scenario.difficulty]}>{t.scenarios.difficulty[scenario.difficulty]}</Badge>
              </div>
              <p className="scene-card__description" lang="en">
                {scenario.description}
              </p>
              <p className="scene-card__roles" lang="en">
                {scenario.userRole} ↔ {scenario.aiRole}
              </p>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
};
