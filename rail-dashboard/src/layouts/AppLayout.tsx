import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  Layers,
  MapPin,
  CalendarCheck2,
  FileCheck,
  Activity,
  Menu,
  X,
  Radio,
  Clock,
  Train,
  ChevronRight,
} from 'lucide-react';
import { dashboardService, type SystemHealth } from '../services';

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ size?: number }>;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard',              path: '/dashboard', icon: LayoutDashboard, description: 'System overview & KPIs' },
  { name: 'Maintenance Requests',   path: '/requests',  icon: Calendar,        description: 'Departmental block requests' },
  { name: 'Infrastructure Assets',  path: '/assets',    icon: Layers,          description: 'Track & OHE registry' },
  { name: 'Corridors & Availability', path: '/corridors', icon: MapPin,        description: 'Operational windows' },
  { name: 'Block Planning',         path: '/planning',  icon: CalendarCheck2,  description: 'AI-assisted generation' },
  { name: 'Plan Review',            path: '/review',    icon: FileCheck,       description: 'Validation & approval' },
  { name: 'Monitoring',             path: '/monitoring',icon: Activity,        description: 'Live telemetry' },
];

export const AppLayout: React.FC = () => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const closeSidebarMobileOnly = () => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };
  const [currentTime, setCurrentTime] = useState('');
  const [health, setHealth] = useState<SystemHealth | null>(null);

  useEffect(() => {
    const tick = () =>
      setCurrentTime(
        new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }) + ' IST'
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    dashboardService.getHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  const currentPage = NAV_ITEMS.find((n) =>
    n.path === '/dashboard'
      ? location.pathname === '/' || location.pathname === '/dashboard'
      : location.pathname.startsWith(n.path)
  );

  return (
    <div className="app-shell">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className={`sidebar ${sidebarOpen ? '' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo-mark">
            <Train size={18} color="#fff" />
          </div>
          <div>
            <div className="sidebar-logo-title">Indian Railways</div>
            <div className="sidebar-logo-sub">RPB · Block Planning System</div>
          </div>
        </div>

        <div className="sidebar-env">⚡ Hackathon Demo</div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Operations</div>

          {NAV_ITEMS.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === '/dashboard'
                ? location.pathname === '/' || location.pathname === '/dashboard'
                : location.pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={closeSidebarMobileOnly}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <div className="nav-icon-wrap">
                  <Icon size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nav-label">{item.name}</div>
                  <div className="nav-desc">{item.description}</div>
                </div>
              </NavLink>
            );
          })}

          <div className="nav-section-label">Planning</div>

          {NAV_ITEMS.slice(4).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={closeSidebarMobileOnly}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <div className="nav-icon-wrap">
                  <Icon size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nav-label">{item.name}</div>
                  <div className="nav-desc">{item.description}</div>
                </div>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">OP</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name">Operations Officer</div>
              <div className="user-role">Division HQ · Mumbai</div>
            </div>
            <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="mobile-overlay"
          style={{ display: window.innerWidth < 1024 ? undefined : 'none' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main area ───────────────────────────────────────── */}
      <div className="main-area">
        <header className="top-header">
          <div className="header-left">
            <button
              type="button"
              className="menu-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle navigation"
            >
              {sidebarOpen ? <X size={17} /> : <Menu size={17} />}
            </button>
            <div>
              <div className="header-page-title">
                {currentPage?.name ?? 'Railway Block Planning'}
              </div>
              <div className="header-page-sub">
                {currentPage?.description ?? 'AI-Powered Automatic Block Planning System'}
              </div>
            </div>
          </div>

          <div className="header-right">
            <div className="header-chip mono" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={12} style={{ opacity: 0.55 }} />
              {currentTime}
            </div>
            <div className={`header-chip ${health?.status === 'healthy' ? 'online' : ''}`}>
              {health?.status === 'healthy' ? (
                <>
                  <span className="live-dot" />
                  Engine Online
                </>
              ) : (
                <>
                  <Radio size={12} style={{ opacity: 0.55 }} />
                  Connecting…
                </>
              )}
            </div>
          </div>
        </header>

        <div className="page-scroll">
          <Outlet />
        </div>
      </div>
    </div>
  );
};
