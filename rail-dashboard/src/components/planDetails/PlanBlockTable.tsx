import React, { useState, useMemo } from 'react';
import {
  Search,
  AlertTriangle,
  CheckCircle,
  Eye,
  Sliders,
} from 'lucide-react';
import type { BlockPlanItem, Department } from '../../types';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  Badge,
  Button,
} from '../common';
import { formatMinuteToTime, formatDuration } from '../../utils';

export interface PlanBlockTableProps {
  items: BlockPlanItem[];
  onSelectBlock: (block: BlockPlanItem) => void;
  onModifyBlock?: (block: BlockPlanItem) => void;
  isImmutable?: boolean;
  selectedBlockId?: string;
}

export const PlanBlockTable: React.FC<PlanBlockTableProps> = ({
  items,
  onSelectBlock,
  onModifyBlock,
  isImmutable = false,
  selectedBlockId,
}) => {
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [conflictOnly, setConflictOnly] = useState<boolean>(false);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Dept filter
      if (selectedDept !== 'ALL' && item.department !== selectedDept) {
        return false;
      }
      // Conflict filter
      if (conflictOnly && (!item.conflict_flags || item.conflict_flags.length === 0)) {
        return false;
      }
      // Text query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesReq = item.request_id.toLowerCase().includes(q);
        const matchesAsset = item.asset_id.toLowerCase().includes(q);
        const matchesCorridor = item.corridor_id.toLowerCase().includes(q);
        if (!matchesReq && !matchesAsset && !matchesCorridor) return false;
      }
      return true;
    });
  }, [items, selectedDept, searchQuery, conflictOnly]);

  // Unique departments for filter tabs
  const departments = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => set.add(it.department));
    return ['ALL', ...Array.from(set)];
  }, [items]);

  const getDeptBadgeVariant = (dept: Department | string) => {
    switch (dept) {
      case 'Engineering':
        return 'blue';
      case 'Traction Distribution':
        return 'amber';
      case 'Signalling & Telecom':
        return 'purple';
      case 'Operations':
        return 'cyan';
      default:
        return 'slate';
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_12px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.05)] p-6 space-y-4">
      {/* Header & Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Scheduled Block Table
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Complete schedule assignments generated from the operational planning dataset ({filteredItems.length} of {items.length} blocks).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by ID, asset, corridor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:bg-white w-52 transition-all"
            />
          </div>

          {/* Conflict filter toggle */}
          <button
            type="button"
            onClick={() => setConflictOnly(!conflictOnly)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              conflictOnly
                ? 'bg-red-50 text-red-700 border-red-300'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            <span>Conflicts Only</span>
          </button>
        </div>
      </div>

      {/* Department Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {departments.map((dept) => {
          const count =
            dept === 'ALL'
              ? items.length
              : items.filter((it) => it.department === dept).length;
          const isActive = selectedDept === dept;
          return (
            <button
              key={dept}
              type="button"
              onClick={() => setSelectedDept(dept)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{dept}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-xs">
          No block items match the selected filters.
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="w-12">#</TableHeaderCell>
              <TableHeaderCell>Request ID</TableHeaderCell>
              <TableHeaderCell>Department</TableHeaderCell>
              <TableHeaderCell>Corridor</TableHeaderCell>
              <TableHeaderCell>Asset ID</TableHeaderCell>
              <TableHeaderCell>Scheduled Window</TableHeaderCell>
              <TableHeaderCell>Duration</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Conflict Flags</TableHeaderCell>
              <TableHeaderCell className="text-right">Action</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredItems.map((item, idx) => {
              const isSelected = selectedBlockId === (item.id || item.request_id);
              const hasConflict = item.conflict_flags && item.conflict_flags.length > 0;

              return (
                <TableRow
                  key={item.id || item.request_id}
                  className={isSelected ? 'bg-blue-50/50' : undefined}
                >
                  <TableCell className="font-mono text-xs text-slate-400">
                    {idx + 1}
                  </TableCell>

                  <TableCell className="font-mono text-xs font-bold text-blue-700">
                    <button
                      type="button"
                      onClick={() => onSelectBlock(item)}
                      className="hover:underline text-left"
                    >
                      {item.request_id}
                    </button>
                  </TableCell>

                  <TableCell>
                    <Badge
                      variant={getDeptBadgeVariant(item.department)}
                      statusText={item.department}
                    />
                  </TableCell>

                  <TableCell className="font-mono text-xs text-slate-700">
                    {item.corridor_id}
                  </TableCell>

                  <TableCell className="font-mono text-xs text-slate-600">
                    {item.asset_id}
                  </TableCell>

                  <TableCell className="font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                    {formatMinuteToTime(item.scheduled_start_minute)} –{' '}
                    {formatMinuteToTime(item.scheduled_end_minute)}
                  </TableCell>

                  <TableCell className="font-mono text-xs text-slate-600 whitespace-nowrap">
                    {formatDuration(item.allocated_duration_minutes)}
                  </TableCell>

                  <TableCell>
                    <Badge
                      variant={item.status === 'SCHEDULED' ? 'emerald' : 'amber'}
                      statusText={item.status}
                    />
                  </TableCell>

                  <TableCell>
                    {hasConflict ? (
                      <div className="flex flex-wrap gap-1">
                        {item.conflict_flags.map((flag, fIdx) => (
                          <span
                            key={fIdx}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5"
                          >
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {flag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Clear
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {onModifyBlock && !isImmutable && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onModifyBlock(item)}
                          leftIcon={<Sliders className="w-3.5 h-3.5 text-blue-600" />}
                          className="text-xs"
                        >
                          Modify
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onSelectBlock(item)}
                        leftIcon={<Eye className="w-3.5 h-3.5" />}
                        className="text-xs"
                      >
                        Inspect
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
};
