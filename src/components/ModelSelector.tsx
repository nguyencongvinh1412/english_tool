import type React from 'react';
import { useEffect, useState } from 'react';
import { fetchModels, getSelectedModel, setSelectedModel } from '@/services/api';

/**
 * AI model picker for the sidebar
 * Lists models allowed by the server (opus/fable excluded) and persists the choice.
 * Renders nothing when the AI proxy is unavailable (server falls back to Groq).
 */
export const ModelSelector: React.FC = () => {
  const [models, setModels] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    let isMounted = true;

    fetchModels().then(({ models: allowedModels, defaultModel }) => {
      if (!isMounted || allowedModels.length === 0) return;

      // Drop a stored model that is no longer allowed or available
      const storedModel = getSelectedModel();
      const initialModel =
        storedModel && allowedModels.includes(storedModel)
          ? storedModel
          : (defaultModel ?? allowedModels[0]);

      setSelectedModel(initialModel);
      setModels(allowedModels);
      setSelected(initialModel);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (models.length === 0) return null;

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    setSelectedModel(event.target.value);
    setSelected(event.target.value);
  };

  return (
    <div className="model-selector">
      <label htmlFor="model-selector" className="model-selector__label">
        AI model
      </label>
      <select
        id="model-selector"
        className="model-selector__select"
        value={selected}
        onChange={handleChange}
      >
        {models.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
    </div>
  );
};
