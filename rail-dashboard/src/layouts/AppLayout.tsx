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
  Radio,
  Clock,
  Train,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { dashboardService, type SystemHealth } from '../services';

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ size?: number }>;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, description: 'System overview & KPIs' },
  { name: 'Requests', path: '/requests', icon: Calendar, description: 'Departmental block requests' },
  { name: 'Assets', path: '/assets', icon: Layers, description: 'Track & OHE registry' },
  { name: 'Corridors', path: '/corridors', icon: MapPin, description: 'Operational windows' },
  { name: 'Block Planning', path: '/planning', icon: CalendarCheck2, description: 'AI-assisted generation' },
  { name: 'Plan Review', path: '/review', icon: FileCheck, description: 'Validation & approval' },
  { name: 'Monitoring', path: '/monitoring', icon: Activity, description: 'Live telemetry' },
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

  // const currentPage = NAV_ITEMS.find((n) =>
  //   n.path === '/dashboard'
  //     ? location.pathname === '/' || location.pathname === '/dashboard'
  //     : location.pathname.startsWith(n.path)
  // );

  return (
    <div className="app-shell">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className={`group shrink-0 h-[100dvh] bg-white dark:bg-gray-900 transition-[width] duration-500 ease-in-out overflow-hidden z-50 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] hover:w-[250px] ${sidebarOpen ? 'w-[250px]' : 'w-0 lg:w-[80px]'}`}>
        <div className="h-[68px] flex items-center px-5 gap-4 shrink-0">
          <div
            className="p-2 mt-2 w-[38px] h-[38px] shrink-0 rounded-full flex items-center justify-center shadow-md ring-2 ring-blue-50 dark:ring-blue-900/30"
            style={{ background: 'linear-gradient(145deg, #1e40af 0%, #3b82f6 100%)' }}
          >
            <Train size={20} color="#fff" strokeWidth={2.5} />
          </div>
          <div className={`whitespace-nowrap ${sidebarOpen ? 'block' : 'hidden lg:hidden'} group-hover:block mt-2`}>
            <div className="text-[14px] font-bold text-gray-900 dark:text-white tracking-wide">Indian Railways</div>
            <div className="text-[10px] font-medium text-blue-600 dark:text-blue-400 mt-[2px] uppercase tracking-wider">Block Planning</div>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 overflow-y-auto scrollbar-none flex flex-col gap-1.5 h-[calc(100vh-140px)]">
          <div className={`text-[9.5px] font-extrabold tracking-widest uppercase text-gray-400 px-3 pt-2 pb-2 whitespace-nowrap ${sidebarOpen ? 'block' : 'hidden lg:hidden'} group-hover:block`}>
            Operations
          </div>

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
                className={`${sidebarOpen && "flex"} items-center gap-5 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors duration-200 whitespace-nowrap relative ${isActive ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'}`}
              >
                <div className={`w-[32px] h-[32px] shrink-0 rounded-lg flex items-center justify-center transition-colors ${isActive ? 'bg-red-100/50 text-red-600 dark:bg-red-900/40 dark:text-red-400' : 'bg-gray-100/50 text-gray-500 dark:bg-gray-800/50 group-hover:bg-gray-200 dark:group-hover:bg-gray-700'}`}>
                  <Icon size={18} />
                </div>
                <div className={`flex-1 min-w-0 flex items-center ${sidebarOpen ? 'block' : 'hidden lg:hidden'} group-hover:block`}>
                  <div className={`leading-tight ${isActive ? 'font-semibold' : ''}`}>{item.name}</div>
                </div>
                {isActive && <div className="absolute left-[-2px] top-[10px] bottom-[10px] w-[3px] rounded-r-md bg-red-500" />}
              </NavLink>
            );
          })}

          <div className={`text-[9.5px] font-extrabold tracking-widest uppercase text-gray-400 px-3 pt-6 pb-2 whitespace-nowrap ${sidebarOpen ? 'block' : 'hidden lg:hidden'} group-hover:block`}>
            Planning
          </div>

          {NAV_ITEMS.slice(4).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={closeSidebarMobileOnly}
                className={`${sidebarOpen && "flex"} items-center gap-5 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors duration-200 whitespace-nowrap relative ${isActive ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'}`}
              >
                <div className={`w-[32px] h-[32px] shrink-0 rounded-lg flex items-center justify-center transition-colors ${isActive ? 'bg-red-100/50 text-red-600 dark:bg-red-900/40 dark:text-red-400' : 'bg-gray-100/50 text-gray-500 dark:bg-gray-800/50 group-hover:bg-gray-200 dark:group-hover:bg-gray-700'}`}>
                  <Icon size={18} />
                </div>
                <div className={`flex-1 min-w-0 flex items-center ${sidebarOpen ? 'block' : 'hidden lg:hidden'} group-hover:block`}>
                  <div className={`leading-tight ${isActive ? 'font-semibold' : ''}`}>{item.name}</div>
                </div>
                {isActive && <div className="absolute left-[-2px] top-[10px] bottom-[10px] w-[3px] rounded-r-md bg-red-500" />}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 shrink-0">
          <div className="flex items-center gap-4 p-2 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <div
              className="p-2 w-[34px] h-[34px] shrink-0 rounded-full flex items-center justify-center text-[12px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-gray-900"
              style={{ background: 'linear-gradient(135deg, #1e40af, #6366f1)' }}
            >
              OP
            </div>
            <div className={`flex-1 min-w-0 ${sidebarOpen ? 'block' : 'hidden lg:hidden'} group-hover:block`}>
              <div className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 leading-tight">Operations Officer</div>
              <div className="text-[11px] text-gray-500 mt-[2px]">Division HQ · Mumbai</div>
            </div>
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
              {sidebarOpen ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
            </button>
            {/* <div>
              <div className="header-page-title">
                {currentPage?.name ?? 'Railway Block Planning'}
              </div>
              <div className="header-page-sub">
                {currentPage?.description ?? 'AI-Powered Automatic Block Planning System'}
              </div>
            </div> */}
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
