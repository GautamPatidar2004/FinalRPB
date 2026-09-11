import React from 'react';
import {
  Clock,
  Layers,
  MapPin,
  AlertTriangle,
  CheckCircle,
  FileText,
  Shield,
} from 'lucide-react';
import type { BlockPlanItem } from '../../types';
import { Modal, Badge, Button } from '../common';
import { formatMinuteToTime, formatDuration } from '../../utils';

import { Sliders } from 'lucide-react';

export interface BlockDetailModalProps {
  block: BlockPlanItem | null;
  isOpen: boolean;
  onClose: () => void;
  onModify?: () => void;
  isImmutable?: boolean;
  decisionRationale?: string;
}

export const BlockDetailModal: React.FC<BlockDetailModalProps> = ({
  block,
  isOpen,
  onClose,
  onModify,
  isImmutable = false,
  decisionRationale,
}) => {
  if (!block) return null;

  const hasConflict = block.conflict_flags && block.conflict_flags.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-blue-700 font-bold">
            {block.request_id}
          </span>
          <Badge
            variant={block.status === 'SCHEDULED' ? 'emerald' : 'amber'}
            statusText={block.status}
          />
        </div>
      }
      subtitle={`Scheduled Block Assignment • Plan ${block.plan_id}`}
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div>
            {onModify && !isImmutable && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onModify();
                }}
                leftIcon={<Sliders className="w-3.5 h-3.5 text-blue-600" />}
              >
                Modify Timing
              </Button>
            )}
          </div>
          <Button variant="secondary" onClick={onClose}>
            Close Details
          </Button>
        </div>
      }
    >
      <div className="space-y-5 text-xs text-slate-700">
        {/* Timing Window Banner */}
        <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-blue-900 font-semibold">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-600" />
              Scheduled Operating Window
            </span>
            <span className="font-mono text-sm font-bold">
              {formatDuration(block.allocated_duration_minutes)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-blue-200/60 text-slate-800 font-mono">
            <div>
              <span className="block text-[10px] uppercase font-sans text-slate-400">
                Start Time
              </span>
              <span className="text-sm font-bold text-slate-900">
                {formatMinuteToTime(block.scheduled_start_minute)}
              </span>
              <span className="text-[10px] text-slate-400 block">
                Minute {block.scheduled_start_minute}
              </span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-sans text-slate-400">
                End Time
              </span>
              <span className="text-sm font-bold text-slate-900">
                {formatMinuteToTime(block.scheduled_end_minute)}
              </span>
              <span className="text-[10px] text-slate-400 block">
                Minute {block.scheduled_end_minute}
              </span>
            </div>
          </div>
        </div>

        {/* Infrastructure Details Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Layers className="w-3 h-3 text-slate-400" /> Department
            </span>
            <div className="font-semibold text-slate-900">{block.department}</div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-slate-400" /> Corridor
            </span>
            <div className="font-mono font-bold text-slate-900">{block.corridor_id}</div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Layers className="w-3 h-3 text-slate-400" /> Infrastructure Asset
            </span>
            <div className="font-mono font-bold text-slate-900">{block.asset_id}</div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <FileText className="w-3 h-3 text-slate-400" /> Plan Item ID
            </span>
            <div className="font-mono text-slate-600 truncate" title={block.id || 'N/A'}>
              {block.id || 'Generated In-Memory'}
            </div>
          </div>
        </div>

        {/* Conflict Flags */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Shield className="w-3 h-3 text-slate-400" /> Conflict Status
          </span>
          {hasConflict ? (
            <div className="space-y-1.5">
              {block.conflict_flags.map((flag, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 p-2 bg-red-50 text-red-800 border border-red-200 rounded-lg text-xs font-semibold"
                >
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{flag}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>No constraint violations or train overlaps flagged for this block.</span>
            </div>
          )}
        </div>

        {/* AI Engine Rationale */}
        {decisionRationale && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              AI Scheduling Rationale
            </span>
            <p className="text-slate-700 font-medium leading-relaxed">
              {decisionRationale}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};
