/**
 * NetworkGraph
 * A word and the words around it. Desktop draws a graph (the word in the middle, lines styled by how the words are
 * related); a phone shows the same words as groups that fold open. Each word shows how deep the learner knows it.
 */
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Banner, Button, Card, Skeleton } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { deepWordApi, type NetworkKind, type NetworkNode, type WordNetwork } from '@/shared/deepWordApi';
import './deepword.css';

type Node = NetworkNode & { kind: NetworkKind | 'center' };

/** Line style per relation: solid, dashed, dash-dot, dotted; the legend names each */
const DASH: Record<NetworkKind, string | undefined> = { family: undefined, synonym: '7 5', contrast: '2 4 9 4', related: '1 6' };
const KINDS: NetworkKind[] = ['related', 'synonym', 'contrast', 'family'];
const W = 640;
const H = 420;

export const NetworkGraph: React.FC<{ itemId: string; onBack: () => void; onOpenWord: (itemId: string) => void; onRecenter: (itemId: string) => void }> = ({ itemId, onBack, onOpenWord, onRecenter }) => {
  const { t } = useI18n();
  const n = t.deepWord.network;
  const [data, setData] = useState<WordNetwork | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    deepWordApi.network(itemId).then(setData).catch(setError);
  }, [itemId]);

  const nodes: Node[] = useMemo(() => (data ? [{ ...data.center, kind: 'center' as const }, ...data.nodes] : []), [data]);
  const around = nodes.slice(1);
  const chosen = nodes.find((x) => x.id === selected) ?? nodes[0];

  const place = (index: number, total: number) => {
    const angle = -Math.PI / 2 + (index / Math.max(total, 1)) * Math.PI * 2;
    return { x: W / 2 + Math.cos(angle) * 235, y: H / 2 + Math.sin(angle) * 150 };
  };

  const study = async (id: string) => {
    setBusy(true);
    try {
      await deepWordApi.queueAdd(id);
      setAdded((list) => [...list, id]);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (error !== null && !data) return <Banner tone="danger">{errorMessage(error, t)}</Banner>;
  if (!data) return <Skeleton height={260} label={t.common.loading} />;

  /** What the learner can do with a word */
  const actions = (node: Node) => (
    <div className="dw__row">
      {node.studied && node.id !== data.center.id && (
        <Button size="sm" variant="secondary" onClick={() => onOpenWord(node.id)}>
          {n.openWord}
        </Button>
      )}
      {node.exists && node.id !== data.center.id && (
        <Button size="sm" variant="ghost" onClick={() => onRecenter(node.id)}>
          {n.recenter}
        </Button>
      )}
      {node.exists && !node.studied && node.id !== data.center.id && (
        <Button size="sm" icon={added.includes(node.id) ? 'check' : 'plus'} onClick={() => void study(node.id)} disabled={busy || added.includes(node.id)}>
          {added.includes(node.id) ? n.added : n.study}
        </Button>
      )}
    </div>
  );

  const describe = (node: Node) => (
    <>
      <div className="dw__row">
        <strong lang="en">{node.term}</strong>
        <Badge>{n.kinds[node.kind]}</Badge>
      </div>
      {node.studied && node.stage ? <p className="dw__muted">{n.stageLine(node.stage, t.deepWord.stageNames[node.stage - 1])}</p> : <p className="dw__muted">{node.exists ? n.notStudied : n.notInList}</p>}
    </>
  );

  return (
    <div className="dw">
      <div className="dw__row dw__row--between">
        <h2 className="dw__title">
          {n.title}: <span lang="en">{data.center.term}</span>
        </h2>
        <Button variant="ghost" icon="arrowLeft" onClick={onBack}>
          {n.back}
        </Button>
      </div>
      <p className="dw__muted">{n.intro}</p>
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}

      {around.length === 0 ? (
        <Card padding="lg">
          <p className="dw__muted">{n.empty}</p>
        </Card>
      ) : (
        <>
          <Card padding="md" className="dw-net__svg">
            <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={n.title} className="dw-net">
              {around.map((node, i) => {
                const p = place(i, around.length);
                return <line key={`l-${node.id}`} x1={W / 2} y1={H / 2} x2={p.x} y2={p.y} className="dw-net__line" strokeDasharray={DASH[node.kind as NetworkKind]} />;
              })}
              {nodes.map((node, i) => {
                const p = i === 0 ? { x: W / 2, y: H / 2 } : place(i - 1, around.length);
                const width = Math.max(78, node.term.length * 9 + 26);
                const on = chosen.id === node.id;
                return (
                  <g
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={on}
                    aria-label={`${node.term}, ${n.kinds[node.kind]}${node.stage ? `, ${n.stageLine(node.stage, t.deepWord.stageNames[node.stage - 1])}` : ''}`}
                    className={`dw-net__node ${node.studied ? 'is-studied' : ''} ${on ? 'is-on' : ''} ${i === 0 ? 'is-center' : ''}`}
                    transform={`translate(${p.x - width / 2} ${p.y - 18})`}
                    onClick={() => setSelected(node.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelected(node.id))}
                  >
                    <rect width={width} height={36} rx={18} />
                    <text x={width / 2} y={22} textAnchor="middle">
                      {node.term}
                      {node.stage ? `  ${node.stage}/5` : ''}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="dw-net__legend" aria-label={n.legend}>
              {KINDS.map((k) => (
                <span key={k}>
                  <svg width="34" height="8" aria-hidden="true">
                    <line x1="0" y1="4" x2="34" y2="4" className="dw-net__line" strokeDasharray={DASH[k]} />
                  </svg>{' '}
                  {n.kinds[k]}
                </span>
              ))}
            </div>
          </Card>

          <Card padding="md" className="dw__card dw-net__svg" aria-live="polite">
            {describe(chosen)}
            {actions(chosen)}
          </Card>

          <div className="dw-net__tree">
            {KINDS.map((k) => {
              const group = around.filter((x) => x.kind === k);
              if (group.length === 0) return null;
              return (
                <details key={k} open className="dw-net__group">
                  <summary>{n.groups(n.kinds[k], group.length)}</summary>
                  <ul className="dw__list">
                    {group.map((node) => (
                      <li key={node.id} className="dw__item">
                        <div className="dw__item-main">{describe(node)}</div>
                        {actions(node)}
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
