/**
 * PlacementBankTab
 * The level test's question bank: build it from existing content, see where it is thin, retire bad questions.
 */
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Banner, Button, Card, Tag } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { apiFetch, errorMessage } from '@/shared/http';
import { getSelectedModel } from '@/services/api';
import './admin.css';

const SKILLS = ['vocabulary', 'grammar', 'reading', 'listening'] as const;
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
/** A level with fewer approved questions than this is flagged as thin */
const THIN = 3;
/** The AI fills a cell up to this many questions (approved and draft together) */
const TARGET = 8;
/** Most batches asked for one cell in a single run, in case the check keeps dropping questions */
const MAX_BATCHES = 3;
const AI_SKILLS = ['grammar', 'reading', 'listening'] as const;
type Cells = Record<string, Record<string, number>>;

interface Question {
  id: string;
  skill: string;
  level: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  source: string;
  status: 'approved' | 'draft' | 'retired';
}

export const PlacementBankTab: React.FC = () => {
  const { t } = useI18n();
  const a = t.placementAdmin;
  const [coverage, setCoverage] = useState<Cells>({});
  const [drafts, setDrafts] = useState<Cells>({});
  const [fill, setFill] = useState<{ done: number; total: number } | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [skill, setSkill] = useState('');
  const [status, setStatus] = useState('approved');
  const [building, setBuilding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ limit: '50', ...(skill ? { skill } : {}), ...(status ? { status } : {}) });
      const [cov, list] = await Promise.all([apiFetch<{ coverage: Cells; drafts: Cells }>('/api/admin/placement/coverage'), apiFetch<{ total: number; questions: Question[] }>(`/api/admin/placement/questions?${query}`)]);
      setCoverage(cov.coverage);
      setDrafts(cov.drafts);
      setQuestions(list.questions);
      setTotal(list.total);
    } catch (err) {
      setError(err);
    }
  }, [skill, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const build = async () => {
    setBuilding(true);
    setMessage(null);
    try {
      const result = await apiFetch<{ added: number }>('/api/admin/placement/build', { method: 'POST' });
      setMessage(a.built(result.added));
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBuilding(false);
    }
  };

  const count = (cells: Cells, skill: string, level: string) => cells[skill]?.[level] ?? 0;

  /** Asks the AI for batches, one request at a time, until the listed cells reach the goal (or a cell keeps failing the check) */
  const generate = async (cells: { skill: (typeof AI_SKILLS)[number]; level: string }[]) => {
    setError(null);
    setMessage(null);
    let stored = 0;
    let dropped = 0;
    const plan = cells.flatMap((c) => Array.from({ length: Math.max(1, Math.min(MAX_BATCHES, Math.ceil((TARGET - count(coverage, c.skill, c.level) - count(drafts, c.skill, c.level)) / 3))) }, () => c));
    try {
      for (let i = 0; i < plan.length; i++) {
        setFill({ done: i + 1, total: plan.length });
        const r = await apiFetch<{ stored: number; dropped: number }>('/api/admin/placement/generate', { method: 'POST', json: { ...plan[i], model: getSelectedModel() ?? undefined } });
        stored += r.stored;
        dropped += r.dropped;
      }
      setMessage(a.filled(stored, dropped));
    } catch (err) {
      setError(err);
    } finally {
      setFill(null);
      await load();
    }
  };

  const thinCells = AI_SKILLS.flatMap((skill) => LEVELS.filter((level) => count(coverage, skill, level) + count(drafts, skill, level) < TARGET).map((level) => ({ skill, level })));

  const approveCell = async (skill: string, level: string) => {
    try {
      const r = await apiFetch<{ approved: number }>('/api/admin/placement/approve', { method: 'POST', json: { skill, level } });
      setMessage(a.approved(r.approved));
      await load();
    } catch (err) {
      setError(err);
    }
  };

  const setQuestionStatus = async (id: string, next: Question['status']) => {
    try {
      await apiFetch(`/api/admin/placement/questions/${encodeURIComponent(id)}`, { method: 'PATCH', json: { status: next } });
      await load();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="admin-bank">
      <p>{a.intro}</p>
      {error !== null && <Banner tone="warning">{errorMessage(error, t)}</Banner>}
      {message && <Banner tone="success">{message}</Banner>}
      <div className="admin-bank__actions">
        <Button onClick={() => void build()} loading={building} disabled={fill !== null}>
          {building ? a.building : a.build}
        </Button>
        <Button variant="secondary" onClick={() => void generate(thinCells)} disabled={fill !== null || thinCells.length === 0}>
          {fill ? a.filling(fill.done, fill.total) : a.fillAll}
        </Button>
      </div>
      <p className="admin-bank__note">{a.fillNote}</p>

      <Card padding="md">
        <h3>{a.coverage}</h3>
        <p className="admin-bank__note">{a.target(TARGET)}</p>
        <div className="admin-bank__scroll">
          <table className="admin-bank__table">
            <thead>
              <tr>
                <th>{a.skill}</th>
                {LEVELS.map((l) => (
                  <th key={l}>{l}</th>
                ))}
                <th>{a.total}</th>
              </tr>
            </thead>
            <tbody>
              {SKILLS.map((s) => (
                <tr key={s}>
                  <th scope="row">{t.placement.parts[s]}</th>
                  {LEVELS.map((l) => {
                    const n = count(coverage, s, l);
                    const d = count(drafts, s, l);
                    const ai = (AI_SKILLS as readonly string[]).includes(s);
                    return (
                      <td key={l} className={n < THIN ? 'admin-bank__thin' : ''} title={n < THIN ? a.thin : undefined}>
                        {n}
                        {n < THIN ? ' !' : ''}
                        {d > 0 && (
                          <button type="button" className="admin-bank__cellbtn" onClick={() => void approveCell(s, l)} disabled={fill !== null}>
                            {a.drafts(d)} · {a.approveDrafts(d)}
                          </button>
                        )}
                        {ai && n + d < TARGET && (
                          <button type="button" className="admin-bank__cellbtn" onClick={() => void generate([{ skill: s as (typeof AI_SKILLS)[number], level: l }])} disabled={fill !== null}>
                            {a.fillCell}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td>{LEVELS.reduce((sum, l) => sum + (coverage[s]?.[l] ?? 0), 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="admin-bank__filters">
        <label>
          {a.filters}:{' '}
          <select value={skill} onChange={(e) => setSkill(e.target.value)}>
            <option value="">{a.all}</option>
            {SKILLS.map((s) => (
              <option key={s} value={s}>
                {t.placement.parts[s]}
              </option>
            ))}
          </select>
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={a.filters}>
          <option value="">{a.all}</option>
          {(['approved', 'draft', 'retired'] as const).map((s) => (
            <option key={s} value={s}>
              {a.status[s]}
            </option>
          ))}
        </select>
        <span>{a.shown(questions.length, total)}</span>
      </div>

      {questions.length === 0 ? (
        <p>{a.none}</p>
      ) : (
        <ul className="admin-bank__list">
          {questions.map((q) => (
            <li key={q.id} className="admin-bank__item">
              <div>
                <Tag>{`${t.placement.parts[q.skill as (typeof SKILLS)[number]]} · ${q.level}`}</Tag> <Tag tone={q.status === 'approved' ? 'brand' : 'notice'}>{a.status[q.status]}</Tag>
                <p className="admin-bank__prompt">{q.prompt}</p>
                <p className="admin-bank__options">{q.options.map((o, i) => (i === q.answerIndex ? `✓ ${o}` : o)).join('  ·  ')}</p>
              </div>
              {q.status === 'retired' ? (
                <Button size="sm" variant="secondary" onClick={() => void setQuestionStatus(q.id, 'approved')}>
                  {a.approve}
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => void setQuestionStatus(q.id, 'retired')}>
                  {a.retire}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
