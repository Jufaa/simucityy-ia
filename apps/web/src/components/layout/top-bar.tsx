'use client';
import { Boxes, ChevronDown, MapPin } from 'lucide-react';
import { demoCity, demoScenario } from '@simulicity/shared';
import { Badge } from '@/components/ui/badge';
import { useApiHealth } from '@/hooks/use-api-health';

export function TopBar() {
  const api = useApiHealth();
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-[#0b111b] px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-300/10 text-cyan-300">
          <Boxes size={22} />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight text-white">
            Simulicity <span className="text-cyan-300">IA</span>
          </h1>
          <p className="text-[9px] uppercase tracking-[0.22em] text-slate-500">
            Urban simulation workspace
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="flex items-center gap-1.5 text-slate-300">
          <MapPin size={13} className="text-slate-500" />
          {demoCity.name}, US
        </span>
        <span className="hidden h-5 w-px bg-slate-800 sm:block" />
        <label className="relative flex items-center">
          <span className="sr-only">Scenario</span>
          <select
            className="appearance-none rounded-md border border-slate-700 bg-slate-900 py-2 pl-3 pr-8 text-xs text-slate-300"
            aria-label="Scenario"
          >
            <option>{demoScenario.name}</option>
          </select>
          <ChevronDown
            size={12}
            className="pointer-events-none absolute right-2 text-slate-500"
          />
        </label>
        <Badge>Not started</Badge>
      </div>
      <div
        className="flex items-center gap-2 text-[10px] uppercase tracking-wide"
        aria-live="polite"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${api === 'online' ? 'bg-emerald-400' : api === 'offline' ? 'bg-amber-400' : 'bg-slate-500'}`}
        />
        <span className="text-slate-400">API {api}</span>
      </div>
    </header>
  );
}
