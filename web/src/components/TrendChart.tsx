import { useMemo, useState } from 'react';
import { fmt, formatClock } from '../lib/format';

export interface TrendPoint {
  t: number;
  value: number;
  abnormal?: boolean;
}

interface TrendChartProps {
  title: string;
  unit?: string;
  points: TrendPoint[];
  /** 参考线（如阈值），不绘制时传 null */
  reference?: number | null;
  referenceLabel?: string;
  /** 值域固定下限（默认按数据自适应） */
  minDomain?: number;
  height?: number;
}

const WIDTH = 560;
const PAD = { top: 14, right: 14, bottom: 26, left: 46 };

/**
 * 按时间（x 轴）排列的轻量 SVG 折线图。
 * 单点时画在图中央；所有值相等时值域留出 ±0.5 的上下边距，避免贴边。
 */
export function TrendChart({
  title,
  unit = 'g',
  points,
  reference = null,
  referenceLabel,
  minDomain,
  height = 190,
}: TrendChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const innerW = WIDTH - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;
    const n = points.length;

    if (n === 0) return null;

    const values = points.map((point) => point.value);
    if (reference !== null && Number.isFinite(reference)) values.push(reference);
    let dataMin = Math.min(...values);
    let dataMax = Math.max(...values);
    if (minDomain !== undefined) dataMin = Math.min(dataMin, minDomain);
    if (dataMin === dataMax) {
      dataMin -= 0.5;
      dataMax += 0.5;
    } else {
      const slack = (dataMax - dataMin) * 0.12;
      dataMin -= slack;
      dataMax += slack;
    }
    if (minDomain !== undefined) dataMin = Math.max(dataMin, minDomain);

    const tMin = points[0].t;
    const tMax = points[n - 1].t;
    const tSpan = tMax - tMin;

    const xOf = (t: number) =>
      PAD.left + (n === 1 || tSpan === 0 ? innerW / 2 : ((t - tMin) / tSpan) * innerW);
    const yOf = (value: number) =>
      PAD.top + innerH - ((value - dataMin) / (dataMax - dataMin)) * innerH;

    const coords = points.map((point) => ({
      x: xOf(point.t),
      y: yOf(point.value),
    }));
    const path = coords
      .map((coord, i) => `${i === 0 ? 'M' : 'L'}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`)
      .join(' ');

    const ticks = 4;
    const yTicks = Array.from({ length: ticks + 1 }, (_, i) => {
      const value = dataMin + ((dataMax - dataMin) * i) / ticks;
      return { value, y: yOf(value) };
    });

    const referenceY =
      reference !== null && Number.isFinite(reference) ? yOf(reference) : null;

    return {
      innerW,
      innerH,
      coords,
      path,
      yTicks,
      referenceY,
      xFirst: PAD.left,
      xLast: PAD.left + innerW,
    };
  }, [points, reference, minDomain, height]);

  if (points.length === 0 || !geometry) {
    return (
      <div className="trend-chart">
        <p className="hint">{title}：暂无数据。</p>
      </div>
    );
  }

  return (
    <div className="trend-chart">
      <p className="trend-title">
        {title}
        {reference !== null && referenceLabel && (
          <span className="trend-legend">— {referenceLabel} {fmt(reference)} {unit}</span>
        )}
      </p>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="trend-svg"
        role="img"
        aria-label={title}
      >
        {geometry.yTicks.map((tick) => (
          <g key={tick.y}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={tick.y}
              y2={tick.y}
              className="trend-grid"
            />
            <text x={PAD.left - 6} y={tick.y + 3} className="trend-axis-text" textAnchor="end">
              {fmt(tick.value)}
            </text>
          </g>
        ))}

        {geometry.referenceY !== null && (
          <line
            x1={geometry.xFirst}
            x2={geometry.xLast}
            y1={geometry.referenceY}
            y2={geometry.referenceY}
            className="trend-reference"
          />
        )}

        <path d={geometry.path} className="trend-line" />

        {geometry.coords.map((coord, i) => {
          const point = points[i];
          return (
            <g key={i}>
              <circle
                cx={coord.x}
                cy={coord.y}
                r={hover === i ? 5 : 3.5}
                className={point.abnormal ? 'trend-point trend-point-abnormal' : 'trend-point'}
              />
              <circle
                cx={coord.x}
                cy={coord.y}
                r={12}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
              {hover === i && (
                <g>
                  <rect
                    x={Math.min(
                      Math.max(coord.x - 78, PAD.left),
                      WIDTH - PAD.right - 156,
                    )}
                    y={Math.max(coord.y - 44, PAD.top)}
                    width={156}
                    height={30}
                    rx={6}
                    className="trend-tip-bg"
                  />
                  <text
                    x={Math.min(
                      Math.max(coord.x, PAD.left + 78),
                      WIDTH - PAD.right - 78,
                    )}
                    y={Math.max(coord.y - 31, PAD.top + 13)}
                    className="trend-tip-text"
                    textAnchor="middle"
                  >
                    {formatClock(point.t)} · {fmt(point.value)} {unit}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        <text x={PAD.left} y={height - 6} className="trend-axis-text">
          {formatClock(points[0].t)}
        </text>
        <text x={WIDTH - PAD.right} y={height - 6} className="trend-axis-text" textAnchor="end">
          {formatClock(points[points.length - 1].t)}
        </text>
      </svg>
    </div>
  );
}
