/**
 * ContentLibrary
 * Lists exercises of one kind, a page at a time, with keyword search, a level filter and a "show" filter.
 * Learners can hide an exercise from their own list; authors and admins can delete AI-made ones.
 * Also hosts the AI generator for new exercises.
 */
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Banner, Button, Card, EmptyState, Icon, Modal, PageHeader, Segmented, Select, Spinner, TextInput } from '@/design';
import type { IconName } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import {
  CONTENT_LEVELS,
  LIBRARY_FILTERS,
  contentApi,
  type ContentLevel,
  type ContentItem,
  type ContentKind,
  type ContentSummary,
  type LibraryFilter,
  type WritingTask,
} from '@/shared/contentApi';
import { JaText } from '@/shared/ja/JaText';
import { plainText } from '@/shared/ja/text';
import './practice.css';

type LevelFilter = ContentLevel | 'all';

/** Exercises fetched per page */
const PAGE_SIZE = 12;
/** Pause after the last keystroke before searching */
const SEARCH_DELAY_MS = 300;

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
  defaultLevel?: ContentLevel;
  /** Level filter options (CEFR for English, JLPT for Japanese) */
  levels?: readonly ContentLevel[];
  /** Scores are band scores (0-9) instead of percentages */
  bandScores?: boolean;
  onOpen: (item: ContentItem<P>) => void;
}

interface Listing {
  items: ContentSummary[];
  total: number;
  hasMore: boolean;
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
  levels = CONTENT_LEVELS,
  bandScores = false,
  onOpen,
}: ContentLibraryProps<P>): React.JSX.Element {
  const { t } = useI18n();
  const [level, setLevel] = useState<LevelFilter>('all');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [search, setSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const [listing, setListing] = useState<Listing | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [topic, setTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<unknown>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ContentSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // The typed text becomes the search keyword once typing pauses
  useEffect(() => {
    const timer = window.setTimeout(() => setKeyword(search.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  // First page, whenever what is listed changes
  useEffect(() => {
    let cancelled = false;
    setListing(null);
    setLoadError(null);
    contentApi
      .list(kind, { level: level === 'all' ? undefined : level, writingTask, q: keyword || undefined, filter, limit: PAGE_SIZE })
      .then((page) => !cancelled && setListing(page))
      .catch((error) => !cancelled && setLoadError(error));
    return () => {
      cancelled = true;
    };
  }, [kind, level, writingTask, keyword, filter]);

  const loadMore = async (): Promise<void> => {
    if (!listing) return;
    setIsLoadingMore(true);
    try {
      const page = await contentApi.list(kind, {
        level: level === 'all' ? undefined : level,
        writingTask,
        q: keyword || undefined,
        filter,
        limit: PAGE_SIZE,
        offset: listing.items.length,
      });
      setListing((current) => {
        if (!current) return current;
        const seen = new Set(current.items.map((item) => item.id));
        return { ...page, items: [...current.items, ...page.items.filter((item) => !seen.has(item.id))] };
      });
    } catch (error) {
      setLoadError(error);
    } finally {
      setIsLoadingMore(false);
    }
  };

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

  /** Drops an item from the list on screen after it left this view */
  const dropFromList = (id: string): void =>
    setListing((current) => (current ? { ...current, total: Math.max(0, current.total - 1), items: current.items.filter((item) => item.id !== id) } : current));

  const toggleHidden = async (item: ContentSummary): Promise<void> => {
    try {
      await (item.hidden ? contentApi.unhide(item.id) : contentApi.hide(item.id));
      // In "all" views a hidden item leaves; in the "hidden" view a restored item leaves
      dropFromList(item.id);
    } catch (error) {
      setLoadError(error);
    }
  };

  const confirmDelete = async (): Promise<void> => {
    if (!toDelete) return;
    setIsDeleting(true);
    try {
      await contentApi.remove(toDelete.id);
      dropFromList(toDelete.id);
      setToDelete(null);
    } catch (error) {
      setLoadError(error);
      setToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

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
  const isJa = kind.startsWith('ja-');
  const isFiltered = keyword !== '' || filter !== 'all' || level !== 'all';

  return (
    <div className="practice" style={{ ['--skill' as string]: `var(--${tone})`, ['--skill-edge' as string]: `var(--${tone}-edge)` }}>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <div className="library-tools">
        <label className="library-search">
          <Icon name="search" size={18} />
          <TextInput
            type="search"
            aria-label={t.library.search}
            placeholder={t.library.search}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={100}
          />
        </label>
        <label className="library-show">
          <span>{t.library.show}</span>
          <Select value={filter} onChange={(event) => setFilter(event.target.value as LibraryFilter)}>
            {LIBRARY_FILTERS.map((value) => (
              <option key={value} value={value}>
                {t.library.filters[value]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <Segmented<LevelFilter>
        label={t.library.level}
        value={level}
        onChange={setLevel}
        options={[{ value: 'all', label: t.library.all, tone }, ...levels.map((l) => ({ value: l, label: l, tone }))]}
      />

      {loadError !== null && <Banner tone="danger">{errorMessage(loadError, t)}</Banner>}

      {listing === null ? (
        <div className="practice__loading">
          <Spinner size={30} label={t.common.loading} />
        </div>
      ) : listing.items.length === 0 ? (
        <EmptyState icon={icon} title={filter === 'hidden' ? t.library.noneHidden : isFiltered ? t.library.noMatches : t.common.comingSoon}>
          {isFiltered ? null : t.library.empty}
        </EmptyState>
      ) : (
        <>
          <div className="library-grid">
            {listing.items.map((item, index) => (
              <div key={item.id} className="library-item">
                <button
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
                    <h3 className="library-card__title" lang={isJa ? undefined : 'en'}>
                      {isJa ? <JaText text={item.title} /> : item.title}
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
                <div className="library-item__actions">
                  <button
                    type="button"
                    className="library-action"
                    onClick={() => void toggleHidden(item)}
                    aria-label={item.hidden ? t.library.unhide : t.library.hide}
                    title={item.hidden ? t.library.unhide : t.library.hide}
                  >
                    <Icon name={item.hidden ? 'eye' : 'eyeOff'} size={16} />
                  </button>
                  {item.canDelete && (
                    <button
                      type="button"
                      className="library-action library-action--danger"
                      onClick={() => setToDelete(item)}
                      aria-label={t.library.remove}
                      title={t.library.remove}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="library-more">
            <span className="library-more__count">{t.library.showing(listing.items.length, listing.total)}</span>
            {listing.hasMore && (
              <Button variant="secondary" icon="plus" onClick={() => void loadMore()} loading={isLoadingMore}>
                {t.library.loadMore}
              </Button>
            )}
          </div>
        </>
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

      <Modal
        open={toDelete !== null}
        title={t.library.removeTitle}
        onClose={() => setToDelete(null)}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              {t.common.cancel}
            </Button>
            <Button variant="danger" icon="trash" loading={isDeleting} onClick={() => void confirmDelete()}>
              {t.library.removeConfirm}
            </Button>
          </>
        }
      >
        {toDelete && <p>{t.library.removeBody(isJa ? plainText(toDelete.title) : toDelete.title)}</p>}
      </Modal>
    </div>
  );
}
