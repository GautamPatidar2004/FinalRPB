import React from 'react';
import { MapPin } from 'lucide-react';
import type { CorridorAvailability } from '../../types';
import { Badge } from '../common';
import { formatMinuteToTime } from '../../utils';

export interface CorridorStatusGridProps {
  corridors: CorridorAvailability[];
}

export const CorridorStatusGrid: React.FC<CorridorStatusGridProps> = ({ corridors }) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-[0_2px_12px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.05)] space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-600" />
            Corridor Operational Windows & Track Capacity
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Confirmed operational windows and maximum parallel block limits across active sections.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {corridors.map((c) => (
          <div
            key={c.corridor_id}
            className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-blue-700">
                {c.corridor_id}
              </span>
              <Badge
                variant={c.is_electrified ? 'emerald' : 'amber'}
                statusText={c.is_electrified ? '25kV OHE' : 'NON-ELEC'}
              />
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-snug">
                {c.name}
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-[11px] font-mono text-slate-600">
              <div className="space-y-0.5">
                <span className="block text-[10px] uppercase font-sans text-slate-400">
                  Window
                </span>
                <span className="font-semibold text-slate-800">
                  {formatMinuteToTime(c.available_start_minute)} –{' '}
                  {formatMinuteToTime(c.available_end_minute)}
                </span>
              </div>

              <div className="space-y-0.5">
                <span className="block text-[10px] uppercase font-sans text-slate-400">
                  Max Parallel
                </span>
                <span className="font-semibold text-slate-800">
                  {c.max_parallel_blocks} Blocks
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
