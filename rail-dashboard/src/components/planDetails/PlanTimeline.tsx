import React, { useState } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import type { BlockPlanItem, Train } from '../../types';
import { formatMinuteToTime, formatDuration } from '../../utils';

export interface PlanTimelineProps {
  items: BlockPlanItem[];
  onSelectBlock: (block: BlockPlanItem) => void;
  selectedBlockId?: string;
  trains?: Train[];
}

const deptColors: Record<string, { bg: string; border: string; text: string; lightBg: string }> = {
  Engineering: {
    bg: 'bg-blue-600',
    border: 'border-blue-700',
    text: 'text-white',
    lightBg: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  'Traction Distribution': {
    bg: 'bg-amber-600',
    border: 'border-amber-700',
    text: 'text-white',
    lightBg: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  'Signalling & Telecom': {
    bg: 'bg-purple-600',
    border: 'border-purple-700',
    text: 'text-white',
    lightBg: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  Operations: {
    bg: 'bg-cyan-600',
    border: 'border-cyan-700',
    text: 'text-white',
    lightBg: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  },
  General: {
    bg: 'bg-slate-600',
    border: 'border-slate-700',
    text: 'text-white',
    lightBg: 'bg-slate-100 text-slate-800 border-slate-200',
  },
};

export const PlanTimeline: React.FC<PlanTimelineProps> = ({
  items,
  onSelectBlock,
  selectedBlockId,
  trains = [],
}) => {
  const [hoveredBlock, setHoveredBlock] = useState<BlockPlanItem | null>(null);

  // Group items by corridor for organized timeline rows
  const groupedByCorridor = items.reduce<Record<string, BlockPlanItem[]>>((acc, item) => {
    const key = item.corridor_id || 'Unassigned Corridor';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const corridorKeys = Object.keys(groupedByCorridor);

  // 24-hour hour marks (00:00, 02:00, ... 24:00)
  const hourTicks = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_12px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.05)] p-6 space-y-5 overflow-hidden">
      {/* Header & Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[18.5px] font-bold text-slate-900">
              Operational Block Timeline
            </h2>
            <span className="text-[15px] font-medium text-slate-400">
              (24-Hour Schedule Distribution)
            </span>
          </div>
          <p className="text-[15px] text-slate-500 mt-0.5">
            Real time-slot placements rendered from engine start and end timestamps. Click any block to view full details.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[15px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-600"></span>
            <span className="text-slate-600 font-medium">Engineering</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-600"></span>
            <span className="text-slate-600 font-medium">TRD (Traction)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-600"></span>
            <span className="text-slate-600 font-medium">S&T</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-600"></span>
            <span className="text-slate-600 font-medium">Operations</span>
          </div>
          <div className="flex items-center gap-1.5 text-red-600 font-medium">
            <AlertTriangle className="w-3 h-3" />
            <span>Conflict Flag</span>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-[15px]">
          No scheduled blocks to display on timeline.
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="min-w-[780px]">
            {/* Time Axis (00:00 to 24:00) */}
            <div className="grid grid-cols-12 text-[12.5px] font-mono text-slate-400 pb-2 border-b border-slate-200">
              {hourTicks.slice(0, 12).map((h) => (
                <div key={h} className="text-left pl-1 border-l border-slate-200 h-4">
                  {h.toString().padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Timeline Rows per Corridor */}
            <div className="space-y-5 pt-3">
              {corridorKeys.map((corridorId) => {
                const corridorItems = [...groupedByCorridor[corridorId]].sort(
                  (a, b) => a.scheduled_start_minute - b.scheduled_start_minute
                );
                const corridorTrains = trains.filter((t) => t.corridor_id === corridorId);

                return (
                  <div key={corridorId} className="space-y-2 p-3 bg-slate-50/50 rounded-xl border border-slate-200/60">
                    <div className="flex items-center justify-between text-[15px] text-slate-500 font-medium px-1">
                      <span className="font-mono font-semibold text-slate-800">
                        {corridorId}
                      </span>
                      <span>{corridorItems.length} block assignments</span>
                    </div>

                    {/* Maintenance Track Timeline Bar Container */}
                    <div className="relative h-12 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                      {/* Grid background markers */}
                      <div className="absolute inset-0 grid grid-cols-12 pointer-events-none">
                        {hourTicks.slice(0, 12).map((h) => (
                          <div
                            key={h}
                            className="border-r border-slate-200/60 h-full"
                          />
                        ))}
                      </div>

                      {/* Scheduled Block Rectangles */}
                      {corridorItems.map((block) => {
                        const start = Math.max(0, block.scheduled_start_minute);
                        const end = Math.min(1440, block.scheduled_end_minute);
                        const duration = Math.max(1, end - start);
                        const leftPct = (start / 1440) * 100;
                        const widthPct = Math.max(2.5, (duration / 1440) * 100);

                        const color = deptColors[block.department] || deptColors.General;
                        const hasConflict = block.conflict_flags && block.conflict_flags.length > 0;
                        const isSelected = selectedBlockId === (block.id || block.request_id);

                        return (
                          <button
                            key={block.id || block.request_id}
                            type="button"
                            onClick={() => onSelectBlock(block)}
                            onMouseEnter={() => setHoveredBlock(block)}
                            onMouseLeave={() => setHoveredBlock(null)}
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                            }}
                            className={`absolute top-1.5 bottom-1.5 rounded-lg px-2 flex items-center justify-between gap-1 transition-all cursor-pointer shadow-sm text-left ${
                              color.bg
                            } ${color.text} ${
                              isSelected
                                ? 'ring-2 ring-offset-1 ring-blue-600 scale-[1.02] z-20'
                                : 'hover:scale-[1.01] hover:shadow-md z-10'
                            } ${hasConflict ? 'ring-2 ring-red-500 animate-pulse' : ''}`}
                            title={`${block.request_id} | ${formatMinuteToTime(
                              start
                            )} - ${formatMinuteToTime(end)} (${formatDuration(duration)})`}
                          >
                            <span className="text-[12.5px] font-mono font-bold truncate">
                              {block.request_id}
                            </span>
                            <span className="text-[11.5px] opacity-90 truncate hidden md:inline">
                              {formatMinuteToTime(start)}
                            </span>
                            {hasConflict && (
                              <AlertTriangle className="w-3 h-3 text-red-200 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Operational Train Timetable Overlay Track */}
                    {corridorTrains.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <div className="flex items-center gap-1.5 text-[11.5px] font-mono text-slate-500 pl-1">
                          <span>🚆 Scheduled Trains ({corridorTrains.length} paths):</span>
                        </div>
                        <div className="relative h-6 bg-slate-100 border border-slate-200/80 rounded-lg overflow-hidden">
                          <div className="absolute inset-0 grid grid-cols-12 pointer-events-none">
                            {hourTicks.slice(0, 12).map((h) => (
                              <div key={h} className="border-r border-slate-200/50 h-full" />
                            ))}
                          </div>
                          {corridorTrains.map((tr) => {
                            const tStart = Math.max(0, tr.entry_minute);
                            const tEnd = Math.min(1440, tr.exit_minute);
                            const tDuration = Math.max(1, tEnd - tStart);
                            const leftPct = (tStart / 1440) * 100;
                            const widthPct = Math.max(2, (tDuration / 1440) * 100);
                            return (
                              <div
                                key={tr.train_id}
                                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                className="absolute top-1 bottom-1 rounded bg-slate-700 text-slate-100 px-1 text-[10.5px] font-mono flex items-center justify-between truncate shadow-2xs select-none"
                                title={`Train ${tr.train_id} (${tr.train_type}) | ${formatMinuteToTime(
                                  tStart
                                )} - ${formatMinuteToTime(tEnd)} | Priority: ${tr.priority_level}`}
                              >
                                <span className="truncate">{tr.train_id}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      )}

      {/* Hover Information Strip */}
      {hoveredBlock && (
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-[15px]">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
              {hoveredBlock.request_id}
            </span>
            <span className="font-semibold text-slate-800">
              {hoveredBlock.department}
            </span>
            <span className="text-slate-400">•</span>
            <span className="font-mono text-slate-600">
              Asset: {hoveredBlock.asset_id}
            </span>
            <span className="text-slate-400">•</span>
            <span className="font-mono text-slate-600">
              Corridor: {hoveredBlock.corridor_id}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-slate-700">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>
              {formatMinuteToTime(hoveredBlock.scheduled_start_minute)} –{' '}
              {formatMinuteToTime(hoveredBlock.scheduled_end_minute)} (
              {formatDuration(hoveredBlock.allocated_duration_minutes)})
            </span>
            {hoveredBlock.conflict_flags?.length > 0 && (
              <span className="text-red-600 font-sans font-semibold">
                ⚠️ {hoveredBlock.conflict_flags.join(', ')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
