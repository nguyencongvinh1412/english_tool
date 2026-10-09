/**
 * ContentLibrary
 * Lists exercises of one kind with a level filter, best scores, and an AI generator
 */
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Banner, Button, Card, EmptyState, PageHeader, Segmented, Spinner, TextInput } from '@/design';
import type { IconName } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import {
  CONTENT_LEVELS,
  contentApi,
  type CefrLevel,
  type ContentItem,
  type ContentKind,
  type ContentSummary,
  type WritingTask,
} from '@/shared/contentApi';
import './practice.css';

type LevelFilter = CefrLevel | 'all';

interface ContentLibraryProps<P> {
  kind: ContentKind;
  writingTask?: WritingTask;
  /** Skill token for accents, e.g. "reading" */
  tone: string;
  icon: IconName;
  eyebrow: string;
  title: string;
  description: string;
  /** Default level for generation when "All" is selected */
  defaultLevel?: CefrLevel;
  /** Scores are band scores (0-9) instead of percentages */
  bandScores?: boolean;
  onOpen: (item: ContentItem<P>) => void;
}

export function ContentLibrary<P>({
  kind,
  writingTask,
  tone,
  icon,
  eyebrow,
  title,
  description,
  defaultLevel = 'B1',
  bandScores = false,
  onOpen,
}: ContentLibraryProps<P>): React.JSX.Element {
  const { t } = useI18n();
  const [level, setLevel] = useState<LevelFilter>('all');
  const [items, setItems] = useState<ContentSummary[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [topic, setTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<unknown>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    contentApi
      .list(kind, level === 'all' ? undefined : level, writingTask)
      .then(({ items: list }) => !cancelled && setItems(list))
      .catch((error) => !cancelled && setLoadError(error));
    return () => {
      cancelled = true;
    };
  }, [kind, level, writingTask]);

  const open = useCallback(
    async (id: string) => {
      setOpeningId(id);
      try {
        const { item } = await contentApi.get<P>(id);
        onOpen(item);
      } catch (error) {
        setLoadError(error);
        setOpeningId(null);
      }
    },
    [onOpen]
  );

  const generate = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const { item } = await contentApi.generate<P>({
        kind,
        level: level === 'all' ? defaultLevel : level,
        topic: topic.trim() || undefined,
        writingTask,
      });
      onOpen(item);
    } catch (error) {
      setGenerateError(error);
      setIsGenerating(false);
    }
  };

  const bestLabel = (best: number): string => (bandScores ? t.library.bestBand(Math.round((best / 100) * 9 * 2) / 2) : t.library.best(best));

  return (
    <div className="practice" style={{ ['--skill' as string]: `var(--${tone})`, ['--skill-edge' as string]: `var(--${tone}-edge)` }}>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <Segmented<LevelFilter>
        label={t.library.level}
        value={level}
        onChange={(next) => {
          setItems(null);
          setLevel(next);
        }}
        options={[{ value: 'all', label: t.library.all, tone }, ...CONTENT_LEVELS.map((l) => ({ value: l, label: l, tone }))]}
      />

      {loadError !== null && <Banner tone="danger">{errorMessage(loadError, t)}</Banner>}

      {items === null ? (
        <div className="practice__loading">
          <Spinner size={30} label={t.common.loading} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={icon} title={t.common.comingSoon}>
          {t.library.empty}
        </EmptyState>
      ) : (
        <div className="library-grid">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="library-btn reveal"
              style={{ ['--i' as string]: Math.min(index, 8) }}
              onClick={() => open(item.id)}
              disabled={openingId !== null}
            >
              <Card interactive tone={tone} className="library-card">
                <div className="library-card__badges">
                  {item.level && <Badge tone="neutral">{item.level}</Badge>}
                  <Badge tone={item.source === 'ai' ? 'listening' : 'brand'} icon={item.source === 'ai' ? 'sparkles' : undefined}>
                    {item.source === 'ai' ? t.library.aiMade : t.library.builtIn}
                  </Badge>
                </div>
                <h3 className="library-card__title" lang="en">
                  {item.title}
                </h3>
                {item.topic && <p className="library-card__topic">{item.topic}</p>}
                {item.best !== null && (
                  <Badge tone={item.best >= 80 ? 'success' : 'warning'} icon="check">
                    {bestLabel(item.best)}
                  </Badge>
                )}
                {openingId === item.id && <Spinner size={18} />}
              </Card>
            </button>
          ))}
        </div>
      )}

      <Card padding="lg" className="library-generator">
        <h2 className="library-generator__title">
          {t.library.generateTitle} · {level === 'all' ? defaultLevel : level}
        </h2>
        <p className="library-generator__body">{t.library.generateBody}</p>
        <form className="library-generator__form" onSubmit={generate}>
          <TextInput
            aria-label={t.library.topicPlaceholder}
            placeholder={t.library.topicPlaceholder}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            maxLength={100}
            disabled={isGenerating}
          />
          <Button type="submit" icon="sparkles" loading={isGenerating}>
            {t.library.generate}
          </Button>
        </form>
        {isGenerating && <p className="library-generator__wait">{t.library.generating}</p>}
        {generateError !== null && <Banner tone="danger">{errorMessage(generateError, t)}</Banner>}
      </Card>
    </div>
  );
}
