/**
 * ScenarioContext Component
 * Displays the active scenario context information with a back navigation button
 */

import type React from 'react';
import type { Scenario } from '@/constants/scenarios';

/** Props for the ScenarioContext component */
interface ScenarioContextProps {
  /** The active scenario to display */
  scenario: Scenario;
  /** Callback when the back button is clicked */
  onBack: () => void;
}

/**
 * Displays the context panel for an active scenario
 * Shows scenario title, context description, and role assignments
 *
 * @param props - Component props
 * @returns ScenarioContext JSX element
 *
 * @example
 * ```tsx
 * <ScenarioContext
 *   scenario={activeScenario}
 *   onBack={() => setActiveScenario(null)}
 * />
 * ```
 */
export const ScenarioContext: React.FC<ScenarioContextProps> = ({ scenario, onBack }) => {
  return (
    <div className="scenario-context">
      <button
        type="button"
        className="scenario-context__back-btn"
        onClick={onBack}
        aria-label="Go back to scenario selection"
      >
        ← Back to Scenarios
      </button>
      <h2 className="scenario-context__title">{scenario.title}</h2>
      <div className="scenario-context__details">
        <p className="scenario-context__item">
          <strong>Context:</strong> {scenario.context}
        </p>
        <p className="scenario-context__item">
          <strong>Your role:</strong> {scenario.userRole}
        </p>
        <p className="scenario-context__item">
          <strong>AI plays:</strong> {scenario.aiRole}
        </p>
      </div>
    </div>
  );
};
