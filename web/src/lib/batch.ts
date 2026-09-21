import type { HoleCount } from '../types';
import { directionDegFromVector, resultantOf } from './vector';

/** 一次称量快照（按槽号 0..holeCount-1 对齐） */
export interface BatchSnapshot {
  id: string;
  batchCode: string;
  holeCount: HoleCount;
  /** 各槽重量快照（g），保存后不随后续编辑变化 */
  weights: number[];
  /** 该次称量的矢量合力（本地计算，与后端同构） */
  resultantX: number;
  resultantY: number;
  resultantMagnitude: number;
  measuredAt: number;
  note?: string;
}

/** 批次异常判定阈值（仅存于浏览器本地，与配平阈值相互独立） */
export interface BatchThresholds {
  /** 单槽样本标准差上限（g），超过则该槽异常 */
  slotStdev: number;
  /** 单槽最大偏差（|测量值-均值|）上限（g），超过则该槽异常 */
  slotMaxDeviation: number;
  /** 整批平均合力上限（g），超过则批次异常 */
  batchResultant: number;
}

export const DEFAULT_BATCH_THRESHOLDS: BatchThresholds = {
  slotStdev: 0.05,
  slotMaxDeviation: 0.1,
  batchResultant: 1,
};

export interface SlotStat {
  slot: number;
  count: number;
  mean: number;
  /** 样本标准差（n-1）；n < 2 时为 0 */
  stdev: number;
  /** 最大偏差 max|测量值 - 均值| */
  maxDeviation: number;
  min: number;
  max: number;
  abnormal: boolean;
}

export interface BatchResultantStat {
  count: number;
  mean: number;
  stdev: number;
  max: number;
  /** 平均重量矢量的合力（各槽均值对齐回槽位后合成） */
  meanWeightsMagnitude: number;
  meanWeightsX: number;
  meanWeightsY: number;
  /** 平均合力方向（自正上方顺时针，度） */
  meanWeightsDirectionDeg: number | null;
}

export interface BatchStat {
  batchCode: string;
  holeCount: HoleCount;
  count: number;
  slots: SlotStat[];
  abnormalSlots: number[];
  resultant: BatchResultantStat;
  abnormal: boolean;
  firstMeasuredAt: number;
  lastMeasuredAt: number;
}

function meanOf(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 样本标准差（n-1）；样本不足两个时为 0 */
function sampleStdev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** 唯一标识：同一批次编号 + 同一转子规格归为一组 */
export function batchGroupKey(batchCode: string, holeCount: number): string {
  return `${holeCount}::${batchCode.trim()}`;
}

/**
 * 按槽号对齐计算一个批次的全部统计：
 *  - 每槽均值 / 样本标准差 / 最大偏差 / 极差；
 *  - 整批合力统计：逐次称量合力的均值、标准差、最大值，
 *    以及各槽均值对齐回槽位后合成的平均合力。
 */
export function computeBatchStat(
  snapshots: BatchSnapshot[],
  holeCount: HoleCount,
  batchCode: string,
  thresholds: BatchThresholds,
): BatchStat {
  const sorted = [...snapshots].sort((a, b) => a.measuredAt - b.measuredAt);
  const count = sorted.length;

  const slots: SlotStat[] = [];
  const abnormalSlots: number[] = [];
  for (let slot = 0; slot < holeCount; slot += 1) {
    const values = sorted.map((snapshot) => snapshot.weights[slot] ?? 0);
    const mean = meanOf(values);
    const stdev = sampleStdev(values, mean);
    let maxDeviation = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const value of values) {
      maxDeviation = Math.max(maxDeviation, Math.abs(value - mean));
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    const abnormal =
      stdev > thresholds.slotStdev + 1e-12 ||
      maxDeviation > thresholds.slotMaxDeviation + 1e-12;
    if (abnormal) abnormalSlots.push(slot);
    slots.push({
      slot,
      count,
      mean: round6(mean),
      stdev: round6(stdev),
      maxDeviation: round6(maxDeviation),
      min: count > 0 ? round6(min) : 0,
      max: count > 0 ? round6(max) : 0,
      abnormal,
    });
  }

  const magnitudes = sorted.map((snapshot) => snapshot.resultantMagnitude);
  const meanMagnitude = count > 0 ? meanOf(magnitudes) : 0;
  const maxMagnitude = count > 0 ? Math.max(...magnitudes) : 0;

  // 各槽均值对齐回槽位后合成平均重量矢量
  const meanWeights = slots.map((slotStat) => slotStat.mean);
  const meanVector = resultantOf(meanWeights, holeCount);
  const meanWeightsDirectionDeg = directionDegFromVector(
    meanVector.x,
    meanVector.y,
  );

  const resultant: BatchResultantStat = {
    count,
    mean: round6(meanMagnitude),
    stdev: round6(sampleStdev(magnitudes, meanMagnitude)),
    max: round6(maxMagnitude),
    meanWeightsMagnitude: meanVector.magnitude,
    meanWeightsX: meanVector.x,
    meanWeightsY: meanVector.y,
    meanWeightsDirectionDeg,
  };

  return {
    batchCode,
    holeCount,
    count,
    slots,
    abnormalSlots,
    resultant,
    abnormal:
      abnormalSlots.length > 0 ||
      meanVector.magnitude > thresholds.batchResultant + 1e-12,
    firstMeasuredAt: count > 0 ? sorted[0].measuredAt : 0,
    lastMeasuredAt: count > 0 ? sorted[count - 1].measuredAt : 0,
  };
}

/** 由当前重量生成一条称量快照（不修改任何入参） */
export function createSnapshot(
  batchCode: string,
  holeCount: HoleCount,
  weights: number[],
  measuredAt: number = Date.now(),
): BatchSnapshot {
  const vector = resultantOf(weights, holeCount);
  return {
    id: `${measuredAt}-${Math.random().toString(36).slice(2, 8)}`,
    batchCode: batchCode.trim(),
    holeCount,
    weights: weights.map((value) => round6(value)),
    resultantX: vector.x,
    resultantY: vector.y,
    resultantMagnitude: vector.magnitude,
    measuredAt,
  };
}
