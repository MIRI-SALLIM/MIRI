export interface ProgressProps {
  label: string;
  max: number;
  value: number;
}

export function Progress({ label, max, value }: ProgressProps) {
  const boundedMax = Math.max(0, max);
  const boundedValue = Math.min(Math.max(0, value), boundedMax);
  const percentage = boundedMax === 0 ? 0 : (boundedValue / boundedMax) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-semibold text-ink-muted">{label}</span>
        <span className="font-bold tabular-nums text-ink">
          {boundedValue} / {boundedMax}
        </span>
      </div>
      <div
        aria-label={label}
        aria-valuemax={boundedMax}
        aria-valuemin={0}
        aria-valuenow={boundedValue}
        className="h-2.5 overflow-hidden rounded-full bg-[#F0F0ED]"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-green transition-[width] duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
