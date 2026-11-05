/**
 * Task components for Today and Practice: Tag, TaskCard, TimeBar
 * A task is always labelled with words (never colour alone), and its state is a symbol plus a screen-reader label.
 */
import type React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import './Task.css';

/** Colour family of a label: a skill, or neutral for vocabulary, grammar and mistakes */
export type TagTone = 'neutral' | 'listening' | 'reading' | 'speaking' | 'writing' | 'exam' | 'brand' | 'notice' | 'hard';

/**
 * Small rounded label, e.g. "Listening" or "Needs credits"
 */
export const Tag: React.FC<{ tone?: TagTone; children: React.ReactNode }> = ({ tone = 'neutral', children }) => (
  <span className={`tag tag--${tone}`}>{children}</span>
);

interface TaskCardProps {
  to: string;
  tone: TagTone;
  kind: string;
  /** Short text next to the label, e.g. "10 min · 42 cards" */
  meta: string;
  title: string;
  /** Why this task is here (always shown) */
  why: string;
  done: boolean;
  doneLabel: string;
  todoLabel: string;
  /** Extra label, e.g. "Needs credits" */
  badge?: string;
  /** Set when the task was carried over from an earlier day: the label to show (e.g. "Carried from 31/10") */
  carried?: string;
  /** Alternative offered when the task needs credits the learner does not have */
  alternative?: { to: string; label: string };
}

/**
 * One task: the whole card is the link. The alternative sits outside the card link so the two do not nest.
 */
export const TaskCard: React.FC<TaskCardProps> = ({ to, tone, kind, meta, title, why, done, doneLabel, todoLabel, badge, carried, alternative }) => (
  <div className={`task ${done ? 'task--done' : ''}`}>
    <Link to={to} className="task__link">
      <span className="task__body">
        <span className="task__top">
          <Tag tone={tone}>{kind}</Tag>
          <span className="task__meta">{meta}</span>
          {carried && !done && <Tag tone="brand">↻ {carried}</Tag>}
          {badge && <Tag tone="notice">{badge}</Tag>}
        </span>
        <span className="task__title">{title}</span>
        <span className="task__why">{why}</span>
      </span>
      <span className={`task__mark ${done ? 'task__mark--done' : ''}`} role="img" aria-label={done ? doneLabel : carried ? carried : todoLabel}>
        {done ? <Icon name="check" size={16} /> : carried ? '↻' : null}
      </span>
    </Link>
    {alternative && (
      <Link to={alternative.to} className="task__alt">
        {alternative.label}
      </Link>
    )}
  </div>
);

export interface TimeSegment {
  id: string;
  minutes: number;
  tone: TagTone;
  /** Visible text inside the segment */
  label?: string;
}

/**
 * Today's time as one bar split by task; each segment carries its minutes as text
 */
export const TimeBar: React.FC<{ segments: TimeSegment[]; label: string }> = ({ segments, label }) => (
  <div className="timebar" role="img" aria-label={label}>
    {segments.map((segment) => (
      <span key={segment.id} className={`timebar__seg timebar__seg--${segment.tone}`} style={{ flex: segment.minutes }}>
        {segment.minutes}
      </span>
    ))}
  </div>
);
