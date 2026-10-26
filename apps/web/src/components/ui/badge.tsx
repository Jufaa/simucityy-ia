import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
export function Badge({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-400',
        className,
      )}
      {...props}
    />
  );
}
