import { CircleHelp, Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PlaybackBar() {
  return (
    <footer
      className="border-t border-slate-800 bg-[#0b111b] px-5 py-3"
      aria-label="Simulation playback"
    >
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1">
          <Button disabled size="icon" aria-label="Play simulation (pending)">
            <Play size={15} />
          </Button>
          <Button
            disabled
            variant="ghost"
            size="icon"
            aria-label="Pause simulation (pending)"
          >
            <Pause size={15} />
          </Button>
          <Button
            disabled
            variant="ghost"
            size="icon"
            aria-label="Reset simulation (pending)"
          >
            <RotateCcw size={15} />
          </Button>
        </div>
        <div className="hidden h-6 w-px bg-slate-800 sm:block" />
        <label className="flex items-center gap-2 text-[10px] text-slate-500">
          Speed
          <select
            disabled
            className="rounded border border-slate-800 bg-slate-900 p-1.5 text-slate-500"
          >
            <option>1×</option>
          </select>
        </label>
        <div className="min-w-36 flex-1">
          <div className="mb-1.5 flex justify-between text-[9px] uppercase tracking-wider text-slate-600">
            <label htmlFor="timeline">Timeline · pending</label>
            <span>Not started</span>
          </div>
          <input
            id="timeline"
            type="range"
            disabled
            defaultValue="0"
            min="0"
            max="100"
            className="h-1 w-full accent-cyan-300 opacity-30"
          />
        </div>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <CircleHelp size={12} />
          Engine UI integration pending
        </span>
      </div>
    </footer>
  );
}
