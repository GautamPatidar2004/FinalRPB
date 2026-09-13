import React from 'react';
import {
  MapPin,
  Clock,
  Sliders,
  Layers,
  Calendar,
  ArrowRight,
} from 'lucide-react';
import type { Corridor, DashboardCorridor, Asset, DashboardAsset, MaintenanceRequest } from '../../types';
import { Modal, Badge, Button } from '../common';
import { formatMinuteToTime, formatDuration, formatKm, getRequestStatusVariant } from '../../utils/formatters';

interface CorridorDetailModalProps {
  corridor: (Corridor | DashboardCorridor) | null;
  assets: (Asset | DashboardAsset)[];
  requests: MaintenanceRequest[];
  isOpen: boolean;
  onClose: () => void;
  onEditAvailability?: (corridor: Corridor | DashboardCorridor) => void;
  onSelectAsset?: (assetId: string) => void;
  onSelectRequest?: (request: MaintenanceRequest) => void;
}

export const CorridorDetailModal: React.FC<CorridorDetailModalProps> = ({
  corridor,
  assets,
  requests,
  isOpen,
  onClose,
  onEditAvailability,
  onSelectAsset,
  onSelectRequest,
}) => {
  if (!corridor) return null;

  const corridorAssets = assets.filter((a) => a.corridor_id === corridor.corridor_id);
  const corridorRequests = requests.filter((r) => r.corridor_id === corridor.corridor_id);

  // Safe property extraction across Corridor and DashboardCorridor
  const scheduledBlocks = 'scheduled_blocks_count' in corridor ? (corridor.scheduled_blocks_count || 0) : 0;
  const isActive = 'is_active' in corridor ? corridor.is_active : true;
  const trainsCount = 'trains_count' in corridor ? (corridor.trains_count || 0) : 0;

  // 24-hour timeline bar
  const windowStartPct = Math.max(0, Math.min(100, (corridor.available_start_minute / 1440) * 100));
  const windowSpanMinutes = Math.max(1, corridor.available_end_minute - corridor.available_start_minute);
  const windowWidthPct = Math.max(1, Math.min(100 - windowStartPct, (windowSpanMinutes / 1440) * 100));

  // Capacity calculation
  const capacityPct = Math.min(
    100,
    Math.round((scheduledBlocks / Math.max(1, corridor.max_parallel_blocks)) * 100)
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      title={
        <div className="flex items-center gap-3">
          <MapPin className="w-5 h-5 text-blue-600" />
          <span className="font-mono text-[18.5px] font-bold text-slate-900">
            {corridor.corridor_id}
          </span>
          <Badge variant={isActive ? 'emerald' : 'red'}>
            {isActive ? 'OPERATIONAL' : 'INACTIVE'}
          </Badge>
          <Badge variant={corridor.is_electrified ? 'blue' : 'slate'}>
            {corridor.is_electrified ? '25kV ELECTRIFIED' : 'NON-ELECTRIFIED'}
          </Badge>
        </div>
      }
      subtitle={corridor.name}
      footer={
        <div className="flex items-center justify-between w-full">
          {onEditAvailability && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                onEditAvailability(corridor);
              }}
              leftIcon={<Sliders className="w-3.5 h-3.5" />}
            >
              Configure Availability Window
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} className="ml-auto">
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-5 text-[16.5px]">
        {/* Section 1: Overview KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
            <span className="text-[12.5px] font-semibold text-slate-500 uppercase block">
              Section Length
            </span>
            <span className="text-[18.5px] font-bold text-slate-900 mt-1 block font-mono">
              {corridor.length_km} km
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
            <span className="text-[12.5px] font-semibold text-slate-500 uppercase block">
              Parallel Block Capacity
            </span>
            <span className="text-[18.5px] font-bold text-slate-900 mt-1 block font-mono">
              {scheduledBlocks} / {corridor.max_parallel_blocks} Max
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
            <span className="text-[12.5px] font-semibold text-slate-500 uppercase block">
              Timetable Trains
            </span>
            <span className="text-[18.5px] font-bold text-slate-900 mt-1 block font-mono">
              {trainsCount} Trains
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg">
            <span className="text-[12.5px] font-semibold text-slate-500 uppercase block">
              Registered Assets
            </span>
            <span className="text-[18.5px] font-bold text-slate-900 mt-1 block font-mono">
              {corridorAssets.length} Assets
            </span>
          </div>
        </div>

        {/* Section 2: Operational Window & Availability Timeline */}
        <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="text-[15px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              Operational Maintenance Window (Daily)
            </span>
            <span className="text-[15px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
              Open: {formatMinuteToTime(corridor.available_start_minute)} → {formatMinuteToTime(corridor.available_end_minute)} ({formatDuration(windowSpanMinutes)})
            </span>
          </div>

          {/* 24-Hour Timeline Bar */}
          <div className="pt-1">
            <div className="flex justify-between text-[11.5px] text-slate-400 font-mono mb-1">
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>24:00</span>
            </div>
            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden relative border border-slate-200">
              <div
                className="absolute top-0 bottom-0 bg-emerald-500 rounded-full opacity-90 transition-all"
                style={{
                  left: `${windowStartPct}%`,
                  width: `${windowWidthPct}%`,
                }}
                title={`Maintenance Permitted: ${formatMinuteToTime(corridor.available_start_minute)} - ${formatMinuteToTime(corridor.available_end_minute)}`}
              />
            </div>
            <div className="flex items-center justify-between text-[12.5px] text-slate-500 mt-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>Maintenance Allowed</span>
                <span className="w-2.5 h-2.5 rounded-full bg-slate-200 ml-2" />
                <span>Operating Traffic Only</span>
              </div>
              <span className="font-mono text-slate-700">
                Min {corridor.available_start_minute}–{corridor.available_end_minute}
              </span>
            </div>
          </div>

          {/* Parallel Capacity Gauge */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex justify-between text-[15px] mb-1">
              <span className="text-slate-600 font-medium">Work Gang Parallel Capacity:</span>
              <span className="font-mono font-bold text-slate-900">
                {scheduledBlocks} / {corridor.max_parallel_blocks} ({capacityPct}%)
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div
                className={`h-full rounded-full transition-all ${
                  capacityPct >= 100
                    ? 'bg-red-500'
                    : capacityPct >= 75
                    ? 'bg-amber-500'
                    : 'bg-blue-600'
                }`}
                style={{ width: `${Math.min(100, capacityPct)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Registered Assets in Corridor */}
        <div className="space-y-2 pt-1 border-t border-slate-200">
          <h4 className="text-[15px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            Infrastructure Assets in this Section ({corridorAssets.length})
          </h4>

          {corridorAssets.length === 0 ? (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[15px] text-slate-500 text-center">
              No physical assets currently mapped to this corridor section.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
              {corridorAssets.map((asset) => (
                <div
                  key={asset.asset_id}
                  className="p-2.5 bg-slate-50 hover:bg-blue-50/50 border border-slate-200 rounded-lg flex items-center justify-between text-[15px] transition-colors cursor-pointer"
                  onClick={() => {
                    if (onSelectAsset) {
                      onClose();
                      onSelectAsset(asset.asset_id);
                    }
                  }}
                >
                  <div>
                    <span className="font-mono font-bold text-slate-900 block">
                      {asset.asset_id}
                    </span>
                    <span className="text-slate-500 text-[12.5px]">
                      {asset.department} • {asset.track_type} • {formatKm(asset.start_km)}–{formatKm(asset.end_km)}
                    </span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 4: Maintenance Requests in Corridor */}
        <div className="space-y-2 pt-1 border-t border-slate-200">
          <h4 className="text-[15px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            Active Requests in this Corridor ({corridorRequests.length})
          </h4>

          {corridorRequests.length === 0 ? (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[15px] text-slate-500 text-center">
              No active maintenance block requests targeting this section.
            </div>
          ) : (
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {corridorRequests.map((req) => (
                <div
                  key={req.request_id}
                  className="p-2.5 bg-slate-50 hover:bg-blue-50/50 border border-slate-200 rounded-lg flex items-center justify-between text-[15px] transition-colors cursor-pointer"
                  onClick={() => {
                    if (onSelectRequest) {
                      onClose();
                      onSelectRequest(req);
                    }
                  }}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">
                        {req.request_id}
                      </span>
                      <Badge variant={getRequestStatusVariant(req.status)}>
                        {req.status}
                      </Badge>
                      <span className="text-[12.5px] text-slate-500 font-medium">
                        {req.department}
                      </span>
                    </div>
                    <p className="text-[12.5px] text-slate-500">
                      Asset: {req.asset_id} • Duration: {req.required_duration_minutes}m • Min {req.earliest_start_minute}–{req.latest_end_minute}
                    </p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
