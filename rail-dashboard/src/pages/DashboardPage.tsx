import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Wrench, CalendarCheck, AlertTriangle, Radio, Clock, Activity, CheckCircle2 } from 'lucide-react';
import { dashboardService } from '../services';
import type {
  DashboardSummary,
  DashboardPlanningKpis,
  DashboardCorridor,
  DashboardAlertItem,
  DashboardActivityItem,
} from '../types';
import { Button, Card, Badge, Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell, ErrorState, EmptyState } from '../components/common';
import { KpiCard } from '../components/dashboard/KpiCard';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [kpis, setKpis] = useState<DashboardPlanningKpis | null>(null);
  const [corridors, setCorridors] = useState<DashboardCorridor[]>([]);
  const [alerts, setAlerts] = useState<DashboardAlertItem[]>([]);
  const [activity, setActivity] = useState<DashboardActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [summaryRes, kpisRes, corridorsRes, alertsRes, activityRes] =
        await Promise.allSettled([
          dashboardService.getSummary(),
          dashboardService.getPlanningKpis(),
          dashboardService.getCorridors(),
          dashboardService.getAlerts(),
          dashboardService.getRecentActivity(8),
        ]);
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value);
      else throw new Error(summaryRes.reason?.message || 'Failed to load summary');
      if (kpisRes.status === 'fulfilled') setKpis(kpisRes.value);
      if (corridorsRes.status === 'fulfilled') setCorridors(corridorsRes.value);
      if (alertsRes.status === 'fulfilled') setAlerts(alertsRes.value);
      if (activityRes.status === 'fulfilled') setActivity(activityRes.value);
      setLastRefreshed(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    } catch (err: any) {
      setError(err?.message || 'Failed to communicate with the railway planning backend service.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboardData(); }, [loadDashboardData]);

  const scheduledPct = summary && summary.total_requests > 0
    ? (summary.scheduled_requests / summary.total_requests) * 100 : 0;
  const pendingPct = summary && summary.total_requests > 0
    ? (summary.pending_requests / summary.total_requests) * 100 : 0;

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard__header">
        <div className="dashboard__title-group">
          <div className="dashboard__title-row">
            <h1 className="dashboard__title">Operations Control</h1>
          </div>
        </div>
        <div className="dashboard__refresh">
          {lastRefreshed && (
            <span className="dashboard__refresh-time">Refreshed: {lastRefreshed} IST</span>
          )}
          <Button variant="outline" size="sm" onClick={loadDashboardData} isLoading={isLoading} leftIcon={<RefreshCw size={14} />}>
            Refresh Telemetry
          </Button>
        </div>
      </div>

      {error && !summary && <ErrorState title="Telemetry Feed Offline" message={error} onRetry={loadDashboardData} />}

      {/* KPI Grid */}
      <div className="dashboard__kpi-grid">
        <KpiCard
          title="Maintenance Requests"
          value={summary?.total_requests}
          unit="total"
          variant="blue"
          icon={<Wrench size={18} />}
          isLoading={isLoading}
          error={error && !summary ? error : null}
          onClick={() => navigate('/requests')}
          subtitle={summary ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span style={{ color: '#92400e', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{summary.pending_requests} Pending</span>
              <span style={{ color: 'var(--border-default)' }}>•</span>
              <span style={{ color: '#065f46', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{summary.scheduled_requests} Scheduled</span>
            </div>
          ) : null}
        />
        <KpiCard
          title="Active Corridors"
          value={summary?.active_corridors}
          unit={summary ? `of ${summary.total_corridors}` : ''}
          variant="emerald"
          icon={<Radio size={18} />}
          isLoading={isLoading}
          error={error && !summary ? error : null}
          onClick={() => navigate('/corridors')}
          subtitle={kpis ? <span>Corridor Utilization: {kpis.corridor_utilization_pct}%</span>
            : summary ? <span>{summary.total_trains} scheduled trains tracked</span> : null}
        />
        <KpiCard
          title="Generated Block Plans"
          value={summary?.total_plans}
          unit="plans"
          variant="purple"
          icon={<CalendarCheck size={18} />}
          isLoading={isLoading}
          error={error && !summary ? error : null}
          subtitle={summary ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span style={{ color: 'var(--blue)', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{summary.draft_plans} Draft</span>
              <span style={{ color: 'var(--border-default)' }}>•</span>
              <span style={{ color: '#065f46', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{summary.approved_plans} Approved</span>
            </div>
          ) : null}
        />
        <KpiCard
          title="Critical & Overdue"
          value={summary ? summary.critical_priority_requests + summary.overdue_requests : null}
          unit="attention"
          variant={summary && summary.critical_priority_requests > 0 ? 'red' : 'amber'}
          icon={<AlertTriangle size={18} />}
          isLoading={isLoading}
          error={error && !summary ? error : null}
          onClick={() => navigate('/requests')}
          subtitle={summary ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span style={{ color: '#991b1b', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{summary.critical_priority_requests} Critical</span>
              <span style={{ color: 'var(--border-default)' }}>•</span>
              <span style={{ color: '#92400e', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{summary.overdue_requests} Overdue</span>
            </div>
          ) : null}
        />
      </div>

      {/* Middle grid */}
      <div className="dashboard__mid-grid">
        <Card title="Maintenance Workload & Scheduling">
          {summary ? (
            <div>
              <div className="workload__progress-bar">
                <div className="workload__progress-labels">
                  <span style={{ color: 'var(--text-tertiary)' }}>Scheduling Progress</span>
                  <span className="workload__progress-pct">{Math.round(scheduledPct)}%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill progress-fill--emerald" style={{ width: `${scheduledPct}%` }} title={`Scheduled: ${summary.scheduled_requests}`} />
                  <div className="progress-fill progress-fill--amber" style={{ width: `${pendingPct}%` }} title={`Pending: ${summary.pending_requests}`} />
                </div>
                <div className="workload__legend">
                  <div className="workload__legend-item">
                    <span className="legend-dot" style={{ background: 'var(--emerald)' }} />
                    Scheduled ({summary.scheduled_requests})
                  </div>
                  <div className="workload__legend-item">
                    <span className="legend-dot" style={{ background: '#f59e0b' }} />
                    Pending ({summary.pending_requests})
                  </div>
                  <div className="workload__legend-item">
                    <span className="legend-dot" style={{ background: 'var(--border-default)' }} />
                    Completed ({summary.completed_requests})
                  </div>
                </div>
              </div>
              <div className="workload__metrics">
                {[
                  { label: 'Duration Scheduled', value: kpis ? `${kpis.total_scheduled_duration_minutes}m` : '—', sub: kpis ? `${(kpis.total_scheduled_duration_minutes / 60).toFixed(1)} hours` : '0h' },
                  { label: 'Plan Feasibility', value: kpis ? `${kpis.feasible_plan_percentage}%` : '—', sub: `${summary.feasible_plans} feasible plans` },
                  { label: 'Hard Conflicts', value: kpis ? String(kpis.total_conflicts) : '0', sub: `${summary.infeasible_plans} infeasible plans`, alert: kpis && kpis.total_conflicts > 0 },
                  { label: 'Asset Utilization', value: kpis ? `${kpis.asset_utilization_pct}%` : '0%', sub: `${summary.total_assets - summary.assets_unavailable} available` },
                ].map((m) => (
                  <div key={m.label} className="workload__metric">
                    <div className="workload__metric-label">{m.label}</div>
                    <div className={`workload__metric-value ${(m as any).alert ? 'workload__metric-value--alert' : ''}`}>{m.value}</div>
                    <div className="workload__metric-sub">{m.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Operational metrics unavailable</div>
          )}
        </Card>

        <Card title="Plan Approval Pipeline">
          {summary ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                { label: 'DRAFT Plans', count: summary.draft_plans, color: 'var(--blue)' },
                { label: 'Under Review', count: summary.under_review_plans, color: '#f59e0b' },
                { label: 'Approved', count: summary.approved_plans, color: 'var(--emerald)' },
                { label: 'Rejected', count: summary.rejected_plans, color: 'var(--red)' },
              ].map((row) => (
                <div key={row.label} className="pipeline__row">
                  <div className="pipeline__label">
                    <span className="pipeline__dot" style={{ background: row.color }} />
                    {row.label}
                  </div>
                  <span className="pipeline__count">{row.count}</span>
                </div>
              ))}
              <div className="pipeline__avg-score">
                <span>Average Plan Score</span>
                <span className="pipeline__avg-score-value">
                  {kpis?.average_plan_score != null ? `${kpis.average_plan_score}%` : '—'}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Pipeline status unavailable</div>
          )}
        </Card>
      </div>

      {/* Corridor Table */}
      <Card title="Track Corridor Operational Status">
        {corridors.length === 0 ? (
          <EmptyState title="No Corridors Registered" message="There are currently no corridors in the database." />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Corridor ID</TableHeaderCell>
                <TableHeaderCell>Corridor Name</TableHeaderCell>
                <TableHeaderCell>Length</TableHeaderCell>
                <TableHeaderCell>Traction</TableHeaderCell>
                <TableHeaderCell>Operating Window</TableHeaderCell>
                <TableHeaderCell>Parallel Capacity</TableHeaderCell>
                <TableHeaderCell>Scheduled Blocks</TableHeaderCell>
                <TableHeaderCell>Timetable Trains</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {corridors.map((c) => (
                <TableRow
                  key={c.corridor_id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/corridors?corridorId=${c.corridor_id}`)}
                >
                  <TableCell><span className="mono-id">{c.corridor_id}</span></TableCell>
                  <TableCell style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</TableCell>
                  <TableCell>{c.length_km} km</TableCell>
                  <TableCell>
                    <Badge variant={c.is_electrified ? 'emerald' : 'slate'} statusText={c.is_electrified ? '25kV OHE' : 'DIESEL'} />
                  </TableCell>
                  <TableCell className="mono" style={{ fontSize: 12.5 }}>
                    {String(Math.floor(c.available_start_minute / 60)).padStart(2, '0')}:00 –{' '}
                    {String(Math.floor(c.available_end_minute / 60)).padStart(2, '0')}:00
                  </TableCell>
                  <TableCell>{c.max_parallel_blocks} blocks</TableCell>
                  <TableCell><span className="mono" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.scheduled_blocks_count}</span></TableCell>
                  <TableCell><span className="mono" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.trains_count}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Bottom Grid */}
      <div className="dashboard__bottom-grid">
        <Card title="Operational Attention & Alerts">
          {alerts.length === 0 ? (
            <div className="alert-empty">
              <CheckCircle2 size={36} style={{ color: 'var(--emerald)' }} />
              <p className="alert-empty__title">All Corridors Clear</p>
              <p className="alert-empty__sub">No active hard constraint violations or overdue critical requests detected.</p>
            </div>
          ) : (
            <div className="alert-list">
              {alerts.map((a, idx) => (
                <div
                  key={`${a.entity_id}-${idx}`}
                  className={`alert ${a.severity === 'CRITICAL' ? 'alert--critical' : 'alert--warning'}`}
                >
                  <AlertTriangle size={16} className="alert__icon" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <span className="alert__title">{a.title}</span>
                      <span style={{ fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', opacity: 0.75 }}>{a.corridor_id || 'System'}</span>
                    </div>
                    <p className="alert__msg">{a.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Recent Operational Activity">
          {activity.length === 0 ? (
            <div className="activity-empty">
              <Activity size={36} style={{ color: 'var(--text-muted)' }} />
              <p className="alert-empty__title">No Activity Recorded</p>
              <p className="alert-empty__sub">Activity events will automatically appear as plans and requests are processed.</p>
            </div>
          ) : (
            <div className="activity-feed">
              {activity.map((act, idx) => (
                <div key={`${act.entity_id}-${idx}`} className="activity-item">
                  <div className="activity-item__icon">
                    <Clock size={14} />
                  </div>
                  <div className="activity-item__body">
                    <div className="activity-item__title-row">
                      <span className="activity-item__title">{act.title}</span>
                      <span className="activity-item__time">
                        {new Date(act.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="activity-item__desc">{act.description}</p>
                    <div className="activity-item__actor">
                      By: <strong>{act.actor || 'System'}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
