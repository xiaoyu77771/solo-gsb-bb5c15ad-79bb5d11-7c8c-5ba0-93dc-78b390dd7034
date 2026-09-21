import type { HoleCount } from '../types';

const TAU = Math.PI * 2;

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * 槽位数学角（弧度）。
 * 与 server/src/balancing.js 保持同一约定：0 号槽在正上方（12 点方向），
 * 槽号顺时针递增；角度使用数学坐标（x 向右、y 向上，逆时针为正）。
 */
export function slotAngleRad(index: number, holeCount: number): number {
  return TAU / 4 - (index * TAU) / holeCount;
}

export interface ResultVector {
  x: number;
  y: number;
  magnitude: number;
}

/** 本地矢量合力：力 = 重量 × 槽位方向单位矢量，逐槽求和 */
export function resultantOf(
  weights: number[],
  holeCount: HoleCount,
): ResultVector {
  let x = 0;
  let y = 0;
  for (let i = 0; i < holeCount; i += 1) {
    const angle = slotAngleRad(i, holeCount);
    const weight = weights[i] ?? 0;
    x += weight * Math.cos(angle);
    y += weight * Math.sin(angle);
  }
  return { x: round6(x), y: round6(y), magnitude: round6(Math.hypot(x, y)) };
}

/** 合力方向：自正上方顺时针的角度（度，0~360）；合力为 0 时返回 null */
export function directionDegFromVector(x: number, y: number): number | null {
  if (Math.hypot(x, y) <= 1e-9) return null;
  const deg = (90 - (Math.atan2(y, x) * 180) / Math.PI) % 360;
  return deg < 0 ? deg + 360 : deg;
}
