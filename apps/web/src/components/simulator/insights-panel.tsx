import {
  Activity,
  ArrowUpRight,
  Bot,
  Building2,
  GitBranch,
  Network,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { demoScenario } from '@simulicity/shared';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function InsightsPanel() {
  return (
    <aside
      className="border-t border-slate-800 bg-[#0c131e] lg:border-l lg:border-t-0"
      aria-label="Scenario information"
    >
      <div className="panel-heading">
        <Activity size={14} />
        <h2>Scenario insights</h2>
        <span className="ml-auto text-[9px] text-slate-600">02</span>
      </div>
      <div className="space-y-5 p-4">
        <Card className="p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">
              Active scenario
            </span>
            <GitBranch size={13} className="text-cyan-400" />
          </div>
          <h3 className="mt-3 text-sm font-medium text-slate-100">
            Miami · empty demo
          </h3>
          <p className="mt-1 text-[10px] text-slate-500">
            Seed {demoScenario.seed} · synthetic scenario
          </p>
          <div className="mt-3 border-t border-slate-800 pt-3">
            <Badge className="border-amber-700/40 bg-amber-300/5 text-amber-300">
              No simulation results
            </Badge>
          </div>
        </Card>
        <section>
          <h3 className="section-label">Impact overview</h3>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            {[
              { label: 'Population', icon: Users },
              { label: 'Affected buildings', icon: Building2 },
              { label: 'Infrastructure', icon: Network },
              { label: 'Evacuated', icon: ShieldCheck },
            ].map(({ label, icon: Icon }) => (
              <div
                key={label}
                className="rounded-md border border-slate-800 bg-slate-900/35 p-3"
              >
                <Icon size={14} className="text-slate-500" />
                <dt className="mt-3 text-[10px] text-slate-500">{label}</dt>
                <dd
                  className="mt-1 text-xl font-light text-slate-400"
                  aria-label={`${label}: unavailable`}
                >
                  —
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
            Unavailable until world data is imported and the corresponding
            simulation module runs.
          </p>
        </section>
        <section className="overflow-hidden rounded-lg border border-cyan-900/60 bg-gradient-to-b from-cyan-950/20 to-transparent">
          <div className="flex items-center gap-2 border-b border-cyan-950 p-3">
            <Bot size={16} className="text-cyan-300" />
            <h3 className="text-xs font-medium text-slate-200">
              AI planning assistant
            </h3>
            <Badge className="ml-auto text-[8px]">Pending</Badge>
          </div>
          <div className="p-3">
            <p className="text-[11px] leading-relaxed text-slate-500">
              Meta provider contracts are prepared. Muse Spark analysis and tool
              execution are not connected.
            </p>
            <div className="mt-4 space-y-2">
              {[
                'Analyze scenario impact',
                'Propose interventions',
                'Compare scenario variants',
              ].map((label) => (
                <div
                  key={label}
                  className="flex items-center justify-between text-[10px] text-slate-600"
                >
                  <span>{label}</span>
                  <ArrowUpRight size={12} />
                </div>
              ))}
            </div>
            <Button disabled variant="outline" className="mt-4 w-full">
              <Bot size={13} />
              Analyze scenario
            </Button>
          </div>
        </section>
        <p className="text-[9px] leading-relaxed text-slate-600">
          Research prototype. Not validated for emergency response or public
          safety decisions.
        </p>
      </div>
    </aside>
  );
}
