import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  RotateCcw,
  RefreshCw,
  FileText,
  ChevronRight,
  CheckSquare,
  Square,
} from 'lucide-react';
import { operationalService, planningService } from '../services';
import type {
  Corridor,
  MaintenanceRequest,
  Asset,
  CorridorAvailability,
  PlanGenerationParams,
  PlanGenerationResult,
  BlockPlan,
  Department,
} from '../types';
import {
  Button,
  Card,
  Badge,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../components/common';
import {
  formatMinuteToTime,
  parseTimeToMinute,
  formatDuration,
  formatTimestamp,
  formatKm,
  getUrgencyBadgeVariant,
} from '../utils';

type ActiveTab = 'workspace' | 'history';

const PIPELINE_STAGES = [
  'Preparing operational requests & timetable data',
  'Checking track capacity & timetable constraints',
  'Optimizing multi-departmental block windows',
  'Validating hard safety & corridor rules',
  'Finalizing optimized block schedule',
];

export const PlanningPage: React.FC = () => {
  const navigate = useNavigate();

  // Navigation tab: Active Planning Workspace vs History of Persisted Plans
  const [activeTab, setActiveTab] = useState<ActiveTab>('workspace');

  // Operational Data from Backend APIs
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [availability, setAvailability] = useState<CorridorAvailability[]>([]);
  const [persistedPlans, setPersistedPlans] = useState<BlockPlan[]>([]);

  // Page Load State
  const [isLoadingInputs, setIsLoadingInputs] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Planning Form Inputs
  const [selectedCorridorId, setSelectedCorridorId] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set());
  const [windowPreset, setWindowPreset] = useState<'FULL_DAY' | 'NIGHT' | 'EARLY_MORNING' | 'MIDDAY' | 'CUSTOM'>('FULL_DAY');
  const [startMinute, setStartMinute] = useState<number>(0);
  const [endMinute, setEndMinute] = useState<number>(1440);
  const [planTitle, setPlanTitle] = useState<string>('');

  // AI Generation State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [pipelineStageIndex, setPipelineStageIndex] = useState<number>(0);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<PlanGenerationResult | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isGenerating) {
      setPipelineStageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setPipelineStageIndex((prev) => (prev + 1) % PIPELINE_STAGES.length);
    }, 700);
    return () => clearInterval(interval);
  }, [isGenerating]);

  // Load operational inputs from backend
  const loadOperationalData = useCallback(async () => {
    setIsLoadingInputs(true);
    setLoadError(null);
    try {
      const [corrs, reqs, asts, avails, plans] = await Promise.all([
        operationalService.getCorridors(),
        operationalService.getRequests({ status: 'PENDING,APPROVED' }),
        operationalService.getAssets(),
        operationalService.getAvailability().catch(() => [] as CorridorAvailability[]),
        planningService.getPlans().catch(() => [] as BlockPlan[]),
      ]);

      setCorridors(corrs);
      setRequests(reqs);
      setAssets(asts);
      setAvailability(avails);
      setPersistedPlans(plans);

      // Auto-select first corridor if none selected
      if (corrs.length > 0 && !selectedCorridorId) {
        setSelectedCorridorId(corrs[0].corridor_id);
      }
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load operational planning inputs from backend.');
    } finally {
      setIsLoadingInputs(false);
    }
  }, [selectedCorridorId]);

  useEffect(() => {
    loadOperationalData();
  }, [loadOperationalData]);

  // Sync selected requests when corridor changes
  const activeCorridor = useMemo(
    () => corridors.find((c) => c.corridor_id === selectedCorridorId),
    [corridors, selectedCorridorId]
  );

  // Map of assets for quick chainage/track type lookup
  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    assets.forEach((a) => map.set(a.asset_id, a));
    return map;
  }, [assets]);

  const activeAvailability = useMemo(
    () => availability.find((a) => a.corridor_id === selectedCorridorId),
    [availability, selectedCorridorId]
  );

  // Eligible pending requests for the selected corridor & department
  const eligibleRequests = useMemo(() => {
    return requests.filter((r) => {
      if (r.corridor_id !== selectedCorridorId) return false;
      if (selectedDepartment !== 'ALL' && r.department !== selectedDepartment) return false;
      return true;
    });
  }, [requests, selectedCorridorId, selectedDepartment]);

  // Default: Auto-select all eligible requests on corridor switch
  useEffect(() => {
    if (eligibleRequests.length > 0) {
      setSelectedRequestIds(new Set(eligibleRequests.map((r) => r.request_id)));
    } else {
      setSelectedRequestIds(new Set());
    }
  }, [eligibleRequests]);

  // Window preset handler
  const handlePresetChange = (preset: 'FULL_DAY' | 'NIGHT' | 'EARLY_MORNING' | 'MIDDAY' | 'CUSTOM') => {
    setWindowPreset(preset);
    switch (preset) {
      case 'FULL_DAY':
        setStartMinute(0);
        setEndMinute(1440);
        break;
      case 'NIGHT':
        setStartMinute(60); // 01:00
        setEndMinute(360); // 06:00
        break;
      case 'EARLY_MORNING':
        setStartMinute(240); // 04:00
        setEndMinute(480); // 08:00
        break;
      case 'MIDDAY':
        setStartMinute(660); // 11:00
        setEndMinute(900); // 15:00
        break;
      case 'CUSTOM':
        // Keep current custom minutes
        break;
    }
  };

  // Toggle request selection
  const toggleRequest = (reqId: string) => {
    setSelectedRequestIds((prev) => {
      const next = new Set(prev);
      if (next.has(reqId)) {
        next.delete(reqId);
      } else {
        next.add(reqId);
      }
      return next;
    });
  };

  const selectAllEligible = () => {
    setSelectedRequestIds(new Set(eligibleRequests.map((r) => r.request_id)));
  };

  const deselectAllEligible = () => {
    setSelectedRequestIds(new Set());
  };

  // Summary Metrics Computation
  const selectedRequestsList = useMemo(() => {
    return eligibleRequests.filter((r) => selectedRequestIds.has(r.request_id));
  }, [eligibleRequests, selectedRequestIds]);

  const totalRequiredDuration = useMemo(() => {
    return selectedRequestsList.reduce((acc, r) => acc + (r.required_duration_minutes || 0), 0);
  }, [selectedRequestsList]);

  const affectedAssetIds = useMemo(() => {
    return Array.from(new Set(selectedRequestsList.map((r) => r.asset_id)));
  }, [selectedRequestsList]);

  const departmentsInvolved = useMemo(() => {
    return Array.from(new Set(selectedRequestsList.map((r) => r.department)));
  }, [selectedRequestsList]);

  // Real AI Plan Generation Trigger
  const handleGeneratePlan = async () => {
    setValidationError(null);
    setGenerationError(null);

    // 1. Validation
    if (!selectedCorridorId) {
      setValidationError('Please select a target railway corridor section.');
      return;
    }
    if (selectedRequestIds.size === 0) {
      setValidationError('Please select at least one pending maintenance request to plan.');
      return;
    }
    if (startMinute >= endMinute) {
      setValidationError('Planning window start minute must be strictly earlier than end minute.');
      return;
    }

    // 2. Construct contract payload for AI engine
    const payload: PlanGenerationParams = {
      corridor_id: selectedCorridorId,
      department: selectedDepartment !== 'ALL' ? (selectedDepartment as Department) : undefined,
      request_ids: Array.from(selectedRequestIds),
      start_minute: startMinute,
      end_minute: endMinute,
      title:
        planTitle.trim() ||
        `Optimized Plan - ${activeCorridor?.name || selectedCorridorId} (${formatMinuteToTime(
          startMinute
        )} - ${formatMinuteToTime(endMinute)})`,
    };

    // 3. Execution state
    setIsGenerating(true);

    try {
      const response = await planningService.generatePlan(payload);

      setGeneratedPlan(response);

      // Re-fetch operational data so allocated requests disappear from the unallocated candidate list
      await loadOperationalData();

      // Smooth scroll to generated plan results
      setTimeout(() => {
        const el = document.getElementById('generated-plan-results');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);

      // Save to sessionStorage for Prompt 5 continuation bridge
      try {
        sessionStorage.setItem('last_generated_plan', JSON.stringify(response));
        sessionStorage.setItem(
          'last_planning_context',
          JSON.stringify({
            corridor_id: selectedCorridorId,
            request_ids: Array.from(selectedRequestIds),
            start_minute: startMinute,
            end_minute: endMinute,
          })
        );
      } catch {
        // Ignore storage quota or disabled storage
      }

      // Refresh persisted list in background
      planningService.getPlans().then(setPersistedPlans).catch(() => {});
    } catch (err: any) {
      const msg =
        err?.message ||
        'AI Planning Engine encountered an error while optimizing the maintenance schedule.';
      setGenerationError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handoff to Prompt 5
  const handleProceedToReview = () => {
    if (!generatedPlan) return;
    const planToPass = {
      ...generatedPlan,
      items: generatedPlan.scheduled_blocks || [],
    };
    navigate(`/review/${generatedPlan.plan_id}`, {
      state: {
        plan: planToPass,
        corridor: activeCorridor,
        requests: selectedRequestsList,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Context */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Block Planning Workspace
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              AI Engine Ready
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Automated multi-departmental railway maintenance window allocation, train path deconfliction & feasibility engine.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('workspace')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'workspace'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Workspace</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'history'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Persisted Plans ({persistedPlans.length})</span>
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={loadOperationalData}
            isLoading={isLoadingInputs}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh Data
          </Button>
        </div>
      </div>

      {isLoadingInputs ? (
        <LoadingState message="Loading railway corridors, pending requests, and operational constraints..." />
      ) : loadError ? (
        <ErrorState
          title="Failed to Load Planning Workspace"
          message={loadError}
          onRetry={loadOperationalData}
        />
      ) : activeTab === 'history' ? (
        /* PERSISTED PLANS HISTORY VIEW */
        <Card
          title="Persisted AI Block Plans"
          subtitle="Audit history of previously generated multi-strategy candidate plans from the planning engine."
          accent="blue"
        >
          {persistedPlans.length === 0 ? (
            <EmptyState
              title="No Persisted Plans Found"
              message="No block plans have been generated yet. Use the Workspace tab to generate candidate schedules using the real AI engine."
            />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Plan ID</TableHeaderCell>
                  <TableHeaderCell>Title</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Feasibility</TableHeaderCell>
                  <TableHeaderCell>Optimization Score</TableHeaderCell>
                  <TableHeaderCell>Selected Strategy</TableHeaderCell>
                  <TableHeaderCell>Created</TableHeaderCell>
                  <TableHeaderCell className="text-right">Action</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {persistedPlans.map((p) => (
                  <TableRow key={p.plan_id}>
                    <TableCell className="font-mono text-xs font-semibold text-blue-700">
                      {p.plan_id}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">{p.title}</TableCell>
                    <TableCell>
                      <Badge statusText={p.status} dot />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={p.is_feasible ? 'emerald' : 'red'}
                        statusText={p.is_feasible ? 'FEASIBLE' : 'CONFLICTS'}
                      />
                    </TableCell>
                    <TableCell className="font-mono font-semibold text-slate-900">
                      {p.overall_score != null ? `${Number(p.overall_score).toFixed(1)}%` : '—'}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-slate-600">
                      {p.selected_strategy || 'Default'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {formatTimestamp(p.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        rightIcon={<ChevronRight className="w-3 h-3" />}
                        onClick={() => navigate(`/review/${p.plan_id}`)}
                      >
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      ) : (
        /* ACTIVE WORKSPACE VIEW */
        <div className="space-y-6">
          {/* Validation Failure Banner */}
          {validationError && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold">Planning Validation Issue: </span>
                <span>{validationError}</span>
              </div>
              <button
                type="button"
                onClick={() => setValidationError(null)}
                className="text-red-500 hover:text-red-700"
              >
                &times;
              </button>
            </div>
          )}

          {/* AI / API Generation Error Banner */}
          {generationError && (
            <div className="flex items-start justify-between gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
              <div className="flex items-start gap-3">
                <XCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-amber-900">AI Plan Generation Encountered an Error</h4>
                  <p className="mt-0.5 text-amber-800">{generationError}</p>
                  <p className="mt-1 text-[11px] text-amber-700">
                    Your planning selections have been preserved. You can modify inputs or retry generation.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGeneratePlan}
                isLoading={isGenerating}
                leftIcon={<RotateCcw className="w-3 h-3" />}
              >
                Retry
              </Button>
            </div>
          )}

          {/* Planning Configuration Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Card 1: Target Corridor & Infrastructure */}
            <Card
              title="1. Target Corridor & Section"
              subtitle="Operational track section subject to block planning."
              accent="blue"
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Section / Corridor
                  </label>
                  <select
                    value={selectedCorridorId}
                    onChange={(e) => setSelectedCorridorId(e.target.value)}
                    className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {corridors.map((c) => (
                      <option key={c.corridor_id} value={c.corridor_id}>
                        {c.name} ({c.corridor_id})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Corridor Operational Metadata */}
                {activeCorridor && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Section Length:</span>
                      <span className="font-semibold text-slate-900">{formatKm(activeCorridor.length_km)}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Traction Type:</span>
                      <span className="font-semibold text-slate-900">
                        {activeCorridor.is_electrified ? '25 kV AC Electrified' : 'Non-Electrified'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Max Parallel Blocks:</span>
                      <span className="font-semibold text-slate-900">
                        {activeCorridor.max_parallel_blocks} Simultaneous
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Daily Section Window:</span>
                      <span className="font-mono font-medium text-slate-800">
                        {formatMinuteToTime(activeCorridor.available_start_minute || 0)} -{' '}
                        {formatMinuteToTime(activeCorridor.available_end_minute || 1440)}
                      </span>
                    </div>
                    {activeAvailability && (
                      <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-slate-200/60">
                        <span>OHE Electrification Status:</span>
                        <span className="font-semibold text-slate-900">
                          {activeAvailability.is_electrified ? '25 kV AC (Live)' : 'Isolated / Non-Traction'}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* Card 2: Department Scope & Presets */}
            <Card
              title="2. Department Scope & Window"
              subtitle="Filter eligible departments and target planning horizon."
              accent="blue"
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department Filter
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'ALL', label: 'All Depts' },
                      { id: 'Engineering', label: 'Civil / Track' },
                      { id: 'Traction Distribution', label: 'TRD / OHE' },
                      { id: 'Signalling & Telecom', label: 'S&T' },
                    ].map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setSelectedDepartment(d.id)}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-md border text-center transition-colors ${
                          selectedDepartment === d.id
                            ? 'bg-blue-50 border-blue-500 text-blue-700 font-semibold'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Planning Horizon Preset
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => handlePresetChange('FULL_DAY')}
                      className={`px-2 py-1 rounded border text-left ${
                        windowPreset === 'FULL_DAY'
                          ? 'bg-blue-50 border-blue-500 text-blue-700 font-semibold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Full Day (24h)
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePresetChange('NIGHT')}
                      className={`px-2 py-1 rounded border text-left ${
                        windowPreset === 'NIGHT'
                          ? 'bg-blue-50 border-blue-500 text-blue-700 font-semibold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Night Shadow (01-06)
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePresetChange('EARLY_MORNING')}
                      className={`px-2 py-1 rounded border text-left ${
                        windowPreset === 'EARLY_MORNING'
                          ? 'bg-blue-50 border-blue-500 text-blue-700 font-semibold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Morning (04-08)
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePresetChange('CUSTOM')}
                      className={`px-2 py-1 rounded border text-left ${
                        windowPreset === 'CUSTOM'
                          ? 'bg-blue-50 border-blue-500 text-blue-700 font-semibold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Custom Limits
                    </button>
                  </div>
                </div>

                {/* Minute Bounds */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-0.5">
                      Start Time ({startMinute}m)
                    </label>
                    <input
                      type="time"
                      value={formatMinuteToTime(startMinute)}
                      onChange={(e) => {
                        setStartMinute(parseTimeToMinute(e.target.value));
                        setWindowPreset('CUSTOM');
                      }}
                      className="w-full text-xs font-mono bg-white border border-slate-300 rounded px-2 py-1 text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-0.5">
                      End Time ({endMinute}m)
                    </label>
                    <input
                      type="time"
                      value={formatMinuteToTime(endMinute)}
                      onChange={(e) => {
                        setEndMinute(parseTimeToMinute(e.target.value));
                        setWindowPreset('CUSTOM');
                      }}
                      className="w-full text-xs font-mono bg-white border border-slate-300 rounded px-2 py-1 text-slate-900"
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Card 3: Plan Metadata & Actions */}
            <Card
              title="3. Execution Summary"
              subtitle="Selected operational constraints ready for AI engine."
              accent="blue"
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Plan Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={planTitle}
                    onChange={(e) => setPlanTitle(e.target.value)}
                    placeholder={`Autonomous Block Plan - ${activeCorridor?.corridor_id || 'COR'}`}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Live Planning Readiness Checklist */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Selected Requests:</span>
                    <span className="font-semibold text-slate-900">
                      {selectedRequestIds.size} of {eligibleRequests.length} pending
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Requested Work Duration:</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {formatDuration(totalRequiredDuration)} ({totalRequiredDuration} min)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Affected Infrastructure:</span>
                    <span className="font-semibold text-slate-900">
                      {affectedAssetIds.length} Assets ({departmentsInvolved.length} Depts)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Active Window:</span>
                    <span className="font-mono font-medium text-slate-800">
                      {formatMinuteToTime(startMinute)} - {formatMinuteToTime(endMinute)}
                    </span>
                  </div>
                </div>

                {/* Generate Action Button */}
                <Button
                  variant="primary"
                  className="w-full justify-center py-2.5 shadow-sm text-sm"
                  onClick={handleGeneratePlan}
                  isLoading={isGenerating}
                  disabled={isGenerating || selectedRequestIds.size === 0}
                  leftIcon={<Sparkles className="w-4 h-4 text-amber-300" />}
                >
                  {isGenerating ? 'Optimizing Railway Schedule...' : 'Generate AI Block Plan'}
                </Button>
              </div>
            </Card>
          </div>

          {/* Eligible Maintenance Requests Selection Table */}
          <Card
            title="Eligible Maintenance Block Requests"
            subtitle={`Select pending requests for corridor ${selectedCorridorId} to be scheduled by the AI optimizer.`}
            action={
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={selectAllEligible}
                  disabled={eligibleRequests.length === 0}
                  leftIcon={<CheckSquare className="w-3 h-3" />}
                >
                  Select All ({eligibleRequests.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={deselectAllEligible}
                  disabled={selectedRequestIds.size === 0}
                  leftIcon={<Square className="w-3 h-3" />}
                >
                  Clear Selection
                </Button>
              </div>
            }
          >
            {eligibleRequests.length === 0 ? (
              <EmptyState
                title="No Pending Requests for Current Filter"
                message={`No pending maintenance requests found for corridor ${selectedCorridorId} under department filter ${selectedDepartment}.`}
              />
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell className="w-10 text-center">Select</TableHeaderCell>
                    <TableHeaderCell>Request ID</TableHeaderCell>
                    <TableHeaderCell>Department</TableHeaderCell>
                    <TableHeaderCell>Urgency</TableHeaderCell>
                    <TableHeaderCell>Asset ID</TableHeaderCell>
                    <TableHeaderCell>Required Duration</TableHeaderCell>
                    <TableHeaderCell>Operational Window</TableHeaderCell>
                    <TableHeaderCell>Block Requisite</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {eligibleRequests.map((r) => {
                    const isSelected = selectedRequestIds.has(r.request_id);
                    const linkedAsset = assetMap.get(r.asset_id);
                    return (
                      <TableRow
                        key={r.request_id}
                        className={isSelected ? 'bg-blue-50/40' : undefined}
                      >
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRequest(r.request_id)}
                            className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-blue-700">
                          {r.request_id}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-slate-800">
                          {r.department}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={getUrgencyBadgeVariant(r.urgency)}
                            statusText={r.urgency}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-700">
                          <div>{r.asset_id}</div>
                          {linkedAsset && (
                            <div className="text-[10px] text-slate-400 font-sans">
                              {linkedAsset.track_type} • {formatKm(linkedAsset.start_km)} - {formatKm(linkedAsset.end_km)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-medium text-slate-900">
                          {formatDuration(r.required_duration_minutes)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-600">
                          {formatMinuteToTime(r.earliest_start_minute || 0)} -{' '}
                          {formatMinuteToTime(r.latest_end_minute || 1440)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {r.is_traffic_block_required && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
                                Traffic
                              </span>
                            )}
                            {r.is_power_block_required && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                Power / OHE
                              </span>
                            )}
                            {!r.is_traffic_block_required && !r.is_power_block_required && (
                              <span className="text-[11px] text-slate-400">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge statusText={r.status} dot />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>

          {/* GENERATION PROGRESS PANEL (WHILE RUNNING) */}
          {isGenerating && (
            <div className="p-6 bg-slate-900 text-white rounded-xl shadow-lg border border-slate-800 space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full border-2 border-blue-400 border-t-transparent animate-spin"></div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Railway AI Optimization Pipeline In Progress
                  </h3>
                  <p className="text-xs text-blue-300 font-medium">
                    {PIPELINE_STAGES[pipelineStageIndex]}...
                  </p>
                </div>
              </div>

              {/* Pipeline stages breadcrumb */}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-800 text-xs">
                {PIPELINE_STAGES.map((stg, idx) => {
                  const isActive = idx === pipelineStageIndex;
                  const isDone = idx < pipelineStageIndex;
                  return (
                    <div
                      key={stg}
                      className={`p-2 rounded-lg transition-colors border ${
                        isActive
                          ? 'bg-blue-900/60 border-blue-500 text-blue-200 shadow-sm'
                          : isDone
                          ? 'bg-slate-800/40 border-slate-700 text-slate-400'
                          : 'bg-slate-800/20 border-slate-800/50 text-slate-500'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-medium text-[11px]">
                        <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-blue-400 animate-ping' : isDone ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        <span>Stage {idx + 1}</span>
                      </div>
                      <div className="text-[10px] truncate mt-0.5" title={stg}>
                        {stg}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs pt-2 border-t border-slate-800">
                <div className="p-2.5 bg-slate-800/80 rounded-lg">
                  <span className="block text-[11px] text-slate-400">Target Corridor</span>
                  <span className="font-mono font-semibold text-blue-300">{selectedCorridorId}</span>
                </div>
                <div className="p-2.5 bg-slate-800/80 rounded-lg">
                  <span className="block text-[11px] text-slate-400">Selected Requests</span>
                  <span className="font-semibold text-blue-300">{selectedRequestIds.size} Requests</span>
                </div>
                <div className="p-2.5 bg-slate-800/80 rounded-lg">
                  <span className="block text-[11px] text-slate-400">Planning Window</span>
                  <span className="font-mono font-semibold text-blue-300">
                    {formatMinuteToTime(startMinute)} - {formatMinuteToTime(endMinute)}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-800/80 rounded-lg">
                  <span className="block text-[11px] text-slate-400">AI Engine</span>
                  <span className="font-semibold text-emerald-400">Priority Greedy + Feasibility</span>
                </div>
              </div>
            </div>
          )}

          {/* AI RESULT PREVIEW AREA (UPON COMPLETION) */}
          {generatedPlan && !isGenerating && (
            <div id="generated-plan-results" className="space-y-6 pt-4 border-t-2 border-blue-500">
              {/* Result Header Card */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                        {generatedPlan.plan_id}
                      </span>
                      <Badge
                        variant={generatedPlan.is_feasible ? 'emerald' : 'red'}
                        statusText={generatedPlan.is_feasible ? 'FEASIBLE PLAN' : 'INFEASIBLE (VIOLATIONS)'}
                      />
                      <Badge statusText={generatedPlan.status} dot />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 mt-2">
                      {generatedPlan.title}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Generated at {formatTimestamp(generatedPlan.created_at)} using strategy{' '}
                      <span className="font-mono font-semibold text-slate-700">
                        {generatedPlan.selected_strategy}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      variant="primary"
                      onClick={handleProceedToReview}
                      rightIcon={<ArrowRight className="w-4 h-4" />}
                      className="shadow-md text-xs font-semibold py-2 px-4"
                    >
                      Inspect Plan Details, Operational Timeline & Validation
                    </Button>
                  </div>
                </div>

                {/* Score & Feasibility KPI Summary Tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="block text-[11px] font-medium text-slate-500">Overall Score</span>
                    <span className="text-xl font-bold font-mono text-blue-600">
                      {Number(generatedPlan.overall_score).toFixed(1)}%
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="block text-[11px] font-medium text-slate-500">Scheduled Blocks</span>
                    <span className="text-xl font-bold text-slate-900">
                      {generatedPlan.scheduled_blocks?.length || 0} / {selectedRequestIds.size}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="block text-[11px] font-medium text-slate-500">Train Conflicts</span>
                    <span className="text-xl font-bold text-emerald-600">
                      {generatedPlan.evaluation?.metrics?.train_conflicts ?? 0}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="block text-[11px] font-medium text-slate-500">Night Shadow Slots</span>
                    <span className="text-xl font-bold text-indigo-600">
                      {generatedPlan.evaluation?.metrics?.night_shadow_placements ?? 0}
                    </span>
                  </div>
                </div>

                {/* Factor Scores Breakdown */}
                {generatedPlan.evaluation?.factor_scores && (
                  <div className="pt-2 border-t border-slate-100">
                    <h4 className="text-xs font-semibold text-slate-700 mb-2">
                      Multi-Factor Optimization Assessment
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                      {Object.entries(generatedPlan.evaluation.factor_scores).map(([key, score]) => (
                        <div key={key} className="p-2 bg-slate-50 rounded border border-slate-200">
                          <span className="block text-[10px] text-slate-500 capitalize truncate">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="font-mono font-bold text-slate-900">
                            {score != null ? `${Number(score).toFixed(0)}%` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Recommended Scheduled Maintenance Blocks Table */}
              <Card
                title="Recommended Scheduled Blocks"
                subtitle="Exact window assignments computed by the AI optimizer."
                accent="emerald"
              >
                {generatedPlan.scheduled_blocks?.length === 0 ? (
                  <EmptyState
                    title="No Blocks Scheduled"
                    message="The AI engine could not schedule any blocks within the requested constraint limits."
                  />
                ) : (
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Request ID</TableHeaderCell>
                        <TableHeaderCell>Department</TableHeaderCell>
                        <TableHeaderCell>Asset ID</TableHeaderCell>
                        <TableHeaderCell>Scheduled Slot</TableHeaderCell>
                        <TableHeaderCell>Allocated Duration</TableHeaderCell>
                        <TableHeaderCell>Status</TableHeaderCell>
                        <TableHeaderCell>Safety / Conflict Flags</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {generatedPlan.scheduled_blocks.map((block) => (
                        <TableRow key={block.id || block.request_id}>
                          <TableCell className="font-mono text-xs font-semibold text-blue-700">
                            {block.request_id}
                          </TableCell>
                          <TableCell className="text-xs font-medium text-slate-800">
                            {block.department}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-700">
                            {block.asset_id}
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-slate-900">
                            {formatMinuteToTime(block.scheduled_start_minute)} -{' '}
                            {formatMinuteToTime(block.scheduled_end_minute)}
                            <span className="text-[10px] text-slate-500 ml-1.5 font-normal">
                              ({block.scheduled_start_minute}m - {block.scheduled_end_minute}m)
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-medium text-slate-900">
                            {formatDuration(block.allocated_duration_minutes)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="emerald"
                              statusText={block.status || 'SCHEDULED'}
                              dot
                            />
                          </TableCell>
                          <TableCell>
                            {block.conflict_flags && block.conflict_flags.length > 0 ? (
                              <div className="flex items-center gap-1 flex-wrap">
                                {block.conflict_flags.map((flag, idx) => (
                                  <span
                                    key={idx}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200"
                                  >
                                    {flag}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Conflict Free
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>

              {/* AI Explainability: Decision Log & Strengths */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Decision Log */}
                <Card
                  title="AI Scheduling Decisions & Rationale"
                  subtitle="Detailed explainability for each scheduled maintenance block."
                >
                  {generatedPlan.decision_log && generatedPlan.decision_log.length > 0 ? (
                    <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                      {generatedPlan.decision_log.map((d, idx) => (
                        <div
                          key={idx}
                          className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-semibold text-blue-700">
                              {d.request_id}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200 text-slate-700">
                              {d.decision_type}
                            </span>
                          </div>
                          <p className="text-slate-600">{d.rationale}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No decision logs recorded.</p>
                  )}
                </Card>

                {/* Plan Strengths & Considerations */}
                <Card
                  title="Evaluation Strengths & Disruption Considerations"
                  subtitle="Automated constraint assessment insights from planning evaluator."
                >
                  <div className="space-y-3 text-xs">
                    <div>
                      <h5 className="font-semibold text-emerald-800 flex items-center gap-1.5 mb-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Key Plan Strengths
                      </h5>
                      {generatedPlan.evaluation?.strengths && generatedPlan.evaluation.strengths.length > 0 ? (
                        <ul className="space-y-1 pl-5 list-disc text-slate-700">
                          {generatedPlan.evaluation.strengths.map((s, idx) => (
                            <li key={idx}>{s}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-slate-500 italic pl-5">Standard constraint satisfaction achieved.</p>
                      )}
                    </div>

                    {generatedPlan.evaluation?.penalties && generatedPlan.evaluation.penalties.length > 0 && (
                      <div className="pt-2 border-t border-slate-200">
                        <h5 className="font-semibold text-amber-800 flex items-center gap-1.5 mb-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          Operational Disruption Considerations
                        </h5>
                        <ul className="space-y-1 pl-5 list-disc text-slate-700">
                          {generatedPlan.evaluation.penalties.map((p, idx) => (
                            <li key={idx}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
