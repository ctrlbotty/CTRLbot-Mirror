import clsx from 'clsx';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

/* ----------------------------------------------------------------- button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-beam-500 text-ink-950 font-semibold hover:bg-beam-400 active:bg-beam-600 disabled:bg-ink-700 disabled:text-mist-400',
  secondary:
    'bg-ink-700 text-mist-100 hover:bg-ink-600 active:bg-ink-800 disabled:bg-ink-800 disabled:text-mist-400',
  ghost:
    'bg-transparent text-mist-300 hover:bg-ink-700 hover:text-mist-100 disabled:text-mist-400 disabled:hover:bg-transparent',
  danger:
    'bg-alert-500/15 text-alert-400 hover:bg-alert-500/25 disabled:bg-ink-800 disabled:text-mist-400',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
};

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center whitespace-nowrap transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam-400',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ComponentPropsWithoutRef<'button'> {
  label: string;
  active?: boolean;
  tone?: 'default' | 'danger';
}

export function IconButton({
  label,
  active,
  tone = 'default',
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      title={label}
      aria-label={label}
      className={clsx(
        'inline-flex size-9 items-center justify-center rounded-xl transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-beam-400',
        'disabled:text-mist-400 disabled:hover:bg-transparent',
        active
          ? 'bg-beam-500/20 text-beam-300'
          : tone === 'danger'
            ? 'text-alert-400 hover:bg-alert-500/15'
            : 'text-mist-300 hover:bg-ink-700 hover:text-mist-100',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ layout */

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('flex min-h-0 flex-col', className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-wide text-mist-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-mist-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
    </section>
  );
}

export function Card({
  children,
  className,
  ...rest
}: ComponentPropsWithoutRef<'div'> & { children: ReactNode }) {
  return (
    <div
      className={clsx('rounded-2xl border border-ink-700 bg-ink-850/70 p-4', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-mist-400 uppercase">
      {children}
    </h3>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-mist-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-mist-400">{hint}</span>}
    </label>
  );
}

export function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-mist-200">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-snug text-mist-400">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ inputs */

export function TextInput({ className, ...rest }: ComponentPropsWithoutRef<'input'>) {
  return (
    <input
      className={clsx(
        'h-9 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 text-sm text-mist-100',
        'placeholder:text-mist-400 focus:border-beam-500 focus:outline-none',
        className,
      )}
      {...rest}
    />
  );
}

export function Select({
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<'select'> & { children: ReactNode }) {
  return (
    <select
      className={clsx(
        'h-9 w-full rounded-lg border border-ink-700 bg-ink-900 px-2.5 text-sm text-mist-100',
        'focus:border-beam-500 focus:outline-none',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange(next: boolean): void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-5 w-9 rounded-full transition-colors disabled:opacity-40',
        checked ? 'bg-beam-500' : 'bg-ink-600',
      )}
    >
      <span
        className={clsx(
          'absolute top-0.5 size-4 rounded-full bg-white transition-transform',
          checked ? 'translate-x-4.5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(next: number): void;
  format?(value: number): string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-600 accent-beam-500"
      />
      <span className="w-14 shrink-0 text-right font-mono text-[11px] text-mist-300">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ status */

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info';
  children: ReactNode;
}) {
  const tones = {
    neutral: 'bg-ink-700 text-mist-300',
    good: 'bg-signal-500/15 text-signal-400',
    warn: 'bg-warn-400/15 text-warn-400',
    bad: 'bg-alert-500/15 text-alert-400',
    info: 'bg-beam-500/15 text-beam-300',
  } as const;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  );
}

export function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon?: ReactNode;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && <div className="text-mist-400">{icon}</div>}
      <p className="text-sm font-medium text-mist-200">{title}</p>
      {detail && <p className="max-w-xs text-xs leading-relaxed text-mist-400">{detail}</p>}
      {action}
    </div>
  );
}
