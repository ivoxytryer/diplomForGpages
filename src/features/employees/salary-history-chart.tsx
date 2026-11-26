import { formatDate, formatMoney } from '@/shared/lib/utils';
import type { SalaryStep } from '@/shared/lib/employee-history';

const WIDTH = 720;
const HEIGHT = 190;
const PADDING = { top: 18, right: 18, bottom: 30, left: 92 };

export function SalaryHistoryChart({ steps }: { steps: SalaryStep[] }) {
  if (!steps.length) return null;

  const salaries = steps.map((step) => step.salary);
  const rawMin = Math.min(...salaries);
  const rawMax = Math.max(...salaries);
  const spread = Math.max(1, rawMax - rawMin);
  const min = Math.max(0, rawMin - spread * 0.15);
  const max = rawMax + spread * 0.15;
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const xFor = (index: number) =>
    steps.length === 1
      ? PADDING.left + plotWidth / 2
      : PADDING.left + (index / (steps.length - 1)) * plotWidth;
  const yFor = (salary: number) =>
    PADDING.top + (1 - (salary - min) / Math.max(1, max - min)) * plotHeight;
  const points = steps.map((step, index) => ({
    step,
    x: xFor(index),
    y: yFor(step.salary),
  }));

  let path = `M ${points[0].x} ${points[0].y}`;
  points.slice(1).forEach((point) => {
    path += ` H ${point.x} V ${point.y}`;
  });

  const gridValues =
    rawMin === rawMax
      ? [rawMin]
      : [rawMin, Math.round((rawMin + rawMax) / 2), rawMax];
  const labels = steps.length <= 4 ? steps.map((step) => step.date) : [steps[0].date, steps[steps.length - 1].date];

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="История оклада"
      className="h-auto w-full"
    >
      {gridValues.map((value) => {
        const y = yFor(value);
        return (
          <g key={value}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y}
              y2={y}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <text
              x={PADDING.left - 8}
              y={y + 3}
              textAnchor="end"
              fontSize={9}
              fill="var(--muted)"
            >
              {formatMoney(Math.round(value))}
            </text>
          </g>
        );
      })}

      <path d={path} fill="none" stroke="var(--fg)" strokeWidth={1.5} />

      {points.map(({ step, x, y }) => (
        <g key={step.eventId}>
          <circle cx={x} cy={y} r={3} fill="var(--surface)" stroke="var(--fg)" strokeWidth={1.5}>
            <title>
              {formatDate(step.date)} · {step.label} · {formatMoney(step.salary)}
            </title>
          </circle>
        </g>
      ))}

      {labels.map((date, index) => (
        <text
          key={`${date}-${index}`}
          x={steps.length <= 4 ? xFor(steps.findIndex((step) => step.date === date)) : index === 0 ? PADDING.left : WIDTH - PADDING.right}
          y={HEIGHT - 8}
          textAnchor={index === 0 ? 'start' : steps.length <= 4 ? 'middle' : 'end'}
          fontSize={9}
          fill="var(--muted)"
        >
          {formatDate(date)}
        </text>
      ))}
    </svg>
  );
}
