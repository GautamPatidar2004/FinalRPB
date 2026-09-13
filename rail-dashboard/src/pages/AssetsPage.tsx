import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { operationalService } from '../services';
import type { DashboardAsset, Corridor, MaintenanceRequest } from '../types';
import { Button, ErrorState } from '../components/common';
import { AssetTable, AssetDetailModal, CorridorDetailModal, RequestDetailModal } from '../components/operations';

export const AssetsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [assets, setAssets] = useState<DashboardAsset[]>([]);
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAsset, setSelectedAsset] = useState<DashboardAsset | null>(null);
  const [isAssetDetailOpen, setIsAssetDetailOpen] = useState<boolean>(false);
  const [selectedCorridor, setSelectedCorridor] = useState<any | null>(null);
  const [isCorridorDetailOpen, setIsCorridorDetailOpen] = useState<boolean>(false);
  const [selectedRequest, setSelectedRequest] = useState<MaintenanceRequest | null>(null);
  const [isRequestDetailOpen, setIsRequestDetailOpen] = useState<boolean>(false);

  const corridorFilterParam = searchParams.get('corridor') || '';

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [assetsData, corridorsData, requestsData] = await Promise.all([
        operationalService.getDashboardAssets(),
        operationalService.getCorridors(),
        operationalService.getRequests(),
      ]);
      setAssets(assetsData);
      setCorridors(corridorsData);
      setRequests(requestsData);
      const assetIdParam = searchParams.get('assetId');
      if (assetIdParam) {
        const found = assetsData.find((a) => a.asset_id === assetIdParam);
        if (found) { setSelectedAsset(found); setIsAssetDetailOpen(true); }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load infrastructure assets.');
    } finally {
      setIsLoading(false);
    }
  }, [searchParams]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSelectCorridor = (corridorId: string) => {
    const found = corridors.find((c) => c.corridor_id === corridorId);
    if (found) { setSelectedCorridor(found); setIsCorridorDetailOpen(true); }
  };

  const handleFilterRequestsForAsset = (assetId: string) => navigate(`/requests?searchQuery=${assetId}`);

  const handleCorridorFilterChange = (corridorId: string) => {
    if (corridorId) searchParams.set('corridor', corridorId);
    else searchParams.delete('corridor');
    setSearchParams(searchParams);
  };

  const totalAssets = assets.length;
  const activeAssets = assets.filter((a) => a.is_active).length;
  const scheduledBlocksCount = assets.reduce((acc, a) => acc + (a.scheduled_blocks_count || 0), 0);
  const upTrackCount = assets.filter((a) => a.track_type === 'UP').length;
  const downTrackCount = assets.filter((a) => a.track_type === 'DOWN').length;

  return (
    <div className="ops-page">
      <div className="ops-header">
        <div className="ops-header__info">
          <div className="ops-header__title-row">
            <h1 className="ops-header__title">Railway Physical Assets &amp; Chainages</h1>
          </div>
        </div>
        <div className="ops-header__actions">
          <Button variant="outline" size="sm" onClick={loadData} isLoading={isLoading} leftIcon={<RefreshCw size={14} />}>Refresh</Button>
        </div>
      </div>

      <div className="kpi-strip">
        <div className="kpi-mini">
          <span className="kpi-mini__label">Total Assets</span>
          <span className="kpi-mini__value">{totalAssets}</span>
        </div>
        <div className="kpi-mini">
          <span className="kpi-mini__label kpi-mini__label--emerald">Operational</span>
          <span className="kpi-mini__value kpi-mini__value--emerald">{activeAssets}</span>
        </div>
        <div className="kpi-mini">
          <span className="kpi-mini__label kpi-mini__label--amber">Active Block Load</span>
          <span className="kpi-mini__value kpi-mini__value--amber">{scheduledBlocksCount}</span>
        </div>
        <div className="kpi-mini">
          <span className="kpi-mini__label kpi-mini__label--blue">UP Track</span>
          <span className="kpi-mini__value kpi-mini__value--blue">{upTrackCount}</span>
        </div>
        <div className="kpi-mini">
          <span className="kpi-mini__label kpi-mini__label--blue">DOWN Track</span>
          <span className="kpi-mini__value kpi-mini__value--blue">{downTrackCount}</span>
        </div>
      </div>

      {error && <ErrorState title="Failed to Load Assets" message={error} onRetry={loadData} />}

      <AssetTable
        assets={assets}
        corridors={corridors}
        isLoading={isLoading}
        onSelectAsset={(asset) => { setSelectedAsset(asset); setIsAssetDetailOpen(true); }}
        onSelectCorridor={handleSelectCorridor}
        onFilterRequestsForAsset={handleFilterRequestsForAsset}
        selectedCorridorFilter={corridorFilterParam}
        onCorridorFilterChange={handleCorridorFilterChange}
      />

      <AssetDetailModal
        asset={selectedAsset}
        corridor={selectedAsset ? corridors.find((c) => c.corridor_id === selectedAsset.corridor_id) || null : null}
        requests={requests}
        isOpen={isAssetDetailOpen}
        onClose={() => { setIsAssetDetailOpen(false); setSelectedAsset(null); }}
        onSelectCorridor={handleSelectCorridor}
        onSelectRequest={(req) => { setSelectedRequest(req); setIsRequestDetailOpen(true); }}
      />

      <CorridorDetailModal
        corridor={selectedCorridor}
        assets={assets}
        requests={requests}
        isOpen={isCorridorDetailOpen}
        onClose={() => { setIsCorridorDetailOpen(false); setSelectedCorridor(null); }}
        onSelectAsset={(assetId) => {
          const found = assets.find((a) => a.asset_id === assetId);
          if (found) { setSelectedAsset(found); setIsAssetDetailOpen(true); }
        }}
        onSelectRequest={(req) => { setSelectedRequest(req); setIsRequestDetailOpen(true); }}
      />

      <RequestDetailModal
        request={selectedRequest}
        isOpen={isRequestDetailOpen}
        onClose={() => { setIsRequestDetailOpen(false); setSelectedRequest(null); }}
        onSelectCorridor={handleSelectCorridor}
        corridor={selectedRequest ? corridors.find((c) => c.corridor_id === selectedRequest.corridor_id) || null : null}
      />
    </div>
  );
};
