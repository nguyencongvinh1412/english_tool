/**
 * MapHistoryPage
 * The earlier copies of a map: when each was kept and what replaced it, what changed compared with the map now,
 * and a restore that keeps the map as it is now (so a restore can be undone too).
 */
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Banner, Button, EmptyState, Modal, Spinner, Tag } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { ROUTES } from '@/app/routes';
import { errorMessage } from '@/shared/http';
import { mapsApi, type MapChange, type MapVersionRow } from '@/shared/mapsApi';
import { ToolFooter, ToolHeader } from '@/features/grammar/ToolChrome';
import './maps.css';

const MARK = { added: '+', removed: '−', renamed: '~' } as const;

export const MapHistoryPage: React.FC = () => {
  const { t, formatDate } = useI18n();
  const { mapId = '' } = useParams();
  const navigate = useNavigate();
  const h = t.maps.history;
  const [data, setData] = useState<Awaited<ReturnType<typeof mapsApi.versions>> | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [changes, setChanges] = useState<MapChange[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    mapsApi
      .versions(mapId)
      .then((loaded) => {
        setData(loaded);
        setSelected(loaded.versions[0]?.version ?? null);
      })
      .catch(setError);
  }, [mapId]);

  const open = useCallback(
    (version: number) => {
      setSelected(version);
      setChanges(null);
      mapsApi.changes(mapId, version).then(setChanges).catch(setError);
    },
    [mapId]
  );

  useEffect(() => {
    if (selected !== null && changes === null) mapsApi.changes(mapId, selected).then(setChanges).catch(setError);
    // Load once for the first copy; later picks go through open()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const restore = async () => {
    if (selected === null) return;
    setBusy(true);
    try {
      await mapsApi.restore(mapId, selected);
      navigate(`${ROUTES.MAPS}/${mapId}`);
    } catch (err) {
      setError(err);
      setBusy(false);
      setConfirming(false);
    }
  };

  const reason = (row: MapVersionRow) => h.reasons[row.reason];

  return (
    <div className="tool-page">
      <ToolHeader title={h.title} subtitle={data?.current.title} back={`${ROUTES.MAPS}/${mapId}`} />
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      {!data ? (
        error === null && <Spinner size={30} label={t.common.loading} />
      ) : data.versions.length === 0 ? (
        <EmptyState icon="layers" title={h.empty}>
          {h.emptyNote}
        </EmptyState>
      ) : (
        <>
          <ul className="map-versions" aria-label={h.title}>
            <li className="map-versions__row map-versions__row--now">
              <span>
                <strong>{formatDate(data.current.at)}</strong>
                <small>{h.nodes(data.current.nodeCount)}</small>
              </span>
              <Tag tone="neutral">{h.now}</Tag>
            </li>
            {data.versions.map((row) => (
              <li key={row.version}>
                <button type="button" className={`map-versions__row ${selected === row.version ? 'map-versions__row--on' : ''}`} aria-pressed={selected === row.version} onClick={() => open(row.version)}>
                  <span>
                    <strong>
                      {selected === row.version && <span aria-hidden="true">✓ </span>}
                      {formatDate(row.at)}
                    </strong>
                    <small>
                      {reason(row)} · {h.nodes(row.nodeCount)}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected !== null && (
            <section className="map-changes">
              <h2>{h.compare}</h2>
              {changes === null ? (
                <Spinner size={20} label={t.common.loading} />
              ) : changes.length === 0 ? (
                <p className="grammar__hint">{h.same}</p>
              ) : (
                <ul>
                  {changes.map((change, i) => (
                    <li key={i}>
                      <span aria-hidden="true" className="map-changes__mark">
                        {MARK[change.kind]}
                      </span>
                      {h.change[change.kind](change.text, change.was)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <ToolFooter>
            <Button size="lg" disabled={selected === null} onClick={() => setConfirming(true)}>
              {h.restore}
            </Button>
          </ToolFooter>
        </>
      )}

      <Modal
        open={confirming}
        title={h.confirmTitle}
        onClose={() => setConfirming(false)}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={() => void restore()} loading={busy}>
              {h.restore}
            </Button>
          </>
        }
      >
        <p>{h.confirmBody}</p>
      </Modal>
    </div>
  );
};
