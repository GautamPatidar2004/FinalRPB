import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  AlertTriangle,
  Clock,
  Eye,
  CheckCircle2,
  XCircle,
  Zap,
  Train,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';
import type { MaintenanceRequest, Corridor } from '../../types';
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
import {
  formatMinuteToTime,
  formatDuration,
  getUrgencyBadgeVariant,
  getRequestStatusVariant,
} from '../../utils/formatters';

interface RequestTableProps {
  requests: MaintenanceRequest[];
  corridors?: Corridor[];
  isLoading?: boolean;
  onSelectRequest: (request: MaintenanceRequest) => void;
  onSelectCorridor?: (corridorId: string) => void;
  onSelectAsset?: (assetId: string) => void;
  onStatusChange?: (requestId: string, newStatus: string) => Promise<void>;
  onOpenCreate?: () => void;
  selectedCorridorFilter?: string;
  onCorridorFilterChange?: (corridorId: string) => void;
}

type SortField = 'urgency' | 'duration' | 'startTime' | 'id' | 'status';
type SortOrder = 'asc' | 'desc';

const URGENCY_WEIGHT: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export const RequestTable: React.FC<RequestTableProps> = ({
  requests,
  corridors = [],
  isLoading = false,
  onSelectRequest,
  onSelectCorridor,
  onSelectAsset,
  onStatusChange,
  onOpenCreate,
  selectedCorridorFilter = '',
  onCorridorFilterChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedUrgency, setSelectedUrgency] = useState<string>('ALL');
  const [defectsOnly, setDefectsOnly] = useState<boolean>(false);

  const [sortField, setSortField] = useState<SortField>('urgency');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 15;

  // Filtered dataset
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = r.request_id.toLowerCase().includes(q);
        const matchesCorridor = r.corridor_id.toLowerCase().includes(q);
        const matchesAsset = r.asset_id.toLowerCase().includes(q);
        const matchesDefect = r.linked_defect_id?.toLowerCase().includes(q);
        const matchesDept = r.department?.toLowerCase().includes(q);
        if (!matchesId && !matchesCorridor && !matchesAsset && !matchesDefect && !matchesDept) {
          return false;
        }
      }

      // Department filter
      if (selectedDept !== 'ALL' && r.department !== selectedDept) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'ALL' && r.status !== selectedStatus) {
        return false;
      }

      // Urgency filter
      if (selectedUrgency !== 'ALL' && r.urgency !== selectedUrgency) {
        return false;
      }

      // Corridor filter
      if (selectedCorridorFilter && r.corridor_id !== selectedCorridorFilter) {
        return false;
      }

      // Defect / Overdue only
      if (defectsOnly) {
        const hasDefect = !!r.linked_defect_id;
        const isOverdue = (r.days_overdue ?? 0) > 0;
        if (!hasDefect && !isOverdue) return false;
      }

      return true;
    });
  }, [
    requests,
    searchQuery,
    selectedDept,
    selectedStatus,
    selectedUrgency,
    selectedCorridorFilter,
    defectsOnly,
  ]);

  // Sorted dataset
  const sortedRequests = useMemo(() => {
    return [...filteredRequests].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'urgency': {
          const wA = URGENCY_WEIGHT[a.urgency] || 0;
          const wB = URGENCY_WEIGHT[b.urgency] || 0;
          comparison = wA - wB;
          break;
        }
        case 'duration':
          comparison = a.required_duration_minutes - b.required_duration_minutes;
          break;
        case 'startTime':
          comparison = a.earliest_start_minute - b.earliest_start_minute;
          break;
        case 'id':
          comparison = a.request_id.localeCompare(b.request_id);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredRequests, sortField, sortOrder]);

  // Paginated records
  const totalPages = Math.max(1, Math.ceil(sortedRequests.length / pageSize));
  const paginatedRequests = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRequests.slice(start, start + pageSize);
  }, [sortedRequests, currentPage, pageSize]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedDept('ALL');
    setSelectedStatus('ALL');
    setSelectedUrgency('ALL');
    setDefectsOnly(false);
    if (onCorridorFilterChange) onCorridorFilterChange('');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by Request ID, corridor, asset, or defect..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[15px] text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition-colors"
            />
          </div>

          {/* Action: Submit Request */}
          {onOpenCreate && (
            <Button
              variant="primary"
              size="sm"
              onClick={onOpenCreate}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Submit Request
            </Button>
          )}
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 text-[15px]">
          <div className="flex items-center gap-1.5 text-slate-500 font-medium">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Filter:</span>
          </div>

          {/* Department Filter */}
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
            <option value="Operations">Operations</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-medium text-slate-700 hover:bg-slate-100 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="REJECTED">Rejected</option>
          </select>

          {/* Urgency Filter */}
          <select
            value={selectedUrgency}
            onChange={(e) => {
              setSelectedUrgency(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-medium text-slate-700 hover:bg-slate-100 focus:outline-none"
          >
            <option value="ALL">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          {/* Corridor Filter */}
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

          {/* Defects / Overdue Toggle */}
          <button
            type="button"
            onClick={() => {
              setDefectsOnly(!defectsOnly);
              setCurrentPage(1);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-semibold border transition-colors ${
              defectsOnly
                ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-2xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${defectsOnly ? 'text-amber-700' : 'text-slate-400'}`} />
            <span>Defects & Overdue Only</span>
          </button>

          {(searchQuery ||
            selectedDept !== 'ALL' ||
            selectedStatus !== 'ALL' ||
            selectedUrgency !== 'ALL' ||
            selectedCorridorFilter ||
            defectsOnly) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-[15px] text-blue-600 hover:text-blue-800 font-medium ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Table Content */}
      {isLoading ? (
        <LoadingState message="Loading maintenance requests from backend..." />
      ) : sortedRequests.length === 0 ? (
        <EmptyState
          title="No Maintenance Requests Found"
          message={
            requests.length === 0
              ? 'No departmental maintenance block requests exist in the database yet.'
              : 'No requests match your current search and filter criteria.'
          }
          actionLabel={requests.length === 0 && onOpenCreate ? 'Submit First Request' : undefined}
          onAction={requests.length === 0 && onOpenCreate ? onOpenCreate : undefined}
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
                    <span>Request ID</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHeaderCell>
                <TableHeaderCell>Department</TableHeaderCell>
                <TableHeaderCell>Corridor & Asset</TableHeaderCell>
                <TableHeaderCell
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('startTime')}
                >
                  <div className="flex items-center gap-1">
                    <span>Window</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHeaderCell>
                <TableHeaderCell
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('duration')}
                >
                  <div className="flex items-center gap-1">
                    <span>Duration</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHeaderCell>
                <TableHeaderCell
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('urgency')}
                >
                  <div className="flex items-center gap-1">
                    <span>Priority</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHeaderCell>
                <TableHeaderCell
                  className="cursor-pointer select-none"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center gap-1">
                    <span>Status</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedRequests.map((req) => (
                <TableRow
                  key={req.request_id}
                  className="cursor-pointer hover:bg-blue-50/40"
                  onClick={() => onSelectRequest(req)}
                >
                  {/* Request ID & Defect Badge */}
                  <TableCell>
                    <div className="space-y-1">
                      <span className="font-mono text-[15px] font-bold text-slate-900 block">
                        {req.request_id}
                      </span>
                      {req.linked_defect_id && (
                        <div className="flex items-center gap-1">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[11.5px] font-bold font-mono border border-amber-200">
                            <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                            {req.linked_defect_id}
                          </span>
                          {(req.days_overdue ?? 0) > 0 && (
                            <span className="px-1 py-0.2 bg-red-600 text-white rounded text-[10.5px] font-bold">
                              OVERDUE
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* Department */}
                  <TableCell>
                    <span className="text-[15px] font-medium text-slate-800">
                      {req.department}
                    </span>
                    <div className="flex items-center gap-1 mt-0.5">
                      {req.is_traffic_block_required && (
                        <span
                          className="text-[11.5px] text-slate-500 flex items-center gap-0.5"
                          title="Traffic block required"
                        >
                          <Train className="w-3 h-3 text-slate-400" />
                          Traffic
                        </span>
                      )}
                      {req.is_power_block_required && (
                        <span
                          className="text-[11.5px] text-blue-600 flex items-center gap-0.5 font-medium"
                          title="Power block required"
                        >
                          <Zap className="w-3 h-3 text-blue-500" />
                          OHE
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Corridor & Asset Cross Link */}
                  <TableCell>
                    <div className="space-y-0.5 text-[15px]">
                      <div>
                        {onSelectCorridor ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectCorridor(req.corridor_id);
                            }}
                            className="font-mono text-blue-600 hover:text-blue-800 font-semibold hover:underline"
                            title="Filter corridor"
                          >
                            {req.corridor_id}
                          </button>
                        ) : (
                          <span className="font-mono text-slate-800 font-semibold">
                            {req.corridor_id}
                          </span>
                        )}
                      </div>
                      <div>
                        {onSelectAsset ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectAsset(req.asset_id);
                            }}
                            className="font-mono text-[12.5px] text-slate-500 hover:text-slate-800 hover:underline"
                            title="Inspect asset"
                          >
                            AST: {req.asset_id}
                          </button>
                        ) : (
                          <span className="font-mono text-[12.5px] text-slate-500">
                            AST: {req.asset_id}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Time Window */}
                  <TableCell>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1 font-mono text-[15px] font-semibold text-slate-800">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{formatMinuteToTime(req.earliest_start_minute)}</span>
                        <span className="text-slate-400">→</span>
                        <span>{formatMinuteToTime(req.latest_end_minute)}</span>
                      </div>
                      <span className="text-[11.5px] text-slate-400 font-mono block">
                        Min {req.earliest_start_minute}–{req.latest_end_minute}
                      </span>
                    </div>
                  </TableCell>

                  {/* Duration */}
                  <TableCell>
                    <span className="font-mono text-[15px] font-semibold text-slate-800">
                      {formatDuration(req.required_duration_minutes)}
                    </span>
                    <span className="text-[11.5px] text-slate-400 block font-mono">
                      {req.required_duration_minutes}m
                    </span>
                  </TableCell>

                  {/* Priority Badge */}
                  <TableCell>
                    <Badge variant={getUrgencyBadgeVariant(req.urgency)}>
                      {req.urgency}
                    </Badge>
                  </TableCell>

                  {/* Status Badge */}
                  <TableCell>
                    <Badge
                      variant={getRequestStatusVariant(req.status)}
                      dot={req.status === 'PENDING'}
                    >
                      {req.status}
                    </Badge>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {onStatusChange && req.status === 'PENDING' && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStatusChange(req.request_id, 'APPROVED');
                            }}
                            className="p-1 rounded text-emerald-600 hover:bg-emerald-50 transition-colors"
                            title="Approve Request"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStatusChange(req.request_id, 'REJECTED');
                            }}
                            className="p-1 rounded text-red-500 hover:bg-red-50 transition-colors"
                            title="Reject Request"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRequest(req);
                        }}
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        title="View Details"
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
          <div className="flex items-center justify-between text-[15px] text-slate-600 px-2 pt-2">
            <div>
              Showing{' '}
              <span className="font-semibold text-slate-900">
                {(currentPage - 1) * pageSize + 1}
              </span>{' '}
              to{' '}
              <span className="font-semibold text-slate-900">
                {Math.min(currentPage * pageSize, sortedRequests.length)}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-slate-900">
                {sortedRequests.length}
              </span>{' '}
              requests
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
