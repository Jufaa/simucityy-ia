'use client';
import {
  Building2,
  Check,
  ChevronRight,
  Flame,
  Search,
  SlidersHorizontal,
  Tornado,
  Waves,
  Zap,
} from 'lucide-react';
import { demoCity, type Hazard } from '@simulicity/shared';
import { useSimulatorStore } from '@/stores/simulator-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const hazards = [
  { kind: 'flood', label: 'Flood', icon: Waves },
  { kind: 'earthquake', label: 'Earthquake', icon: Zap },
  { kind: 'fire', label: 'Wildfire', icon: Flame },
  { kind: 'tornado', label: 'Tornado', icon: Tornado },
] as const;

export function ConfigurationPanel() {
  const { hazard, setHazard, cityQuery, setCityQuery } = useSimulatorStore();
  const cityMatches = `${demoCity.name} ${demoCity.country}`
    .toLowerCase()
    .includes(cityQuery.toLowerCase());
  return (
    <aside
      className="border-b border-slate-800 bg-[#0c131e] lg:border-b-0 lg:border-r"
      aria-label="Scenario configuration"
    >
      <div className="panel-heading">
        <SlidersHorizontal size={14} />
        <h2>Configuration</h2>
        <span className="ml-auto text-[9px] text-slate-600">01</span>
      </div>
      <div className="space-y-6 p-4">
        <section>
          <h3 className="section-label">Area of interest</h3>
          <label className="relative mt-3 block">
            <Search
              size={14}
              className="absolute left-3 top-3 text-slate-500"
            />
            <input
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              placeholder="Search demo cities…"
              aria-label="Search demo cities"
              className="h-10 w-full rounded-md border border-slate-700/70 bg-slate-950/60 pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-500"
            />
          </label>
          {cityMatches ? (
            <div className="mt-2 flex items-center gap-3 rounded-md border border-cyan-700/40 bg-cyan-400/5 p-3">
              <div className="grid h-8 w-8 place-items-center rounded bg-cyan-400/10 text-cyan-300">
                <Building2 size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-200">
                  Miami, United States
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  Local demo · not an imported city
                </p>
              </div>
              <Check size={14} className="text-cyan-300" />
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-500">
              No local demo matches. City import is pending.
            </p>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Basemap explores real geography. Scenario data is synthetic and
            empty.
          </p>
        </section>
        <section>
          <div className="flex items-center justify-between">
            <h3 className="section-label">Hazard type</h3>
            <Badge>Preview only</Badge>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {hazards.map(({ kind, label, icon: Icon }) => (
              <button
                key={kind}
                type="button"
                aria-pressed={hazard === kind}
                onClick={() => setHazard(kind as Hazard['kind'])}
                className={`flex flex-col items-start gap-3 rounded-md border p-3 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-cyan-300 ${hazard === kind ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200' : 'border-slate-800 bg-slate-950/30 text-slate-500 hover:border-slate-600'}`}
              >
                <Icon size={19} />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Selection changes this preview only. All hazard models are pending.
          </p>
        </section>
        <section>
          <h3 className="section-label">Simulation settings</h3>
          <fieldset disabled className="mt-3 space-y-4 opacity-40">
            <div>
              <label
                htmlFor="water-level"
                className="flex justify-between text-[11px] text-slate-300"
              >
                Water level<span>Pending</span>
              </label>
              <input
                id="water-level"
                type="range"
                min="0"
                max="10"
                defaultValue="0"
                className="mt-3 w-full accent-cyan-300"
              />
            </div>
            <label className="flex items-center justify-between text-[11px] text-slate-300">
              Population model
              <select className="rounded border border-slate-700 bg-slate-900 p-1 text-[10px]">
                <option>Not implemented</option>
              </select>
            </label>
          </fieldset>
        </section>
        <section className="rounded-lg border border-dashed border-slate-700/70 p-3">
          <div className="flex items-center gap-2 text-slate-400">
            <Building2 size={15} />
            <h3 className="text-xs font-medium">Infrastructure editor</h3>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
            Shelters, drainage, and road interventions will be available in a
            future module.
          </p>
          <Button
            disabled
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-between px-0"
          >
            Edit infrastructure
            <ChevronRight size={13} />
          </Button>
        </section>
      </div>
    </aside>
  );
}
