import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  Layers,
  Eye,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { DashboardAsset, Corridor } from '../../types';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  Badge,
  Button,
  LoadingState,
  EmptyState,
} from '../common';
import { formatKm } from '../../utils/formatters';

interface AssetTableProps {
  assets: DashboardAsset[];
  corridors?: Corridor[];
  isLoading?: boolean;
  onSelectAsset: (asset: DashboardAsset) => void;
  onSelectCorridor?: (corridorId: string) => void;
  onFilterRequestsForAsset?: (assetId: string) => void;
  selectedCorridorFilter?: string;
  onCorridorFilterChange?: (corridorId: string) => void;
}

type SortField = 'id' | 'corridor' | 'department' | 'startKm' | 'blocks';
type SortOrder = 'asc' | 'desc';

export const AssetTable: React.FC<AssetTableProps> = ({
  assets,
  corridors = [],
  isLoading = false,
  onSelectAsset,
  onSelectCorridor,
  onFilterRequestsForAsset,
  selectedCorridorFilter = '',
  onCorridorFilterChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedTrackType, setSelectedTrackType] = useState<string>('ALL');

  const [sortField, setSortField] = useState<SortField>('id');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 15;

  // Filtered dataset
  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = a.asset_id.toLowerCase().includes(q);
        const matchesCorridor = a.corridor_id.toLowerCase().includes(q);
        const matchesDept = a.department?.toLowerCase().includes(q);
        const matchesTrack = a.track_type?.toLowerCase().includes(q);
        if (!matchesId && !matchesCorridor && !matchesDept && !matchesTrack) {
          return false;
        }
      }

      // Department filter
      if (selectedDept !== 'ALL' && a.department !== selectedDept) {
        return false;
      }

      // Track Type filter
      if (selectedTrackType !== 'ALL' && a.track_type !== selectedTrackType) {
        return false;
      }

      // Corridor filter
      if (selectedCorridorFilter && a.corridor_id !== selectedCorridorFilter) {
        return false;
      }

      return true;
    });
  }, [assets, searchQuery, selectedDept, selectedTrackType, selectedCorridorFilter]);

  // Sorted dataset
  const sortedAssets = useMemo(() => {
    return [...filteredAssets].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'id':
          comparison = a.asset_id.localeCompare(b.asset_id);
          break;
        case 'corridor':
          comparison = a.corridor_id.localeCompare(b.corridor_id);
          break;
        case 'department':
          comparison = a.department.localeCompare(b.department);
          break;
        case 'startKm':
          comparison = a.start_km - b.start_km;
          break;
        case 'blocks':
          comparison = (a.scheduled_blocks_count || 0) - (b.scheduled_blocks_count || 0);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredAssets, sortField, sortOrder]);

  // Paginated records
  const totalPages = Math.max(1, Math.ceil(sortedAssets.length / pageSize));
  const paginatedAssets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedAssets.slice(start, start + pageSize);
  }, [sortedAssets, currentPage, pageSize]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedDept('ALL');
    setSelectedTrackType('ALL');
    if (onCorridorFilterChange) onCorridorFilterChange('');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by Asset ID, corridor, or track type..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition-colors"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 font-medium">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Filter:</span>
          </div>

          {/* Department */}
          <select
            value={selectedDept}
            onChange={(e) => {
              setSelectedDept(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-medium text-slate-700 hover:bg-slate-100 focus:outline-none"
          >
            <option value="ALL">All Departments</option>
            <option value="Engineering">Engineering</option>
            <option value="Traction Distribution">Traction Distribution</option>
            <option value="Signalling & Telecom">Signalling & Telecom</option>
          </select>

          {/* Track Type */}
          <select
            value={selectedTrackType}
            onChange={(e) => {
              setSelectedTrackType(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-medium text-slate-700 hover:bg-slate-100 focus:outline-none"
          >
            <option value="ALL">All Track Types</option>
            <option value="UP">UP Track</option>
            <option value="DOWN">DOWN Track</option>
            <option value="BOTH">BOTH Tracks</option>
            <option value="SINGLE">SINGLE Track</option>
          </select>

          {/* Corridor */}
          {corridors.length > 0 && onCorridorFilterChange && (
            <select
              value={selectedCorridorFilter}
              onChange={(e) => {
                onCorridorFilterChange(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-medium text-slate-700 hover:bg-slate-100 focus:outline-none max-w-[200px] truncate"
            >
              <option value="">All Corridors ({corridors.length})</option>
              {corridors.map((c) => (
                <option key={c.corridor_id} value={c.corridor_id}>
                  {c.corridor_id} ({c.name})
                </option>
              ))}
            </select>
          )}

          {(searchQuery ||
            selectedDept !== 'ALL' ||
            selectedTrackType !== 'ALL' ||
            selectedCorridorFilter) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Table Content */}
      {isLoading ? (
        <LoadingState message="Loading railway infrastructure assets..." />
      ) : sortedAssets.length === 0 ? (
        <EmptyState
          title="No Infrastructure Assets Found"
          message={
            assets.length === 0
              ? 'No track, OHE, or signalling assets registered in the database.'
              : 'No assets match the active search and filter criteria.'
          }
        />
      ) : (
        <div className="space-y-3">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('id')}
                >
                  <div className="flex items-center gap-1">
                    <span>Asset ID</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHeaderCell>
                <TableHeaderCell
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('corridor')}
                >
                  <div className="flex items-center gap-1">
                    <span>Corridor Section</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHeaderCell>
                <TableHeaderCell
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('department')}
                >
                  <div className="flex items-center gap-1">
                    <span>Department</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHeaderCell>
                <TableHeaderCell>Track Type</TableHeaderCell>
                <TableHeaderCell
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('startKm')}
                >
                  <div className="flex items-center gap-1">
                    <span>Chainage Span</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHeaderCell>
                <TableHeaderCell
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('blocks')}
                >
                  <div className="flex items-center gap-1">
                    <span>Scheduled Blocks</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedAssets.map((asset) => (
                <TableRow
                  key={asset.asset_id}
                  className="cursor-pointer hover:bg-blue-50/40"
                  onClick={() => onSelectAsset(asset)}
                >
                  {/* Asset ID */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-slate-500">
                        <Layers className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {asset.asset_id}
                      </span>
                    </div>
                  </TableCell>

                  {/* Corridor */}
                  <TableCell>
                    {onSelectCorridor ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCorridor(asset.corridor_id);
                        }}
                        className="font-mono text-xs text-blue-600 hover:text-blue-800 font-semibold hover:underline"
                        title="Filter corridor"
                      >
                        {asset.corridor_id}
                      </button>
                    ) : (
                      <span className="font-mono text-xs font-semibold text-slate-800">
                        {asset.corridor_id}
                      </span>
                    )}
                  </TableCell>

                  {/* Department */}
                  <TableCell>
                    <span className="text-xs font-medium text-slate-800">
                      {asset.department}
                    </span>
                  </TableCell>

                  {/* Track Type */}
                  <TableCell>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                      {asset.track_type}
                    </span>
                  </TableCell>

                  {/* Chainage Span */}
                  <TableCell>
                    <div className="font-mono text-xs text-slate-800">
                      <span>{formatKm(asset.start_km)}</span>
                      <span className="text-slate-400 mx-1">→</span>
                      <span>{formatKm(asset.end_km)}</span>
                      <span className="text-[10px] text-slate-400 ml-1.5">
                        ({(asset.end_km - asset.start_km).toFixed(2)} km)
                      </span>
                    </div>
                  </TableCell>

                  {/* Scheduled Blocks */}
                  <TableCell>
                    <span
                      className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                        (asset.scheduled_blocks_count || 0) > 0
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {asset.scheduled_blocks_count || 0} Blocks
                    </span>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <Badge variant={asset.is_active ? 'emerald' : 'red'}>
                      {asset.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </Badge>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {onFilterRequestsForAsset && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onFilterRequestsForAsset(asset.asset_id);
                          }}
                          className="p-1 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                          title="View Maintenance Requests on this Asset"
                        >
                          <Calendar className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAsset(asset);
                        }}
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        title="View Asset Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between text-xs text-slate-600 px-2 pt-2">
            <div>
              Showing{' '}
              <span className="font-semibold text-slate-900">
                {(currentPage - 1) * pageSize + 1}
              </span>{' '}
              to{' '}
              <span className="font-semibold text-slate-900">
                {Math.min(currentPage * pageSize, sortedAssets.length)}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-slate-900">
                {sortedAssets.length}
              </span>{' '}
              assets
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
              >
                Previous
              </Button>
              <span className="font-mono font-medium text-slate-700 px-1">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
