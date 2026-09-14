import React, { useState } from 'react';
import {
  Clock,
  AlertTriangle,
  Zap,
  Train,
  CheckCircle2,
  XCircle,
  Trash2,
  ExternalLink,
  Layers,
  MapPin,
} from 'lucide-react';
import type { MaintenanceRequest, Corridor, Asset } from '../../types';
import { Modal, Badge, Button } from '../common';
import {
  formatMinuteToTime,
  formatDuration,
  formatTimestamp,
  getUrgencyBadgeVariant,
  getRequestStatusVariant,
} from '../../utils/formatters';

interface RequestDetailModalProps {
  request: MaintenanceRequest | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (requestId: string, newStatus: string) => Promise<void>;
  onDelete?: (requestId: string) => Promise<void>;
  onSelectCorridor?: (corridorId: string) => void;
  onSelectAsset?: (assetId: string) => void;
  corridor?: Corridor | null;
  asset?: Asset | null;
}

export const RequestDetailModal: React.FC<RequestDetailModalProps> = ({
  request,
  isOpen,
  onClose,
  onStatusChange,
  onDelete,
  onSelectCorridor,
  onSelectAsset,
  corridor,
  asset,
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!request) return null;

  const handleStatusAction = async (status: string) => {
    if (!onStatusChange) return;
    setIsUpdating(true);
    setActionError(null);
    try {
      await onStatusChange(request.request_id, status);
    } catch (err: any) {
      setActionError(err?.message || `Failed to set status to ${status}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteAction = async () => {
    if (!onDelete) return;
    if (!window.confirm(`Are you sure you want to delete maintenance request ${request.request_id}?`)) {
      return;
    }
    setIsUpdating(true);
    setActionError(null);
    try {
      await onDelete(request.request_id);
      onClose();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to delete request');
    } finally {
      setIsUpdating(false);
    }
  };

  // 24-hour timeline bar calculations (0-1440 minutes)
  const windowStartPct = Math.max(0, Math.min(100, (request.earliest_start_minute / 1440) * 100));
  const windowSpanMinutes = Math.max(1, request.latest_end_minute - request.earliest_start_minute);
  const windowWidthPct = Math.max(1, Math.min(100 - windowStartPct, (windowSpanMinutes / 1440) * 100));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      title={
        <div className="flex items-center gap-3">
          <span className="font-mono text-[18.5px] font-bold text-slate-900">
            {request.request_id}
          </span>
          <Badge
            variant={getRequestStatusVariant(request.status)}
            dot={request.status === 'PENDING'}
          >
            {request.status}
          </Badge>
          <Badge variant={getUrgencyBadgeVariant(request.urgency)}>
            {request.urgency} PRIORITY
          </Badge>
        </div>
      }
      subtitle={`Submitted by ${request.department} Department`}
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            {(request.status === 'PENDING' || request.status === 'REJECTED') && onDelete && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:bg-red-50 border-red-200"
                onClick={handleDeleteAction}
                isLoading={isUpdating}
                leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              >
                Delete
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onStatusChange && request.status !== 'APPROVED' && (
              <Button
                variant="primary"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => handleStatusAction('APPROVED')}
                isLoading={isUpdating}
                leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
              >
                Approve Request
              </Button>
            )}
            {onStatusChange && request.status !== 'REJECTED' && (
              <Button
                variant="outline"
                size="sm"
                className="text-slate-700 hover:bg-slate-100"
                onClick={() => handleStatusAction('REJECTED')}
                isLoading={isUpdating}
                leftIcon={<XCircle className="w-3.5 h-3.5" />}
              >
                Reject
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 text-[16.5px]">
        {actionError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-[15px] text-red-700 font-medium">
            {actionError}
          </div>
        )}

        {/* Section 1: Target Location & Asset Cross-link */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                Target Corridor / Section
              </span>
              {onSelectCorridor && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelectCorridor(request.corridor_id);
                  }}
                  className="text-[15px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                >
                  View Details
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="mt-2 font-mono font-bold text-slate-900">
              {request.corridor_id}
            </div>
            {corridor && (
              <p className="text-[15px] text-slate-600 mt-0.5">
                {corridor.name} • {corridor.length_km} km • {corridor.is_electrified ? '25kV AC Electrified' : 'Non-electrified'}
              </p>
            )}
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                Target Physical Asset
              </span>
              {onSelectAsset && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelectAsset(request.asset_id);
                  }}
                  className="text-[15px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                >
                  View Asset
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="mt-2 font-mono font-bold text-slate-900">
              {request.asset_id}
            </div>
            {asset && (
              <p className="text-[15px] text-slate-600 mt-0.5">
                Track {asset.track_type} • KM {asset.start_km.toFixed(2)} - KM {asset.end_km.toFixed(2)}
              </p>
            )}
          </div>
        </div>

        {/* Section 2: Feasible Time Window & Duration Visualization */}
        <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="text-[15px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              Operational Time Window & Requested Duration
            </span>
            <span className="text-[15px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              Requested: {formatDuration(request.required_duration_minutes)} ({request.required_duration_minutes} mins)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[15px]">
            <div>
              <span className="text-slate-500 block">Earliest Start:</span>
              <span className="font-mono font-semibold text-slate-900 text-[16.5px]">
                {formatMinuteToTime(request.earliest_start_minute)}
              </span>
              <span className="text-slate-400 text-[12.5px] block">(Min {request.earliest_start_minute})</span>
            </div>
            <div>
              <span className="text-slate-500 block">Latest End:</span>
              <span className="font-mono font-semibold text-slate-900 text-[16.5px]">
                {formatMinuteToTime(request.latest_end_minute)}
              </span>
              <span className="text-slate-400 text-[12.5px] block">(Min {request.latest_end_minute})</span>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <span className="text-slate-500 block">Window Flexibility:</span>
              <span className="font-mono font-semibold text-slate-900 text-[16.5px]">
                {formatDuration(windowSpanMinutes)}
              </span>
              <span className="text-slate-400 text-[12.5px] block">
                {windowSpanMinutes >= request.required_duration_minutes ? 'Feasible span' : 'Tight window'}
              </span>
            </div>
          </div>

          {/* 24-Hour Visual Timeline Bar */}
          <div className="pt-2">
            <div className="flex justify-between text-[11.5px] text-slate-400 font-mono mb-1">
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>24:00</span>
            </div>
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden relative border border-slate-200">
              <div
                className="absolute top-0 bottom-0 bg-blue-600 rounded-full opacity-85 transition-all"
                style={{
                  left: `${windowStartPct}%`,
                  width: `${windowWidthPct}%`,
                }}
                title={`Allowed window: ${formatMinuteToTime(request.earliest_start_minute)} - ${formatMinuteToTime(request.latest_end_minute)}`}
              />
            </div>
            <div className="flex justify-between items-center text-[12.5px] text-slate-500 mt-1.5">
              <span>Day timeline (0–1440m)</span>
              <span className="font-medium text-blue-700">
                Span: {formatMinuteToTime(request.earliest_start_minute)} → {formatMinuteToTime(request.latest_end_minute)}
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Isolation & Block Requirements */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3.5 border border-slate-200 rounded-lg flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                request.is_traffic_block_required
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              <Train className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[15px] font-semibold text-slate-500 uppercase tracking-wider block">
                Traffic Block
              </span>
              <span className="text-[16.5px] font-bold text-slate-900">
                {request.is_traffic_block_required ? 'Required (Line Closed)' : 'Not Required'}
              </span>
            </div>
          </div>

          <div className="p-3.5 border border-slate-200 rounded-lg flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                request.is_power_block_required
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[15px] font-semibold text-slate-500 uppercase tracking-wider block">
                Traction Power Block (OHE)
              </span>
              <span className="text-[16.5px] font-bold text-slate-900">
                {request.is_power_block_required ? 'Required (Power Cut)' : 'Not Required'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 4: Defect / Overdue Status Context */}
        {request.linked_defect_id ? (
          <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-amber-900 uppercase">
                  Linked Track / OHE Defect
                </span>
                <span className="px-1.5 py-0.5 font-mono text-[15px] font-bold bg-amber-200/80 text-amber-900 rounded">
                  {request.linked_defect_id}
                </span>
                {(request.days_overdue ?? 0) > 0 && (
                  <span className="px-1.5 py-0.5 text-[11.5px] font-bold bg-red-600 text-white rounded">
                    {request.days_overdue} DAYS OVERDUE
                  </span>
                )}
              </div>
              <p className="text-[15px] text-amber-800 mt-1">
                This maintenance block is tied to active defect ticket {request.linked_defect_id}. Priority dispatch required by safety standards.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-lg text-[15px] text-slate-500">
            Routine departmental scheduled maintenance. No active safety defect report linked.
          </div>
        )}

        {/* Section 5: Audit & Timestamps */}
        <div className="pt-2 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[12.5px] text-slate-500">
          <div>
            <span className="block text-slate-400">Created:</span>
            <span className="font-mono text-slate-700">{formatTimestamp(request.created_at)}</span>
          </div>
          <div>
            <span className="block text-slate-400">Last Modified:</span>
            <span className="font-mono text-slate-700">{formatTimestamp(request.updated_at)}</span>
          </div>
          <div>
            <span className="block text-slate-400">Created By:</span>
            <span className="font-mono text-slate-700">{request.created_by || 'System Ingest'}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
};
