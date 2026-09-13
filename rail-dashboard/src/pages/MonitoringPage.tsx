import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Activity } from 'lucide-react';
import {
  dashboardService,
  operationalService,
  planningService,
  type SystemHealth,
} from '../services';
import type {
  DashboardSummary,
  DashboardPlanningKpis,
  CorridorAvailability,
  DashboardAlertItem,
  DashboardActivityItem,
  BlockPlan,
} from '../types';
import { Button, LoadingState, ErrorState, Badge } from '../components/common';
import {
  LiveTelemetryGauges,
  AiPlanningInsights,
  OperationalAlerts,
  CorridorStatusGrid,
} from '../components/monitoring';
import { formatTimestamp } from '../utils';

export const MonitoringPage: React.FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [kpis, setKpis] = useState<DashboardPlanningKpis | null>(null);
  const [availability, setAvailability] = useState<CorridorAvailability[]>([]);
  const [alerts, setAlerts] = useState<DashboardAlertItem[]>([]);
  const [activities, setActivities] = useState<DashboardActivityItem[]>([]);
  const [latestPlan, setLatestPlan] = useState<BlockPlan | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const loadMonitoringData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [healthRes, summaryRes, kpisRes, availRes, alertsRes, activityRes, plansRes] =
        await Promise.allSettled([
          dashboardService.getHealth(),
          dashboardService.getSummary(),
          dashboardService.getPlanningKpis(),
          operationalService.getAvailability(),
          dashboardService.getAlerts(),
          dashboardService.getRecentActivity(8),
          planningService.getPlans(),
        ]);
      if (healthRes.status === 'fulfilled') setHealth(healthRes.value);
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value);
      if (kpisRes.status === 'fulfilled') setKpis(kpisRes.value);
      if (availRes.status === 'fulfilled') setAvailability(availRes.value);
      if (alertsRes.status === 'fulfilled') setAlerts(alertsRes.value);
      if (activityRes.status === 'fulfilled') setActivities(activityRes.value);
      if (plansRes.status === 'fulfilled' && plansRes.value.length > 0) setLatestPlan(plansRes.value[0]);
      setLastRefreshed(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    } catch (err: any) {
      setError(err?.message || 'Failed to load live monitoring feeds.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadMonitoringData(); }, [loadMonitoringData]);

  return (
    <div className="ops-page">
      <div className="ops-header">
        <div className="ops-header__info">
          <div className="ops-header__title-row">
            <h1 className="ops-header__title">Operational Monitoring &amp; AI Insights</h1>
          </div>
        </div>
        <div className="ops-header__actions">
          <Button variant="outline" size="sm" onClick={loadMonitoringData} isLoading={isLoading} leftIcon={<RefreshCw size={14} />}>
            Refresh Feeds
          </Button>
        </div>
      </div>

      {isLoading && !summary ? (
        <LoadingState message="Connecting to live monitoring feeds and telemetry..." />
      ) : error && !summary ? (
        <ErrorState title="Telemetry Feed Offline" message={error} onRetry={loadMonitoringData} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <LiveTelemetryGauges health={health} summary={summary} kpis={kpis} />
          <OperationalAlerts alerts={alerts} />
          <AiPlanningInsights latestPlan={latestPlan} />
          <CorridorStatusGrid corridors={availability} />

          {activities.length > 0 && (
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Activity size={16} style={{ color: 'var(--blue)' }} />
                  <h2 className="card-title">Live Operational Activity Stream</h2>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{activities.length} recent events</span>
              </div>
              <div className="card-body--no-padding" style={{ padding: '0 24px' }}>
                {activities.map((act, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '13px 0',
                      borderBottom: idx < activities.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>{act.title}</span>
                      <span style={{ color: 'var(--text-muted)', fontFamily: 'inherit' }}>{act.description}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', flexShrink: 0, fontSize: 11 }}>
                      {act.actor && <span>Actor: {act.actor}</span>}
                      <span>{formatTimestamp(act.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
