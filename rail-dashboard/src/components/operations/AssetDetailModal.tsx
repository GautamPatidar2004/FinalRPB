import React from 'react';
import {
  Layers,
  MapPin,
  ExternalLink,
  Calendar,
  Activity,
  ArrowRight,
} from 'lucide-react';
import type { DashboardAsset, Corridor, MaintenanceRequest } from '../../types';
import { Modal, Badge, Button } from '../common';
import { formatKm, getUrgencyBadgeVariant, getRequestStatusVariant } from '../../utils/formatters';

interface AssetDetailModalProps {
  asset: DashboardAsset | null;
  corridor?: Corridor | null;
  requests: MaintenanceRequest[];
  isOpen: boolean;
  onClose: () => void;
  onSelectCorridor?: (corridorId: string) => void;
  onSelectRequest?: (request: MaintenanceRequest) => void;
}

export const AssetDetailModal: React.FC<AssetDetailModalProps> = ({
  asset,
  corridor,
  requests,
  isOpen,
  onClose,
  onSelectCorridor,
  onSelectRequest,
}) => {
  if (!asset) return null;

  // Find all requests targeting this specific asset
  const assetRequests = requests.filter((r) => r.asset_id === asset.asset_id);
  const totalLength = Math.max(0, asset.end_km - asset.start_km);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      title={
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-blue-600" />
          <span className="font-mono text-[18.5px] font-bold text-slate-900">
            {asset.asset_id}
          </span>
          <Badge variant={asset.is_active ? 'emerald' : 'red'}>
            {asset.is_active ? 'OPERATIONAL' : 'INACTIVE'}
          </Badge>
          <Badge variant="blue">
            TRACK {asset.track_type}
          </Badge>
        </div>
      }
      subtitle={`Managed by ${asset.department} Department`}
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-[15px] text-slate-500">
            {assetRequests.length} active maintenance block request(s) on this asset
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-5 text-[16.5px]">
        {/* Section 1: Location & Physical Geometry */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                Parent Corridor Section
              </span>
              {onSelectCorridor && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelectCorridor(asset.corridor_id);
                  }}
                  className="text-[15px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                >
                  View Corridor
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="mt-2 font-mono font-bold text-slate-900">
              {asset.corridor_id}
            </div>
            {corridor && (
              <p className="text-[15px] text-slate-600 mt-0.5">
                {corridor.name} • Total {corridor.length_km} km
              </p>
            )}
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-lg">
            <span className="text-[15px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-600" />
              Chainage Span & Length
            </span>
            <div className="mt-2 font-mono font-bold text-slate-900 flex items-center gap-2">
              <span>{formatKm(asset.start_km)}</span>
              <span className="text-slate-400">→</span>
              <span>{formatKm(asset.end_km)}</span>
            </div>
            <p className="text-[15px] text-slate-600 mt-0.5">
              Section Span: {totalLength.toFixed(2)} km
            </p>
          </div>
        </div>

        {/* Section 2: Scheduled Load & Operational Status */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-white border border-slate-200 rounded-lg">
            <span className="text-[12.5px] font-semibold text-slate-500 uppercase block">
              Track Configuration
            </span>
            <span className="text-[16.5px] font-bold text-slate-900 mt-1 block">
              {asset.track_type} Track
            </span>
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded-lg">
            <span className="text-[12.5px] font-semibold text-slate-500 uppercase block">
              Department Ownership
            </span>
            <span className="text-[16.5px] font-bold text-slate-900 mt-1 block">
              {asset.department}
            </span>
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded-lg">
            <span className="text-[12.5px] font-semibold text-slate-500 uppercase block">
              Scheduled Blocks Count
            </span>
            <span className="text-[16.5px] font-bold text-slate-900 mt-1 block font-mono">
              {asset.scheduled_blocks_count || 0} Blocks
            </span>
          </div>
        </div>

        {/* Section 3: Linked Maintenance Requests (Cross-Data Relationship) */}
        <div className="space-y-2 pt-2 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <h4 className="text-[15px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              Maintenance Requests For This Asset ({assetRequests.length})
            </h4>
          </div>

          {assetRequests.length === 0 ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-[15px] text-slate-500 text-center">
              No pending or scheduled maintenance block requests currently target this asset.
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {assetRequests.map((req) => (
                <div
                  key={req.request_id}
                  className="p-3 bg-slate-50/80 hover:bg-blue-50/50 border border-slate-200 rounded-lg flex items-center justify-between transition-colors cursor-pointer"
                  onClick={() => {
                    if (onSelectRequest) {
                      onClose();
                      onSelectRequest(req);
                    }
                  }}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[15px] font-bold text-slate-900">
                        {req.request_id}
                      </span>
                      <Badge variant={getRequestStatusVariant(req.status)}>
                        {req.status}
                      </Badge>
                      <Badge variant={getUrgencyBadgeVariant(req.urgency)}>
                        {req.urgency}
                      </Badge>
                      {req.linked_defect_id && (
                        <span className="px-1.5 py-0.5 text-[11.5px] font-mono font-bold bg-amber-100 text-amber-900 rounded">
                          DEFECT: {req.linked_defect_id}
                        </span>
                      )}
                    </div>
                    <p className="text-[15px] text-slate-600">
                      Window: Min {req.earliest_start_minute}–{req.latest_end_minute} • Duration: {req.required_duration_minutes}m
                    </p>
                  </div>

                  <div className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-[15px] font-medium">
                    <span>Inspect</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
