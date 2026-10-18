/**
 * MapsPage
 * The learner's mind maps: create one (blank or from a grammar topic), open, delete
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Banner, Button, Card, EmptyState, Field, Modal, PageHeader, Segmented, Select, Spinner, TextInput, useToast } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { useCurrentUser } from '@/app/AuthProvider';
import { ROUTES } from '@/app/routes';
import { errorMessage } from '@/shared/http';
import { grammarApi, type GrammarCluster } from '@/shared/grammarApi';
import { mapsApi, type MapSummary } from '@/shared/mapsApi';
import { useMapProposal } from './useMapProposal';
import './maps.css';

type Template = 'blank' | 'cluster' | 'compare' | 'outline';

export const MapsPage: React.FC = () => {
  const { t, locale, formatDate } = useI18n();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const toast = useToast();
  const [maps, setMaps] = useState<MapSummary[] | null>(null);
  const [limit, setLimit] = useState(20);
  const [error, setError] = useState<unknown>(null);
  const [clusters, setClusters] = useState<GrammarCluster[]>([]);
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<Template>('blank');
  const [clusterId, setClusterId] = useState('');
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<MapSummary | null>(null);

  const english = user.studyLanguage === 'en';
  const [topic, setTopic] = useState('');
  const [focus, setFocus] = useState('');
  const { propose, dialog, asking } = useMapProposal(({ map }) => navigate(`${ROUTES.MAPS}/${map.id}`));

  useEffect(() => {
    mapsApi
      .list()
      .then((result) => {
        setMaps(result.maps);
        setLimit(result.limit);
      })
      .catch(setError);
    if (english) {
      grammarApi
        .map()
        .then((map) => {
          setClusters(map.clusters);
          setClusterId(map.clusters[0]?.id ?? '');
        })
        .catch(() => {});
    }
  }, [english]);

  const create = async () => {
    setCreating(true);
    try {
      const { map } = await mapsApi.create({ title: title.trim() || undefined, template, clusterId: template === 'cluster' ? clusterId : undefined });
      navigate(`${ROUTES.MAPS}/${map.id}`);
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
      setCreating(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    try {
      await mapsApi.remove(removing.id);
      setMaps((list) => list?.filter((m) => m.id !== removing.id) ?? null);
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    } finally {
      setRemoving(null);
    }
  };

  const m = t.maps;
  return (
    <div className="maps">
      <PageHeader eyebrow="Mind maps" title={m.title} description={m.intro} />
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}

      <Card padding="lg" className="maps-new reveal">
        <h2>{m.newMap}</h2>
        <div className="maps-new__fields">
          <Field label={m.titlePlaceholder}>{(id) => <TextInput id={id} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />}</Field>
          <div>
            <p className="maps__label">{m.template}</p>
            <Segmented<Template>
              label={m.template}
              value={template}
              onChange={setTemplate}
              options={[
                { value: 'blank', label: m.templates.blank, tone: 'reading' },
                ...(english ? [{ value: 'cluster' as const, label: m.templates.topic, tone: 'reading' }] : []),
                { value: 'compare', label: m.templates.compare, tone: 'reading' },
                { value: 'outline', label: m.templates.outline, tone: 'reading' },
              ]}
            />
          </div>
          {english && template === 'cluster' && (
            <Field label={m.topicLabel}>
              {(id) => (
                <Select id={id} value={clusterId} onChange={(e) => setClusterId(e.target.value)}>
                  {clusters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title[locale]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </div>
        <Button onClick={() => void create()} loading={creating} icon="plus" disabled={(maps?.length ?? 0) >= limit}>
          {m.create}
        </Button>
        {maps && <p className="grammar__hint">{m.count(maps.length, limit)}</p>}
      </Card>

      <Card padding="lg" className="maps-ai reveal">
        <h2>{m.ai.title}</h2>
        <p className="grammar__hint">{m.ai.intro}</p>
        <div className="maps-ai__row">
          <input className="input" value={focus} maxLength={400} placeholder={m.ai.focusPlaceholder} aria-label={m.ai.focusPlaceholder} onChange={(e) => setFocus(e.target.value)} />
          <Button variant="secondary" icon="sparkles" loading={asking} disabled={(maps?.length ?? 0) >= limit} onClick={() => void propose({ intent: 'create', instruction: focus.trim() || undefined })}>
            {m.ai.learned}
          </Button>
        </div>
        <div className="maps-ai__row">
          <input className="input" value={topic} maxLength={200} placeholder={m.ai.topicPlaceholder} aria-label={m.ai.topicPlaceholder} onChange={(e) => setTopic(e.target.value)} />
          <Button variant="secondary" icon="sparkles" loading={asking} disabled={topic.trim().length < 3 || (maps?.length ?? 0) >= limit} onClick={() => void propose({ intent: 'topic', topic: topic.trim(), instruction: focus.trim() || undefined })}>
            {m.ai.topicButton}
          </Button>
        </div>
        {asking && <p className="grammar__hint">{m.ai.working}</p>}
      </Card>
      {dialog}

      {!maps ? (
        error === null && <Spinner size={30} label={t.common.loading} />
      ) : maps.length === 0 ? (
        <EmptyState icon="layers" title={m.empty} />
      ) : (
        <ul className="maps-list">
          {maps.map((map) => (
            <li key={map.id}>
              <Card padding="md" className="maps-item">
                <Link to={`${ROUTES.MAPS}/${map.id}`} className="maps-item__main">
                  <strong>{map.title}</strong>
                  <span className="grammar__hint">
                    {m.nodes(map.nodeCount)} · {m.updated(formatDate(map.updatedAt))}
                  </span>
                </Link>
                <Badge tone="neutral">{map.language === 'ja' ? '日本語' : 'English'}</Badge>
                <Button variant="ghost" size="sm" icon="trash" onClick={() => setRemoving(map)} aria-label={`${m.delete}: ${map.title}`}>
                  {m.delete}
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={removing !== null}
        title={m.deleteTitle}
        onClose={() => setRemoving(null)}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              {t.common.cancel}
            </Button>
            <Button onClick={() => void remove()}>{m.delete}</Button>
          </>
        }
      >
        <p>{removing ? m.deleteBody(removing.title) : ''}</p>
      </Modal>
    </div>
  );
};
