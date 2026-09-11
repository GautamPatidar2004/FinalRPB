import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Plus } from 'lucide-react';
import { operationalService } from '../services';
import type { MaintenanceRequest, Corridor, Asset, DashboardAsset } from '../types';
import { Button, ErrorState } from '../components/common';
import { RequestTable, RequestDetailModal, RequestCreateModal, AssetDetailModal, CorridorDetailModal } from '../components/operations';

export const MaintenanceRequestsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedRequest, setSelectedRequest] = useState<MaintenanceRequest | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [selectedAsset, setSelectedAsset] = useState<DashboardAsset | null>(null);
  const [isAssetDetailOpen, setIsAssetDetailOpen] = useState<boolean>(false);
  const [selectedCorridor, setSelectedCorridor] = useState<any | null>(null);
  const [isCorridorDetailOpen, setIsCorridorDetailOpen] = useState<boolean>(false);

  const corridorFilterParam = searchParams.get('corridor') || '';

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [reqs, corrs, assts] = await Promise.all([
        operationalService.getRequests(),
        operationalService.getCorridors(),
        operationalService.getAssets(),
      ]);
      setRequests(reqs);
      setCorridors(corrs);
      setAssets(assts);
      const reqIdParam = searchParams.get('requestId');
      if (reqIdParam) {
        const found = reqs.find((r) => r.request_id === reqIdParam);
        if (found) { setSelectedRequest(found); setIsDetailOpen(true); }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load maintenance requests.');
    } finally {
      setIsLoading(false);
    }
  }, [searchParams]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleStatusChange = async (requestId: string, newStatus: string) => {
    try {
      const updated = await operationalService.updateRequestStatus(requestId, newStatus);
      setRequests((prev) => prev.map((r) => (r.request_id === requestId ? updated : r)));
      if (selectedRequest?.request_id === requestId) setSelectedRequest(updated);
    } catch (err: any) {
      throw new Error(err?.message || `Failed to update status to ${newStatus}`);
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    try {
      await operationalService.deleteRequest(requestId);
      setRequests((prev) => prev.filter((r) => r.request_id !== requestId));
      if (selectedRequest?.request_id === requestId) { setSelectedRequest(null); setIsDetailOpen(false); }
    } catch (err: any) {
      throw new Error(err?.message || 'Failed to delete request');
    }
  };

  const handleSelectCorridor = (corridorId: string) => {
    const found = corridors.find((c) => c.corridor_id === corridorId);
    if (found) { setSelectedCorridor(found); setIsCorridorDetailOpen(true); }
  };

  const handleSelectAsset = (assetId: string) => {
    const found = assets.find((a) => a.asset_id === assetId);
    if (found) { setSelectedAsset({ ...found, is_active: true, scheduled_blocks_count: 0 }); setIsAssetDetailOpen(true); }
  };

  const handleCorridorFilterChange = (corridorId: string) => {
    if (corridorId) searchParams.set('corridor', corridorId);
    else searchParams.delete('corridor');
    setSearchParams(searchParams);
  };

  const totalCount = requests.length;
  const pendingCount = requests.filter((r) => r.status === 'PENDING').length;
  const approvedCount = requests.filter((r) => r.status === 'APPROVED' || r.status === 'SCHEDULED').length;
  const criticalCount = requests.filter((r) => r.urgency === 'CRITICAL').length;
  const defectsCount = requests.filter((r) => !!r.linked_defect_id || (r.days_overdue ?? 0) > 0).length;

  return (
    <div className="ops-page">
      <div className="ops-header">
        <div className="ops-header__info">
          <div className="ops-header__title-row">
            <h1 className="ops-header__title">Maintenance Block Requests</h1>
            <span className="ops-header__pill">Operations Hub</span>
          </div>
          <p className="ops-header__desc">Departmental track, traction (TRD), and signalling possession requests requiring block scheduling.</p>
        </div>
        <div className="ops-header__actions">
          <Button variant="outline" size="sm" onClick={loadData} isLoading={isLoading} leftIcon={<RefreshCw size={14} />}>Refresh</Button>
          <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)} leftIcon={<Plus size={14} />}>Submit Request</Button>
        </div>
      </div>

      <div className="kpi-strip">
        <div className="kpi-mini">
          <span className="kpi-mini__label">Total Requests</span>
          <span className="kpi-mini__value">{totalCount}</span>
        </div>
        <div className="kpi-mini">
          <span className="kpi-mini__label kpi-mini__label--amber">Pending Review</span>
          <span className="kpi-mini__value kpi-mini__value--amber">{pendingCount}</span>
        </div>
        <div className="kpi-mini">
          <span className="kpi-mini__label kpi-mini__label--emerald">Approved / Sched</span>
          <span className="kpi-mini__value kpi-mini__value--emerald">{approvedCount}</span>
        </div>
        <div className="kpi-mini">
          <span className="kpi-mini__label kpi-mini__label--red">Critical Priority</span>
          <span className="kpi-mini__value kpi-mini__value--red">{criticalCount}</span>
        </div>
        <div className="kpi-mini">
          <span className="kpi-mini__label kpi-mini__label--amber">Defect / Overdue</span>
          <span className="kpi-mini__value kpi-mini__value--amber">{defectsCount}</span>
        </div>
      </div>

      {error && <ErrorState title="Failed to Load Maintenance Requests" message={error} onRetry={loadData} />}

      <RequestTable
        requests={requests}
        corridors={corridors}
        isLoading={isLoading}
        onSelectRequest={(req) => { setSelectedRequest(req); setIsDetailOpen(true); }}
        onSelectCorridor={handleSelectCorridor}
        onSelectAsset={handleSelectAsset}
        onStatusChange={handleStatusChange}
        onOpenCreate={() => setIsCreateOpen(true)}
        selectedCorridorFilter={corridorFilterParam}
        onCorridorFilterChange={handleCorridorFilterChange}
      />

      <RequestDetailModal
        request={selectedRequest}
        isOpen={isDetailOpen}
        onClose={() => { setIsDetailOpen(false); setSelectedRequest(null); }}
        onStatusChange={handleStatusChange}
        onDelete={handleDeleteRequest}
        onSelectCorridor={handleSelectCorridor}
        onSelectAsset={handleSelectAsset}
        corridor={selectedRequest ? corridors.find((c) => c.corridor_id === selectedRequest.corridor_id) || null : null}
        asset={selectedRequest ? assets.find((a) => a.asset_id === selectedRequest.asset_id) || null : null}
      />

      <RequestCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={loadData}
        corridors={corridors}
        assets={assets}
      />

      <AssetDetailModal
        asset={selectedAsset}
        corridor={selectedAsset ? corridors.find((c) => c.corridor_id === selectedAsset.corridor_id) || null : null}
        requests={requests}
        isOpen={isAssetDetailOpen}
        onClose={() => { setIsAssetDetailOpen(false); setSelectedAsset(null); }}
        onSelectCorridor={handleSelectCorridor}
        onSelectRequest={(req) => { setIsAssetDetailOpen(false); setSelectedRequest(req); setIsDetailOpen(true); }}
      />

      <CorridorDetailModal
        corridor={selectedCorridor}
        assets={assets}
        requests={requests}
        isOpen={isCorridorDetailOpen}
        onClose={() => { setIsCorridorDetailOpen(false); setSelectedCorridor(null); }}
        onSelectAsset={handleSelectAsset}
        onSelectRequest={(req) => { setIsCorridorDetailOpen(false); setSelectedRequest(req); setIsDetailOpen(true); }}
      />
    </div>
  );
};
