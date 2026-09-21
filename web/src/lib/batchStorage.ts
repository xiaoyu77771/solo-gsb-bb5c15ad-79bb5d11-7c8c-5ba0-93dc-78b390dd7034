import type { BatchSnapshot, BatchThresholds } from './batch';
import { DEFAULT_BATCH_THRESHOLDS } from './batch';

const SNAPSHOTS_KEY = 'centrifuge-balance:measurement-snapshots:v1';
const THRESHOLDS_KEY = 'centrifuge-balance:measurement-thresholds:v1';

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储不可用（隐私模式 / 配额已满）时静默降级
  }
}

function isValidSnapshot(value: unknown): value is BatchSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as BatchSnapshot;
  return (
    typeof snapshot.id === 'string' &&
    typeof snapshot.batchCode === 'string' &&
    (snapshot.holeCount === 8 ||
      snapshot.holeCount === 12 ||
      snapshot.holeCount === 24) &&
    Array.isArray(snapshot.weights) &&
    snapshot.weights.length === snapshot.holeCount &&
    typeof snapshot.measuredAt === 'number'
  );
}

/** 读取全部称量快照（按时间升序）；脏数据自动过滤 */
export function loadSnapshots(): BatchSnapshot[] {
  const raw = readJSON<unknown[]>(SNAPSHOTS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isValidSnapshot)
    .sort((a, b) => a.measuredAt - b.measuredAt);
}

/** 追加一条称量快照，返回按时间升序的完整列表 */
export function appendSnapshot(snapshot: BatchSnapshot): BatchSnapshot[] {
  const snapshots = loadSnapshots();
  snapshots.push(snapshot);
  snapshots.sort((a, b) => a.measuredAt - b.measuredAt);
  writeJSON(SNAPSHOTS_KEY, snapshots);
  return snapshots;
}

/** 删除单条称量快照 */
export function deleteSnapshot(id: string): BatchSnapshot[] {
  const snapshots = loadSnapshots().filter((snapshot) => snapshot.id !== id);
  writeJSON(SNAPSHOTS_KEY, snapshots);
  return snapshots;
}

/** 删除一个批次（同编号 + 同转子规格）的全部快照 */
export function deleteBatch(
  batchCode: string,
  holeCount: number,
): BatchSnapshot[] {
  const code = batchCode.trim();
  const snapshots = loadSnapshots().filter(
    (snapshot) =>
      !(snapshot.batchCode === code && snapshot.holeCount === holeCount),
  );
  writeJSON(SNAPSHOTS_KEY, snapshots);
  return snapshots;
}

/** 读取批次阈值规则（缺字段时回退默认值） */
export function loadBatchThresholds(): BatchThresholds {
  const raw = readJSON<Partial<BatchThresholds>>(THRESHOLDS_KEY);
  const pick = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : fallback;
  if (!raw) return { ...DEFAULT_BATCH_THRESHOLDS };
  return {
    slotStdev: pick(raw.slotStdev, DEFAULT_BATCH_THRESHOLDS.slotStdev),
    slotMaxDeviation: pick(
      raw.slotMaxDeviation,
      DEFAULT_BATCH_THRESHOLDS.slotMaxDeviation,
    ),
    batchResultant: pick(
      raw.batchResultant,
      DEFAULT_BATCH_THRESHOLDS.batchResultant,
    ),
  };
}

export function persistBatchThresholds(
  thresholds: BatchThresholds,
): BatchThresholds {
  writeJSON(THRESHOLDS_KEY, thresholds);
  return thresholds;
}
