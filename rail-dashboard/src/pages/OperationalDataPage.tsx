import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, Layers, MapPin } from 'lucide-react';
import { MaintenanceRequestsPage } from './MaintenanceRequestsPage';
import { AssetsPage } from './AssetsPage';
import { CorridorsPage } from './CorridorsPage';

export const OperationalDataPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'requests';

  const handleTabChange = (tabKey: string) => {
    searchParams.set('tab', tabKey);
    setSearchParams(searchParams);
  };

  return (
    <div className="space-y-6">
      {/* Top Tab Bar */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => handleTabChange('requests')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 -mb-px ${
            activeTab === 'requests'
              ? 'text-blue-600 border-blue-600 bg-blue-50/50'
              : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-50'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Maintenance Requests</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('assets')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 -mb-px ${
            activeTab === 'assets'
              ? 'text-blue-600 border-blue-600 bg-blue-50/50'
              : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Infrastructure Assets</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('corridors')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 -mb-px ${
            activeTab === 'corridors'
              ? 'text-blue-600 border-blue-600 bg-blue-50/50'
              : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-50'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Corridors & Availability</span>
        </button>
      </div>

      {/* Active Tab View */}
      {activeTab === 'assets' ? (
        <AssetsPage />
      ) : activeTab === 'corridors' ? (
        <CorridorsPage />
      ) : (
        <MaintenanceRequestsPage />
      )}
    </div>
  );
};
