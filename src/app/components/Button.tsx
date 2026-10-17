import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-indigo-500 text-white shadow-[0_10px_30px_-12px_rgb(99_102_241/0.9)] hover:bg-indigo-400 active:bg-indigo-600',
  secondary: 'bg-slate-800 text-slate-100 ring-1 ring-inset ring-slate-700 hover:bg-slate-700 active:bg-slate-800',
  danger:
    'bg-red-600 text-white shadow-[0_10px_30px_-12px_rgb(239_68_68/0.9)] hover:bg-red-500 active:bg-red-700',
  ghost: 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100 active:bg-slate-800',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export default function Button({ variant = 'primary', className = '', type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-lg font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}
