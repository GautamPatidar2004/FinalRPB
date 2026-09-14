import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { operationalService } from '../services';
import type { DashboardCorridor, Asset, MaintenanceRequest } from '../types';
import { Button, ErrorState } from '../components/common';
import {
  CorridorTable,
  CorridorDetailModal,
  AvailabilityWindowModal,
  AssetDetailModal,
  RequestDetailModal,
} from '../components/operations';

export const CorridorsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [corridors, setCorridors] = useState<DashboardCorridor[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCorridor, setSelectedCorridor] = useState<DashboardCorridor | null>(null);
  const [isCorridorDetailOpen, setIsCorridorDetailOpen] = useState<boolean>(false);
  const [editingCorridor, setEditingCorridor] = useState<DashboardCorridor | null>(null);
  const [isEditWindowOpen, setIsEditWindowOpen] = useState<boolean>(false);

  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [isAssetDetailOpen, setIsAssetDetailOpen] = useState<boolean>(false);
  const [selectedRequest, setSelectedRequest] = useState<MaintenanceRequest | null>(null);
  const [isRequestDetailOpen, setIsRequestDetailOpen] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [corridorsData, assetsData, requestsData] = await Promise.all([
        operationalService.getDashboardCorridors(),
        operationalService.getAssets(),
        operationalService.getRequests(),
      ]);
      setCorridors(corridorsData);
      setAssets(assetsData);
      setRequests(requestsData);
      const corridorIdParam = searchParams.get('corridorId');
      if (corridorIdParam) {
        const found = corridorsData.find((c) => c.corridor_id === corridorIdParam);
        if (found) { setSelectedCorridor(found); setIsCorridorDetailOpen(true); }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load corridors and availability.');
    } finally {
      setIsLoading(false);
    }
  }, [searchParams]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleFilterRequestsForCorridor = (corridorId: string) => navigate(`/requests?corridor=${corridorId}`);
  const handleFilterAssetsForCorridor = (corridorId: string) => navigate(`/assets?corridor=${corridorId}`);

  const totalCorridors = corridors.length;
  const electrifiedCount = corridors.filter((c) => c.is_electrified).length;
  const totalLengthKm = corridors.reduce((acc, c) => acc + (c.length_km || 0), 0);
  const totalTrains = corridors.reduce((acc, c) => acc + (c.trains_count || 0), 0);
  const totalBlocks = corridors.reduce((acc, c) => acc + (c.scheduled_blocks_count || 0), 0);

  return (
    <div className="ops-page">
      <div className="ops-header">
        <div className="ops-header__info">
          <div className="ops-header__title-row">
            <h1 className="ops-header__title">Corridors &amp; Operational Availability</h1>
          </div>
        </div>
        <div className="ops-header__actions">
          <Button variant="outline" size="sm" onClick={loadData} isLoading={isLoading} leftIcon={<RefreshCw size={14} />}>Refresh</Button>
        </div>
      </div>

      <div className="kpi-strip">
        <div className="kpi-mini">
          <span className="kpi-mini__label">Total Corridors</span>
          <span className="kpi-mini__value">{totalCorridors}</span>
        </div>
        <div className="kpi-mini">
          <span className="kpi-mini__label kpi-mini__label--blue">Electrified</span>
          <span className="kpi-mini__value kpi-mini__value--blue">{electrifiedCount} / {totalCorridors}</span>
        </div>
        <div className="kpi-mini">
          <span className="kpi-mini__label">Total Route Length</span>
          <span className="kpi-mini__value">{totalLengthKm.toFixed(1)} km</span>
        </div>
        <div className="kpi-mini">
          <span className="kpi-mini__label kpi-mini__label--amber">Active Block Load</span>
          <span className="kpi-mini__value kpi-mini__value--amber">{totalBlocks} Blocks</span>
        </div>
        <div className="kpi-mini">
          <span className="kpi-mini__label kpi-mini__label--emerald">Timetable Trains</span>
          <span className="kpi-mini__value kpi-mini__value--emerald">{totalTrains}</span>
        </div>
      </div>

      {error && <ErrorState title="Failed to Load Corridors" message={error} onRetry={loadData} />}

      <CorridorTable
        corridors={corridors}
        isLoading={isLoading}
        onSelectCorridor={(corridor) => { setSelectedCorridor(corridor); setIsCorridorDetailOpen(true); }}
        onEditAvailability={(corridor) => { setEditingCorridor(corridor); setIsEditWindowOpen(true); }}
        onFilterRequestsForCorridor={handleFilterRequestsForCorridor}
        onFilterAssetsForCorridor={handleFilterAssetsForCorridor}
      />

      <CorridorDetailModal
        corridor={selectedCorridor}
        assets={assets}
        requests={requests}
        isOpen={isCorridorDetailOpen}
        onClose={() => { setIsCorridorDetailOpen(false); setSelectedCorridor(null); }}
        onEditAvailability={(corr) => { setEditingCorridor(corr as DashboardCorridor); setIsEditWindowOpen(true); }}
        onSelectAsset={(assetId) => {
          const found = assets.find((a) => a.asset_id === assetId);
          if (found) { setSelectedAsset({ ...found, is_active: true, scheduled_blocks_count: 0 }); setIsAssetDetailOpen(true); }
        }}
        onSelectRequest={(req) => { setSelectedRequest(req); setIsRequestDetailOpen(true); }}
      />

      <AvailabilityWindowModal
        corridor={editingCorridor}
        isOpen={isEditWindowOpen}
        onClose={() => { setIsEditWindowOpen(false); setEditingCorridor(null); }}
        onSuccess={loadData}
      />

      <AssetDetailModal
        asset={selectedAsset}
        corridor={selectedAsset ? corridors.find((c) => c.corridor_id === selectedAsset.corridor_id) || null : null}
        requests={requests}
        isOpen={isAssetDetailOpen}
        onClose={() => { setIsAssetDetailOpen(false); setSelectedAsset(null); }}
      />

      <RequestDetailModal
        request={selectedRequest}
        isOpen={isRequestDetailOpen}
        onClose={() => { setIsRequestDetailOpen(false); setSelectedRequest(null); }}
      />
    </div>
  );
};
