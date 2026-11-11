/**
 * ChartView
 * Inline SVG bar or line chart for IELTS Task 1 prompts, with an accessible data table
 */
import type React from 'react';
import type { ChartData } from '@/shared/contentApi';

const WIDTH = 560;
const HEIGHT = 320;
const PAD = { top: 24, right: 20, bottom: 56, left: 52 };
/** Series colors use skill tokens so they adapt to light and dark themes */
const SERIES_COLORS = ['var(--reading-edge)', 'var(--speaking)', 'var(--listening)', 'var(--writing)'];

/**
 * Rounds the axis maximum up to a friendly step
 */
function niceMax(value: number): { max: number; step: number } {
  if (value <= 0) return { max: 10, step: 2 };
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => value / s <= 6) ?? magnitude * 10;
  return { max: Math.ceil(value / step) * step, step };
}

const PIE_COLORS = ['var(--reading-edge)', 'var(--speaking)', 'var(--listening)', 'var(--writing)', 'var(--brand)', 'var(--text-muted)', 'var(--border-strong)', 'var(--success, #4caf7d)'];

/** A pie chart: one slice per category, with the values in the legend */
const PieChart: React.FC<{ chart: ChartData }> = ({ chart }) => {
  const values = chart.series[0].values;
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const cx = 130;
  const cy = 130;
  const r = 110;
  // Where each slice starts, as an angle: the slices follow one another clockwise from the top
  const starts = values.reduce<number[]>((acc, _value, i) => [...acc, i === 0 ? -Math.PI / 2 : acc[i - 1] + (values[i - 1] / total) * Math.PI * 2], []);
  const slices = values.map((value, i) => {
    const sweep = (value / total) * Math.PI * 2;
    const start = starts[i];
    const end = start + sweep;
    const [x1, y1] = [cx + r * Math.cos(start), cy + r * Math.sin(start)];
    const [x2, y2] = [cx + r * Math.cos(end), cy + r * Math.sin(end)];
    const large = sweep > Math.PI ? 1 : 0;
    const d = values.length === 1 || sweep >= Math.PI * 2 - 1e-6 ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0` : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return { d, color: PIE_COLORS[i % PIE_COLORS.length], category: chart.categories[i], value };
  });
  return (
    <figure className="chart chart--pie">
      <figcaption className="chart__title">
        {chart.title} <span className="chart__unit">({chart.unit})</span>
      </figcaption>
      <div className="chart__pie">
        <svg viewBox="0 0 260 260" className="chart__pie-svg" role="img" aria-label={chart.title}>
          {slices.map((slice) => (
            <path key={slice.category} d={slice.d} fill={slice.color} className="chart__slice">
              <title>{`${slice.category}: ${slice.value}${chart.unit}`}</title>
            </path>
          ))}
        </svg>
        <ul className="chart__legend chart__legend--pie">
          {slices.map((slice) => (
            <li key={slice.category}>
              <span className="chart__swatch" style={{ background: slice.color }} />
              {slice.category}: <strong>{slice.value}</strong>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
};

export const ChartView: React.FC<{ chart: ChartData }> = ({ chart }) => {
  if (chart.type === 'pie') return <PieChart chart={chart} />;
  return <BarLineChart chart={chart} />;
};

const BarLineChart: React.FC<{ chart: ChartData }> = ({ chart }) => {
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const { max, step } = niceMax(Math.max(...chart.series.flatMap((s) => s.values)));
  const y = (value: number) => PAD.top + plotH - (value / max) * plotH;
  const groupW = plotW / chart.categories.length;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);

  return (
    <figure className="chart">
      <figcaption className="chart__title">
        {chart.title} <span className="chart__unit">({chart.unit})</span>
      </figcaption>
      <div className="chart__scroll">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="chart__svg" role="img" aria-label={chart.title}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className="chart__grid" />
              <text x={PAD.left - 8} y={y(tick)} className="chart__tick" textAnchor="end" dominantBaseline="middle">
                {Number.isInteger(tick) ? tick : tick.toFixed(1)}
              </text>
            </g>
          ))}

          {chart.categories.map((category, ci) => (
            <text key={category} x={PAD.left + groupW * ci + groupW / 2} y={HEIGHT - PAD.bottom + 20} className="chart__tick" textAnchor="middle">
              {category}
            </text>
          ))}

          {chart.type === 'bar'
            ? chart.series.map((series, si) => {
                const barW = Math.min(36, (groupW * 0.75) / chart.series.length);
                const offset = (groupW - barW * chart.series.length) / 2;
                return series.values.map((value, ci) => (
                  <rect
                    key={`${si}-${ci}`}
                    x={PAD.left + groupW * ci + offset + barW * si}
                    y={y(value)}
                    width={barW - 2}
                    height={PAD.top + plotH - y(value)}
                    rx={3}
                    fill={SERIES_COLORS[si % SERIES_COLORS.length]}
                  >
                    <title>{`${series.name}, ${chart.categories[ci]}: ${value}${chart.unit}`}</title>
                  </rect>
                ));
              })
            : chart.series.map((series, si) => {
                const points = series.values.map((value, ci) => `${PAD.left + groupW * ci + groupW / 2},${y(value)}`).join(' ');
                const color = SERIES_COLORS[si % SERIES_COLORS.length];
                return (
                  <g key={series.name}>
                    <polyline points={points} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" />
                    {series.values.map((value, ci) => (
                      <circle key={ci} cx={PAD.left + groupW * ci + groupW / 2} cy={y(value)} r={4.5} fill={color}>
                        <title>{`${series.name}, ${chart.categories[ci]}: ${value}${chart.unit}`}</title>
                      </circle>
                    ))}
                  </g>
                );
              })}

          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} className="chart__axis" />
        </svg>
      </div>

      <ul className="chart__legend">
        {chart.series.map((series, si) => (
          <li key={series.name}>
            <span className="chart__swatch" style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }} />
            {series.name}
          </li>
        ))}
      </ul>

      <table className="visually-hidden">
        <caption>{chart.title}</caption>
        <thead>
          <tr>
            <th scope="col">Series</th>
            {chart.categories.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.series.map((s) => (
            <tr key={s.name}>
              <th scope="row">{s.name}</th>
              {s.values.map((v, i) => (
                <td key={i}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};
