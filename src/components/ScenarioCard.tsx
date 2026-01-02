/**
 * ScenarioCard Component
 * Displays a scenario as a selectable card with title, description, and metadata
 */

import type React from 'react';
import type { Scenario } from '@/constants/scenarios';

/** Props for the ScenarioCard component */
interface ScenarioCardProps {
  /** The scenario to display */
  scenario: Scenario;
  /** Callback when the scenario is selected */
  onSelect: (scenario: Scenario) => void;
}

/**
 * Displays a scenario card with title, description, difficulty badge, and role information
 * Clicking the card selects the scenario for practice
 *
 * @param props - Component props
 * @returns ScenarioCard JSX element
 *
 * @example
 * ```tsx
 * <ScenarioCard
 *   scenario={scenario}
 *   onSelect={(s) => setActiveScenario(s)}
 * />
 * ```
 */
export const ScenarioCard: React.FC<ScenarioCardProps> = ({ scenario, onSelect }) => {
  const handleClick = () => {
    onSelect(scenario);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(scenario);
    }
  };

  return (
    <div
      className="scenario-card"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Select ${scenario.title} scenario`}
    >
      <h3 className="scenario-card__title">{scenario.title}</h3>
      <p className="scenario-card__description">{scenario.description}</p>
      <div className="scenario-card__meta">
        <span className={`scenario-card__difficulty scenario-card__difficulty--${scenario.difficulty}`}>
          {scenario.difficulty}
        </span>
        <span className="scenario-card__roles">
          {scenario.userRole} ↔ {scenario.aiRole}
        </span>
      </div>
    </div>
  );
};
