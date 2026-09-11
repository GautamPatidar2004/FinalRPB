import React, { useState, useMemo } from 'react';
import { PlusCircle, AlertCircle, Clock } from 'lucide-react';
import type { Corridor, Asset, Department, Priority } from '../../types';
import { Modal, Button, Input } from '../common';
import { operationalService, type CreateRequestPayload } from '../../services/operationalService';
import { parseTimeToMinute } from '../../utils/formatters';

interface RequestCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  corridors: Corridor[];
  assets: Asset[];
}

const DEPARTMENTS: Department[] = [
  'Engineering',
  'Traction Distribution',
  'Signalling & Telecom',
  'Operations',
];

const URGENCIES: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export const RequestCreateModal: React.FC<RequestCreateModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  corridors,
  assets,
}) => {
  const [requestId, setRequestId] = useState('');
  const [department, setDepartment] = useState<Department>('Engineering');
  const [corridorId, setCorridorId] = useState<string>(corridors[0]?.corridor_id || '');
  const [assetId, setAssetId] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(120);
  const [startTime, setStartTime] = useState<string>('01:30');
  const [endTime, setEndTime] = useState<string>('05:30');
  const [urgency, setUrgency] = useState<Priority>('MEDIUM');
  const [linkedDefectId, setLinkedDefectId] = useState<string>('');
  const [isPowerBlock, setIsPowerBlock] = useState<boolean>(false);
  const [isTrafficBlock, setIsTrafficBlock] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Filter available assets when corridor selection changes
  const corridorAssets = useMemo(() => {
    if (!corridorId) return [];
    return assets.filter((a) => a.corridor_id === corridorId);
  }, [corridorId, assets]);

  // Sync corridor selection if needed
  React.useEffect(() => {
    if (!corridorId && corridors.length > 0) {
      setCorridorId(corridors[0].corridor_id);
    }
  }, [corridors, corridorId]);

  // Sync asset selection if current asset does not belong to selected corridor
  React.useEffect(() => {
    if (corridorAssets.length > 0) {
      const exists = corridorAssets.some((a) => a.asset_id === assetId);
      if (!exists) {
        setAssetId(corridorAssets[0].asset_id);
      }
    } else {
      setAssetId('');
    }
  }, [corridorAssets, assetId]);

  // Pre-fill a unique request ID on open
  React.useEffect(() => {
    if (isOpen && !requestId) {
      const prefix = department === 'Engineering' ? 'ENG' : department === 'Traction Distribution' ? 'TRD' : 'SNT';
      const randNum = Math.floor(100 + Math.random() * 900);
      setRequestId(`REQ-${prefix}-${randNum}`);
    }
  }, [isOpen, department, requestId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!requestId.trim()) {
      setFormError('Request ID is required.');
      return;
    }
    if (!corridorId) {
      setFormError('Please select a corridor.');
      return;
    }
    if (!assetId) {
      setFormError('Please select a target asset.');
      return;
    }

    const startMin = parseTimeToMinute(startTime);
    const endMin = parseTimeToMinute(endTime);

    if (endMin <= startMin) {
      setFormError('Latest end time must be after earliest start time.');
      return;
    }

    const windowSpan = endMin - startMin;
    if (durationMinutes > windowSpan) {
      setFormError(
        `Required duration (${durationMinutes}m) exceeds available time window span (${windowSpan}m).`
      );
      return;
    }

    const payload: CreateRequestPayload = {
      request_id: requestId.trim(),
      department,
      corridor_id: corridorId,
      asset_id: assetId,
      required_duration_minutes: Number(durationMinutes),
      earliest_start_minute: startMin,
      latest_end_minute: endMin,
      is_power_block_required: isPowerBlock,
      is_traffic_block_required: isTrafficBlock,
      urgency,
      linked_defect_id: linkedDefectId.trim() || undefined,
    };

    setIsSubmitting(true);
    try {
      await operationalService.createRequest(payload);
      onSuccess();
      onClose();
      // Reset
      setRequestId('');
      setLinkedDefectId('');
    } catch (err: any) {
      setFormError(err?.message || 'Failed to submit maintenance block request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      title={
        <div className="flex items-center gap-2">
          <PlusCircle className="w-5 h-5 text-blue-600" />
          <span>Submit Maintenance Block Request</span>
        </div>
      }
      subtitle="Register departmental track, OHE, or signalling possession request"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        {formError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Request ID */}
          <Input
            label="Request Identifier"
            value={requestId}
            onChange={(e) => setRequestId(e.target.value)}
            placeholder="e.g. REQ-ENG-501"
            required
            helperText="Unique alphanumeric identifier"
          />

          {/* Department */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Department
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value as Department)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Corridor Selection */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Target Corridor / Section
            </label>
            <select
              value={corridorId}
              onChange={(e) => setCorridorId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              required
            >
              {corridors.length === 0 ? (
                <option value="">No corridors registered</option>
              ) : (
                corridors.map((c) => (
                  <option key={c.corridor_id} value={c.corridor_id}>
                    {c.corridor_id} - {c.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Asset Selection */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Target Physical Asset
            </label>
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              required
            >
              {corridorAssets.length === 0 ? (
                <option value="">No assets found for selected corridor</option>
              ) : (
                corridorAssets.map((a) => (
                  <option key={a.asset_id} value={a.asset_id}>
                    {a.asset_id} ({a.department} • {a.track_type})
                  </option>
                ))
              )}
            </select>
            {corridorAssets.length === 0 && (
              <p className="text-[11px] text-amber-600">
                Selected corridor has no registered assets. Please register assets first.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Required Duration */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Required Duration (Mins)
            </label>
            <input
              type="number"
              min={15}
              max={720}
              step={15}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
              required
            />
            <div className="flex gap-1 pt-1">
              {[60, 90, 120, 180, 240].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDurationMinutes(mins)}
                  className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                    durationMinutes === mins
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {mins}m
                </button>
              ))}
            </div>
          </div>

          {/* Earliest Start Time */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              Earliest Start (HH:MM)
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
              required
            />
          </div>

          {/* Latest End Time */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              Latest End (HH:MM)
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Priority / Urgency */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Urgency Level
            </label>
            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as Priority)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              {URGENCIES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {/* Linked Defect ID */}
          <Input
            label="Linked Safety Defect ID (Optional)"
            value={linkedDefectId}
            onChange={(e) => setLinkedDefectId(e.target.value)}
            placeholder="e.g. DEF-TRD-401"
            helperText="Tag to escalate overdue defect priority"
          />
        </div>

        {/* Checkbox Options */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-800">
            <input
              type="checkbox"
              checked={isTrafficBlock}
              onChange={(e) => setIsTrafficBlock(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
            />
            Traffic Block Required (Suspend train movement on track)
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-800">
            <input
              type="checkbox"
              checked={isPowerBlock}
              onChange={(e) => setIsPowerBlock(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
            />
            Power Block Required (Isolate OHE 25kV traction line)
          </label>
        </div>

        {/* Actions */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            disabled={corridors.length === 0 || corridorAssets.length === 0}
          >
            Submit Request
          </Button>
        </div>
      </form>
    </Modal>
  );
};
