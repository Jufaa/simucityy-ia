'use client';
import dynamic from 'next/dynamic';
import { TopBar } from '@/components/layout/top-bar';
import { ConfigurationPanel } from './configuration-panel';
import { InsightsPanel } from './insights-panel';
import { PlaybackBar } from './playback-bar';

const CityMap = dynamic(() => import('@/components/map/city-map'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full min-h-[420px] place-items-center bg-[#101c26] text-xs text-slate-500">
      Preparing map renderer…
    </div>
  ),
});
export function SimulatorDashboard() {
  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <TopBar />
      <main className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
        <div className="lg:overflow-y-auto">
          <ConfigurationPanel />
        </div>
        <section
          className="relative min-h-[420px]"
          aria-label="City exploration"
        >
          <CityMap />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-slate-950/60 to-transparent px-4 pb-3 pt-8">
            <span className="rounded-full border border-slate-600/50 bg-slate-950/80 px-3 py-1.5 text-[9px] uppercase tracking-widest text-slate-300">
              Exploration only · no active hazard simulation
            </span>
          </div>
        </section>
        <div className="lg:overflow-y-auto">
          <InsightsPanel />
        </div>
      </main>
      <PlaybackBar />
    </div>
  );
}
