import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  XCircle,
  ShieldCheck,
  Bell,
  ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { DashboardAlertItem } from '../../types';
import { Badge, Button } from '../common';
import { formatTimestamp } from '../../utils';

export interface OperationalAlertsProps {
  alerts: DashboardAlertItem[];
}

export const OperationalAlerts: React.FC<OperationalAlertsProps> = ({ alerts }) => {
  const navigate = useNavigate();
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');

  const filteredAlerts = useMemo(() => {
    if (severityFilter === 'ALL') return alerts;
    return alerts.filter((a) => a.severity === severityFilter);
  }, [alerts, severityFilter]);

  const criticalCount = alerts.filter((a) => a.severity === 'CRITICAL').length;
  const warningCount = alerts.filter((a) => a.severity === 'WARNING').length;

  const handleAction = (alert: DashboardAlertItem) => {
    if (alert.entity_id?.startsWith('PLAN-')) {
      navigate(`/review/${alert.entity_id}`);
    } else if (alert.entity_id?.startsWith('REQ-')) {
      navigate('/requests');
    } else if (alert.corridor_id) {
      navigate('/corridors');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-[0_2px_12px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.05)] space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Operational Safety & Maintenance Alerts
            </h2>
            {/* <Badge
              variant={criticalCount > 0 ? 'red' : warningCount > 0 ? 'amber' : 'emerald'}
              statusText={`${alerts.length} Active`}
            /> */}
          </div>
          {/* <p className="text-sm text-slate-500 mt-0.5">
            Real-time constraint violations, overdue defect backlogs, and corridor restrictions.
          </p> */}
        </div>

        {/* Severity filter tabs */}
        <div className="flex items-center gap-1 text-sm">
          {['ALL', 'CRITICAL', 'WARNING'].map((sev) => {
            const count =
              sev === 'ALL'
                ? alerts.length
                : alerts.filter((a) => a.severity === sev).length;
            const isActive = severityFilter === sev;
            return (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${isActive
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                <span>{sev}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${isActive ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-600'
                    }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Zero Alerts Clean State */}
      {alerts.length === 0 ? (
        <div className="flex flex-col sm:flex-row items-center gap-4 p-5 bg-emerald-50/50 border border-emerald-200 rounded-xl">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="text-sm font-bold text-emerald-900">
              All Systems Operational — 0 Active Alerts
            </h3>
            <p className="text-sm text-emerald-700 leading-relaxed">
              No hard constraint violations or overdue critical requests detected. Corridors and asset windows operating within scheduled parameters.
            </p>
          </div>
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-400">
          No alerts matching severity filter '{severityFilter}'.
        </div>
      ) : (
        /* Alerts List */
        <div className="space-y-3">
          {filteredAlerts.map((alert, idx) => {
            const isCritical = alert.severity === 'CRITICAL';
            return (
              <div
                key={idx}
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${isCritical
                  ? 'bg-red-50/40 border-red-200 text-red-900 hover:bg-red-50/70'
                  : 'bg-amber-50/40 border-amber-200 text-amber-900 hover:bg-amber-50/70'
                  }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  {isCritical ? (
                    <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">
                        {alert.title}
                      </span>
                      <Badge
                        variant={isCritical ? 'red' : 'amber'}
                        statusText={alert.severity}
                      />
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                        {alert.alert_type}
                      </span>
                    </div>

                    <p className="text-sm text-slate-700 leading-relaxed">
                      {alert.message}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 font-mono pt-1">
                      {alert.entity_id && (
                        <span>
                          Entity: <strong className="text-slate-700">{alert.entity_id}</strong>
                        </span>
                      )}
                      {alert.corridor_id && (
                        <span>
                          Corridor: <strong className="text-slate-700">{alert.corridor_id}</strong>
                        </span>
                      )}
                      <span>{formatTimestamp(alert.created_at)}</span>
                    </div>
                  </div>
                </div>

                {alert.entity_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction(alert)}
                    rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
                    className="shrink-0 text-sm self-end sm:self-center"
                  >
                    View Source
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
