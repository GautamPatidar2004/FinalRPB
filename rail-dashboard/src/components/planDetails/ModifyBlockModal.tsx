import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, Sliders } from 'lucide-react';
import type { BlockPlanItem, ItemStatus } from '../../types';
import { Modal, Button } from '../common';
import {
  formatMinuteToTime,
  parseTimeToMinute,
  formatDuration,
} from '../../utils';

export interface ModifyBlockModalProps {
  block: BlockPlanItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    itemId: string,
    updates: {
      scheduled_start_minute: number;
      scheduled_end_minute: number;
      allocated_duration_minutes: number;
      status: ItemStatus;
    }
  ) => Promise<void>;
  isSaving: boolean;
}

export const ModifyBlockModal: React.FC<ModifyBlockModalProps> = ({
  block,
  isOpen,
  onClose,
  onSave,
  isSaving,
}) => {
  const [startTime, setStartTime] = useState<string>('00:00');
  const [endTime, setEndTime] = useState<string>('00:00');
  const [status, setStatus] = useState<ItemStatus>('SCHEDULED');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (block) {
      setStartTime(formatMinuteToTime(block.scheduled_start_minute));
      setEndTime(formatMinuteToTime(block.scheduled_end_minute));
      setStatus(block.status || 'SCHEDULED');
      setError(null);
    }
  }, [block]);

  if (!block) return null;

  const startMin = parseTimeToMinute(startTime);
  const endMin = parseTimeToMinute(endTime);
  const durationMin = Math.max(0, endMin - startMin);
  const isValid = startMin <= endMin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      setError('Start time must be strictly earlier than or equal to end time.');
      return;
    }

    const itemId = block.id || block.request_id;
    try {
      setError(null);
      await onSave(itemId, {
        scheduled_start_minute: startMin,
        scheduled_end_minute: endMin,
        allocated_duration_minutes: durationMin,
        status,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update plan block item.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-600" />
          <span>Modify Block Timing</span>
          <span className="font-mono text-blue-700 text-xs px-2 py-0.5 rounded bg-blue-50 border border-blue-200">
            {block.request_id}
          </span>
        </div>
      }
      subtitle={`Adjust schedule window or operational status for ${block.department} on ${block.corridor_id}`}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={isSaving}
            disabled={!isValid}
          >
            Save & Re-Validate
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs text-slate-700">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Read-only Context */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px]">
          <div>
            <span className="block text-[10px] uppercase font-sans text-slate-400">
              Corridor
            </span>
            <span className="font-semibold text-slate-800">{block.corridor_id}</span>
          </div>
          <div>
            <span className="block text-[10px] uppercase font-sans text-slate-400">
              Asset
            </span>
            <span className="font-semibold text-slate-800">{block.asset_id}</span>
          </div>
        </div>

        {/* Start and End Time Inputs */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-800 text-xs">
              Scheduled Start (HH:MM)
            </label>
            <div className="relative">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:outline-none focus:border-blue-500"
              />
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              Minute {startMin} of day
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-800 text-xs">
              Scheduled End (HH:MM)
            </label>
            <div className="relative">
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:outline-none focus:border-blue-500"
              />
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              Minute {endMin} of day
            </span>
          </div>
        </div>

        {/* Calculated Duration Banner */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between font-mono">
          <div className="flex items-center gap-2 text-blue-900 font-medium">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>Synchronized Duration:</span>
          </div>
          <span className="font-bold text-blue-800">
            {formatDuration(durationMin)} ({durationMin} min)
          </span>
        </div>

        {/* Status Selection */}
        <div className="space-y-1.5">
          <label className="block font-semibold text-slate-800 text-xs">
            Operational Block Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ItemStatus)}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-500"
          >
            <option value="SCHEDULED">SCHEDULED (Active track possession)</option>
            <option value="DEFERRED">DEFERRED (Postponed for later window)</option>
            <option value="REJECTED">REJECTED (Not approved for track)</option>
          </select>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed">
          Saving updates will automatically invoke RailwayConstraintEngine to re-evaluate track headways and train safety clearances.
        </p>
      </form>
    </Modal>
  );
};
