import { useEffect, useMemo, useRef, useState } from 'react';
import type { HoleCount } from '../types';
import type { BatchSnapshot, BatchThresholds, BatchStat } from '../lib/batch';
import { computeBatchStat } from '../lib/batch';
import { fmt, formatTime, formatTimeSeconds } from '../lib/format';
import { TrendChart } from './TrendChart';
import type { TrendPoint } from './TrendChart';

interface BatchPanelProps {
  holeCount: HoleCount;
  weights: number[];
  snapshots: BatchSnapshot[];
  thresholds: BatchThresholds;
  onSaveSnapshot: (batchCode: string) => void;
  onDeleteSnapshot: (id: string) => void;
  onDeleteBatch: (batchCode: string, holeCount: HoleCount) => void;
  onChangeThresholds: (thresholds: BatchThresholds) => void;
}

interface BatchGroup {
  code: string;
  list: BatchSnapshot[];
  stat: BatchStat;
}

function ThresholdInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="control">
      {label}
      <input
        type="number"
        min={0}
        step={0.01}
        className="threshold-input"
        value={Number.isFinite(value) ? value : ''}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next >= 0) onChange(next);
        }}
      />
    </label>
  );
}

export function BatchPanel({
  holeCount,
  weights,
  snapshots,
  thresholds,
  onSaveSnapshot,
  onDeleteSnapshot,
  onDeleteBatch,
  onChangeThresholds,
}: BatchPanelProps) {
  const [codeInput, setCodeInput] = useState('');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [trendSlot, setTrendSlot] = useState<number | 'resultant'>('resultant');
  const prevCode = useRef<string | null>(null);

  // 当前转子规格下的全部批次分组（按最近称量时间倒序）
  const groups = useMemo<BatchGroup[]>(() => {
    const map = new Map<string, BatchSnapshot[]>();
    for (const snapshot of snapshots) {
      if (snapshot.holeCount !== holeCount) continue;
      const list = map.get(snapshot.batchCode);
      if (list) list.push(snapshot);
      else map.set(snapshot.batchCode, [snapshot]);
    }
    return [...map.entries()]
      .map(([code, list]) => {
        const sorted = [...list].sort((a, b) => a.measuredAt - b.measuredAt);
        return {
          code,
          list: sorted,
          stat: computeBatchStat(sorted, holeCount, code, thresholds),
        };
      })
      .sort((a, b) => b.stat.lastMeasuredAt - a.stat.lastMeasuredAt);
  }, [snapshots, holeCount, thresholds]);

  // 无选中或选中批次消失时，自动落到最近批次
  useEffect(() => {
    if (groups.length === 0) {
      if (selectedCode !== null) setSelectedCode(null);
      return;
    }
    if (!selectedCode || !groups.some((group) => group.code === selectedCode)) {
      setSelectedCode(groups[0].code);
    }
  }, [groups, selectedCode]);

  // 切换批次时趋势图回到合力视图
  useEffect(() => {
    if (prevCode.current !== selectedCode) {
      prevCode.current = selectedCode;
      setTrendSlot('resultant');
    }
  }, [selectedCode]);

  const activeGroup =
    groups.find((group) => group.code === selectedCode) ?? null;

  const handleSave = () => {
    const code = codeInput.trim();
    if (!code) return;
    onSaveSnapshot(code);
    setSelectedCode(code);
    setCodeInput('');
  };

  const handleDeleteBatch = (group: BatchGroup) => {
    const ok = window.confirm(
      `确定删除批次「${group.code}」的全部 ${group.list.length} 条称量记录吗？此操作不可恢复。`,
    );
    if (ok) onDeleteBatch(group.code, holeCount);
  };

  const resultantPoints: TrendPoint[] = activeGroup
    ? activeGroup.list.map((snapshot) => ({
        t: snapshot.measuredAt,
        value: snapshot.resultantMagnitude,
        abnormal: snapshot.resultantMagnitude > thresholds.batchResultant + 1e-12,
      }))
    : [];

  const activeSlotStat =
    trendSlot === 'resultant'
      ? null
      : activeGroup?.stat.slots[trendSlot] ?? null;

  const slotPoints: TrendPoint[] =
    activeGroup && trendSlot !== 'resultant'
      ? activeGroup.list.map((snapshot) => {
          const value = snapshot.weights[trendSlot] ?? 0;
          const mean = activeGroup.stat.slots[trendSlot].mean;
          return {
            t: snapshot.measuredAt,
            value,
            abnormal:
              Math.abs(value - mean) > thresholds.slotMaxDeviation + 1e-12,
          };
        })
      : [];

  const nonZeroCount = weights.filter((value) => value > 0).length;

  return (
    <section className="card batch-card">
      <header className="card-header">
        <h2>测量批次</h2>
        <span className="hint">
          多次称量快照 · 按槽号对齐统计 · 数据仅保存在本浏览器
        </span>
      </header>

      <div className="plan-save-row">
        <input
          className="text-input"
          list="batch-code-suggestions"
          placeholder="录入批次编号（如 LOT-20260921-01）"
          value={codeInput}
          onChange={(event) => setCodeInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleSave();
          }}
        />
        <datalist id="batch-code-suggestions">
          {groups.map((group) => (
            <option key={group.code} value={group.code} />
          ))}
        </datalist>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!codeInput.trim()}
        >
          保存称量快照
        </button>
      </div>
      <p className="hint">
        保存的是当前 {holeCount} 孔转子各槽重量的只读快照（当前工作台有{' '}
        {nonZeroCount} 槽非零），保存后不会改变任何配平状态。
      </p>

      <div className="comp-params batch-thresholds">
        <ThresholdInput
          label="单槽标准差上限 (g)"
          value={thresholds.slotStdev}
          onChange={(value) =>
            onChangeThresholds({ ...thresholds, slotStdev: value })
          }
        />
        <ThresholdInput
          label="单槽最大偏差上限 (g)"
          value={thresholds.slotMaxDeviation}
          onChange={(value) =>
            onChangeThresholds({ ...thresholds, slotMaxDeviation: value })
          }
        />
        <ThresholdInput
          label="整批合力上限 (g)"
          value={thresholds.batchResultant}
          onChange={(value) =>
            onChangeThresholds({ ...thresholds, batchResultant: value })
          }
        />
      </div>

      {groups.length === 0 ? (
        <p className="hint">
          当前 {holeCount} 孔转子还没有测量批次：录入批次编号并保存第一次称量快照后即可统计。
        </p>
      ) : (
        <>
          <div className="batch-tabs" role="tablist" aria-label="测量批次">
            {groups.map((group) => (
              <button
                key={group.code}
                type="button"
                role="tab"
                aria-selected={group.code === selectedCode}
                className={`batch-tab ${
                  group.code === selectedCode ? 'batch-tab-active' : ''
                } ${group.stat.abnormal ? 'batch-tab-abnormal' : ''}`}
                onClick={() => setSelectedCode(group.code)}
                title={`${group.list.length} 次称量 · ${formatTime(
                  group.stat.lastMeasuredAt,
                )}`}
              >
                <span className="batch-tab-code">{group.code}</span>
                <span className="batch-tab-meta">
                  {group.list.length} 次
                  {group.stat.abnormal && <em>⚠ 异常</em>}
                </span>
              </button>
            ))}
          </div>

          {activeGroup && (
            <BatchDetail
              group={activeGroup}
              thresholds={thresholds}
              trendSlot={trendSlot}
              resultantPoints={resultantPoints}
              slotPoints={slotPoints}
              activeSlotStat={activeSlotStat}
              onSelectTrendSlot={setTrendSlot}
              onDeleteSnapshot={onDeleteSnapshot}
              onDeleteBatch={() => handleDeleteBatch(activeGroup)}
            />
          )}
        </>
      )}
    </section>
  );
}

function BatchDetail({
  group,
  thresholds,
  trendSlot,
  resultantPoints,
  slotPoints,
  activeSlotStat,
  onSelectTrendSlot,
  onDeleteSnapshot,
  onDeleteBatch,
}: {
  group: BatchGroup;
  thresholds: BatchThresholds;
  trendSlot: number | 'resultant';
  resultantPoints: TrendPoint[];
  slotPoints: TrendPoint[];
  activeSlotStat: BatchStat['slots'][number] | null;
  onSelectTrendSlot: (slot: number | 'resultant') => void;
  onDeleteSnapshot: (id: string) => void;
  onDeleteBatch: () => void;
}) {
  const { stat, list } = group;
  const overResultantCount = list.filter(
    (snapshot) => snapshot.resultantMagnitude > thresholds.batchResultant + 1e-12,
  ).length;

  return (
    <div className="batch-detail">
      <div className="batch-summary-head">
        <div className="batch-summary-title">
          <strong>{group.code}</strong>
          <span
            className={`status-badge ${
              stat.abnormal ? 'badge-over' : 'badge-balanced'
            }`}
          >
            {stat.abnormal ? '批次异常' : '批次正常'}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-small btn-danger"
          onClick={onDeleteBatch}
        >
          删除整批
        </button>
      </div>

      <dl className="batch-summary-grid">
        <div>
          <dt>称量次数</dt>
          <dd>{stat.count}</dd>
        </div>
        <div>
          <dt>异常槽位</dt>
          <dd className={stat.abnormalSlots.length > 0 ? 'text-danger' : ''}>
            {stat.abnormalSlots.length === 0
              ? '无'
              : stat.abnormalSlots.map((slot) => `#${slot + 1}`).join('、')}
          </dd>
        </div>
        <div>
          <dt>首次 / 末次称量</dt>
          <dd className="batch-date-cell">
            {formatTime(stat.firstMeasuredAt)}
            <small> ~ {formatTime(stat.lastMeasuredAt)}</small>
          </dd>
        </div>
        <div>
          <dt>逐次合力 均值 / σ / 最大</dt>
          <dd>
            {fmt(stat.resultant.mean)} / {fmt(stat.resultant.stdev)} /{' '}
            {fmt(stat.resultant.max)} <small>g</small>
          </dd>
        </div>
        <div>
          <dt>平均重量合力</dt>
          <dd className={stat.resultant.meanWeightsMagnitude > thresholds.batchResultant + 1e-12 ? 'text-danger' : ''}>
            {fmt(stat.resultant.meanWeightsMagnitude)} <small>g</small>
            {stat.resultant.meanWeightsDirectionDeg !== null && (
              <small> · {Math.round(stat.resultant.meanWeightsDirectionDeg)}°</small>
            )}
          </dd>
        </div>
        <div>
          <dt>超合力上限次数</dt>
          <dd className={overResultantCount > 0 ? 'text-danger' : ''}>
            {overResultantCount} / {stat.count}
          </dd>
        </div>
      </dl>

      <div className="batch-table-wrap">
        <table className="batch-table">
          <thead>
            <tr>
              <th>槽号</th>
              <th>均值 (g)</th>
              <th>标准差 σ (g)</th>
              <th>最大偏差 (g)</th>
              <th>最小 / 最大 (g)</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {stat.slots.map((slotStat) => (
              <tr
                key={slotStat.slot}
                className={slotStat.abnormal ? 'row-abnormal' : ''}
                onClick={() => onSelectTrendSlot(slotStat.slot)}
                title="点击查看该槽趋势"
              >
                <td>#{slotStat.slot + 1}</td>
                <td>{fmt(slotStat.mean)}</td>
                <td className={slotStat.stdev > thresholds.slotStdev + 1e-12 ? 'text-danger' : ''}>
                  {fmt(slotStat.stdev)}
                </td>
                <td
                  className={
                    slotStat.maxDeviation > thresholds.slotMaxDeviation + 1e-12
                      ? 'text-danger'
                      : ''
                  }
                >
                  {fmt(slotStat.maxDeviation)}
                </td>
                <td>
                  {fmt(slotStat.min)} / {fmt(slotStat.max)}
                </td>
                <td>
                  {slotStat.abnormal ? (
                    <span className="text-danger">⚠ 异常</span>
                  ) : (
                    <span className="text-ok">正常</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        标准差为样本标准差（n−1），单次称量时 σ 记为 0；点击表格行可查看对应槽位的时间趋势。
      </p>

      <div className="batch-trend-controls">
        <label className="control">
          趋势序列
          <select
            value={String(trendSlot)}
            onChange={(event) => {
              const value = event.target.value;
              onSelectTrendSlot(value === 'resultant' ? 'resultant' : Number(value));
            }}
          >
            <option value="resultant">整批合力大小</option>
            {Array.from({ length: stat.holeCount }, (_, slot) => (
              <option key={slot} value={slot}>
                槽 #{slot + 1} 重量
              </option>
            ))}
          </select>
        </label>
        {activeSlotStat && (
          <span className="hint">
            均值 {fmt(activeSlotStat.mean)} g · σ {fmt(activeSlotStat.stdev)} g ·
            最大偏差 {fmt(activeSlotStat.maxDeviation)} g
            {activeSlotStat.abnormal && <em className="text-danger"> · 该槽异常</em>}
          </span>
        )}
      </div>

      {trendSlot === 'resultant' ? (
        <TrendChart
          title="整批合力时间趋势"
          points={resultantPoints}
          reference={thresholds.batchResultant}
          referenceLabel="合力上限"
          minDomain={0}
        />
      ) : (
        <TrendChart
          title={`槽 #${trendSlot + 1} 称量重量时间趋势`}
          points={slotPoints}
          reference={activeSlotStat?.mean ?? null}
          referenceLabel="均值"
          minDomain={0}
        />
      )}

      <div className="batch-records-head">
        <h3>称量记录（{list.length}）</h3>
        <span className="hint">按时间排列，悬停趋势图数据点可查看数值</span>
      </div>
      <ul className="batch-records">
        {[...list].reverse().map((snapshot) => (
          <li key={snapshot.id} className="saved-row">
            <div className="saved-info">
              <strong>{formatTimeSeconds(snapshot.measuredAt)}</strong>
              <span
                className="hint"
                title={`各槽重量(g)：${snapshot.weights.map((value) => fmt(value)).join(', ')}`}
              >
                合力 {fmt(snapshot.resultantMagnitude)} g
                {snapshot.resultantMagnitude > thresholds.batchResultant + 1e-12 && (
                  <em className="text-danger"> · 超上限</em>
                )}
              </span>
            </div>
            <div className="saved-actions">
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => onDeleteSnapshot(snapshot.id)}
              >
                删除
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
