import React, { useState, useMemo } from 'react';
import {
  Search,
  MapPin,
  Calendar,
  Layers,
  Zap,
  Sliders,
  Eye,
  Train,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from 'lucide-react';
import type { DashboardCorridor } from '../../types';
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
import { formatMinuteToTime, formatDuration } from '../../utils/formatters';

interface CorridorTableProps {
  corridors: DashboardCorridor[];
  isLoading?: boolean;
  onSelectCorridor: (corridor: DashboardCorridor) => void;
  onEditAvailability?: (corridor: DashboardCorridor) => void;
  onFilterRequestsForCorridor?: (corridorId: string) => void;
  onFilterAssetsForCorridor?: (corridorId: string) => void;
}

type SortField = 'id' | 'length' | 'blocks' | 'trains';
type SortOrder = 'asc' | 'desc';

export const CorridorTable: React.FC<CorridorTableProps> = ({
  corridors,
  isLoading = false,
  onSelectCorridor,
  onEditAvailability,
  onFilterRequestsForCorridor,
  onFilterAssetsForCorridor,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [electrifiedOnly, setElectrifiedOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>('id');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const filteredCorridors = useMemo(() => {
    return corridors.filter((c) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = c.corridor_id.toLowerCase().includes(q);
        const matchesName = c.name.toLowerCase().includes(q);
        if (!matchesId && !matchesName) return false;
      }
      if (electrifiedOnly && !c.is_electrified) return false;
      return true;
    });
  }, [corridors, searchQuery, electrifiedOnly]);

  const sortedCorridors = useMemo(() => {
    return [...filteredCorridors].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'id':
          comparison = a.corridor_id.localeCompare(b.corridor_id);
          break;
        case 'length':
          comparison = a.length_km - b.length_km;
          break;
        case 'blocks':
          comparison = (a.scheduled_blocks_count || 0) - (b.scheduled_blocks_count || 0);
          break;
        case 'trains':
          comparison = (a.trains_count || 0) - (b.trains_count || 0);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredCorridors, sortField, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sortedCorridors.length / pageSize));
  const paginatedCorridors = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedCorridors.slice(start, start + pageSize);
  }, [sortedCorridors, currentPage, pageSize]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
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
              placeholder="Search by Corridor ID or section name..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setElectrifiedOnly(!electrifiedOnly);
                setCurrentPage(1);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                electrifiedOnly
                  ? 'bg-blue-100 text-blue-900 border-blue-300 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${electrifiedOnly ? 'text-blue-600' : 'text-slate-400'}`} />
              <span>Electrified Only</span>
            </button>
          </div>
        </div>
      </div>

      {/* Table Content */}
      {isLoading ? (
        <LoadingState message="Loading railway corridors and operational availability..." />
      ) : sortedCorridors.length === 0 ? (
        <EmptyState
          title="No Corridors Found"
          message={
            corridors.length === 0
              ? 'No corridors are registered in the operational database.'
              : 'No corridors match your search criteria.'
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
                    <span>Corridor Section</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHeaderCell>
                <TableHeaderCell
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('length')}
                >
                  <div className="flex items-center gap-1">
                    <span>Length</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHeaderCell>
                <TableHeaderCell>Traction</TableHeaderCell>
                <TableHeaderCell>24h Availability Window</TableHeaderCell>
                <TableHeaderCell
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('blocks')}
                >
                  <div className="flex items-center gap-1">
                    <span>Parallel Blocks</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHeaderCell>
                <TableHeaderCell
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('trains')}
                >
                  <div className="flex items-center gap-1">
                    <span>Trains</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedCorridors.map((c) => {
                const windowStartPct = Math.max(0, Math.min(100, (c.available_start_minute / 1440) * 100));
                const windowSpanMinutes = Math.max(1, c.available_end_minute - c.available_start_minute);
                const windowWidthPct = Math.max(1, Math.min(100 - windowStartPct, (windowSpanMinutes / 1440) * 100));
                const capacityPct = Math.min(
                  100,
                  Math.round(((c.scheduled_blocks_count || 0) / Math.max(1, c.max_parallel_blocks)) * 100)
                );

                return (
                  <TableRow
                    key={c.corridor_id}
                    className="cursor-pointer hover:bg-blue-50/40"
                    onClick={() => onSelectCorridor(c)}
                  >
                    {/* Corridor Section */}
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="font-mono text-xs font-bold text-slate-900">
                            {c.corridor_id}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium pl-5 truncate max-w-[200px]">
                          {c.name}
                        </p>
                      </div>
                    </TableCell>

                    {/* Length */}
                    <TableCell>
                      <span className="font-mono text-xs font-semibold text-slate-800">
                        {c.length_km} km
                      </span>
                    </TableCell>

                    {/* Traction Electrification */}
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${
                          c.is_electrified
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        <Zap className="w-3 h-3" />
                        {c.is_electrified ? '25kV AC' : 'Diesel'}
                      </span>
                    </TableCell>

                    {/* 24h Availability Window Visual */}
                    <TableCell className="min-w-[200px]">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="font-semibold text-slate-800">
                            {formatMinuteToTime(c.available_start_minute)} – {formatMinuteToTime(c.available_end_minute)}
                          </span>
                          <span className="text-slate-400">
                            {formatDuration(windowSpanMinutes)}
                          </span>
                        </div>

                        {/* Mini Visual Bar */}
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden relative border border-slate-200">
                          <div
                            className="absolute top-0 bottom-0 bg-emerald-500 rounded-full"
                            style={{
                              left: `${windowStartPct}%`,
                              width: `${windowWidthPct}%`,
                            }}
                          />
                        </div>
                      </div>
                    </TableCell>

                    {/* Parallel Block Capacity */}
                    <TableCell className="min-w-[130px]">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className="font-bold text-slate-800">
                            {c.scheduled_blocks_count || 0} / {c.max_parallel_blocks}
                          </span>
                          <span className="text-slate-500">{capacityPct}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                          <div
                            className={`h-full rounded-full ${
                              capacityPct >= 100
                                ? 'bg-red-500'
                                : capacityPct >= 75
                                ? 'bg-amber-500'
                                : 'bg-blue-600'
                            }`}
                            style={{ width: `${capacityPct}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>

                    {/* Timetable Trains */}
                    <TableCell>
                      <div className="flex items-center gap-1.5 font-mono text-xs text-slate-800">
                        <Train className="w-3.5 h-3.5 text-slate-400" />
                        <span>{c.trains_count || 0}</span>
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <Badge variant={c.is_active ? 'emerald' : 'red'}>
                        {c.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {onFilterRequestsForCorridor && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onFilterRequestsForCorridor(c.corridor_id);
                            }}
                            className="p-1 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Filter Maintenance Requests for this Corridor"
                          >
                            <Calendar className="w-4 h-4" />
                          </button>
                        )}
                        {onFilterAssetsForCorridor && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onFilterAssetsForCorridor(c.corridor_id);
                            }}
                            className="p-1 rounded text-emerald-600 hover:bg-emerald-50 transition-colors"
                            title="View Assets on this Corridor"
                          >
                            <Layers className="w-4 h-4" />
                          </button>
                        )}
                        {onEditAvailability && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditAvailability(c);
                            }}
                            className="p-1 rounded text-amber-600 hover:bg-amber-50 transition-colors"
                            title="Configure Availability Window"
                          >
                            <Sliders className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectCorridor(c);
                          }}
                          className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          title="View Corridor Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
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
                {Math.min(currentPage * pageSize, sortedCorridors.length)}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-slate-900">
                {sortedCorridors.length}
              </span>{' '}
              corridors
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
