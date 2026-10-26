import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'rounded-lg border border-slate-800 bg-slate-900/50',
        className,
      )}
      {...props}
    />
  );
}
