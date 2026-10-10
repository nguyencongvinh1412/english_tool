/**
 * ModelPicker
 * Lets the user choose among the AI models assigned to them.
 * Hidden when the proxy is unavailable or only one model is assigned.
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Select } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { fetchModels, getSelectedModel, setSelectedModel } from '@/services/api';

export const ModelPicker: React.FC = () => {
  const { t } = useI18n();
  const [models, setModels] = useState<string[]>([]);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    let isMounted = true;

    fetchModels().then(({ models: allowed, defaultModel }) => {
      if (!isMounted || allowed.length === 0) return;

      // Drop a stored model that is no longer assigned to this user
      const stored = getSelectedModel();
      const initial = stored && allowed.includes(stored) ? stored : (defaultModel ?? allowed[0]);

      setSelectedModel(initial);
      setModels(allowed);
      setSelected(initial);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (models.length < 2) return null;

  return (
    <label className="model-picker">
      <span className="model-picker__label">{t.shell.aiModel}</span>
      <Select
        className="model-picker__select"
        value={selected}
        onChange={(event) => {
          setSelectedModel(event.target.value);
          setSelected(event.target.value);
        }}
      >
        {models.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </Select>
    </label>
  );
};
