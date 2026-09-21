/** 数字显示：最多保留 3 位小数并去掉尾随 0 */
export function fmt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

/** 角度显示：整数 + 度 */
export function fmtDeg(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value)}°`;
}

export function parseWeight(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  // 与输入框精度对齐，避免浮点噪声
  return Math.round(value * 1e6) / 1e6;
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 秒级时间显示：YYYY-MM-DD HH:mm:ss */
export function formatTimeSeconds(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${formatTime(timestamp)}:${pad(date.getSeconds())}`;
}

/** 仅时间部分 HH:mm:ss（趋势图、快照列表紧凑展示用） */
export function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}`;
}
