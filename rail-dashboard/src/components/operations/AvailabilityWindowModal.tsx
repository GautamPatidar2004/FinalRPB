import React, { useState, useEffect } from 'react';
import { Clock, Sliders, AlertCircle, Zap } from 'lucide-react';
import type { Corridor, DashboardCorridor } from '../../types';
import { Modal, Button } from '../common';
import { operationalService } from '../../services';
import { formatMinuteToTime, parseTimeToMinute } from '../../utils/formatters';

interface AvailabilityWindowModalProps {
  corridor: (Corridor | DashboardCorridor) | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AvailabilityWindowModal: React.FC<AvailabilityWindowModalProps> = ({
  corridor,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('24:00');
  const [maxParallel, setMaxParallel] = useState(2);
  const [isElectrified, setIsElectrified] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (corridor) {
      setStartTime(formatMinuteToTime(corridor.available_start_minute));
      setEndTime(formatMinuteToTime(corridor.available_end_minute));
      setMaxParallel(corridor.max_parallel_blocks || 2);
      setIsElectrified(corridor.is_electrified ?? true);
      setError(null);
    }
  }, [corridor, isOpen]);

  if (!corridor) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const startMin = parseTimeToMinute(startTime);
    const endMin = parseTimeToMinute(endTime);

    if (endMin <= startMin) {
      setError('Available end time must be greater than start time.');
      return;
    }

    if (maxParallel < 1) {
      setError('Max parallel blocks must be at least 1.');
      return;
    }

    setIsSaving(true);
    try {
      await operationalService.updateAvailability(corridor.corridor_id, {
        available_start_minute: startMin,
        available_end_minute: endMin,
        max_parallel_blocks: Number(maxParallel),
        is_electrified: isElectrified,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update corridor availability window.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-blue-600" />
          <span>Configure Availability Window</span>
        </div>
      }
      subtitle={`Section: ${corridor.corridor_id} • ${corridor.name}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-[16.5px]">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-[15px] text-red-700">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-[15px] font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              Window Start
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-[16.5px] text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-blue-600"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[15px] font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              Window End
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-[16.5px] text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-blue-600"
              required
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-[15px] font-semibold text-slate-700 uppercase tracking-wider">
            Max Simultaneous Parallel Maintenance Blocks
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={maxParallel}
            onChange={(e) => setMaxParallel(Number(e.target.value))}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-[16.5px] text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-blue-600"
            required
          />
          <p className="text-[12.5px] text-slate-500">
            Controls max simultaneous work gangs allowed without triggering congestion violations.
          </p>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <label className="flex items-center gap-2 cursor-pointer text-[15px] font-medium text-slate-800">
            <input
              type="checkbox"
              checked={isElectrified}
              onChange={(e) => setIsElectrified(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
            />
            <span className="flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-blue-600" />
              25kV AC Traction Electrification Active
            </span>
          </label>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" isLoading={isSaving}>
            Save Window
          </Button>
        </div>
      </form>
    </Modal>
  );
};
