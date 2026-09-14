import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle, CheckCircle, BrainCircuit, Activity as ActivityIcon, Code, Zap, Plus, Trash2 } from 'lucide-react';
import apiClient from '../services/apiClient';

interface AssetOperationalLog {
  asset_id: string;
  corridor_id: string;
  department: string;
  last_overhaul_date: string;
  operating_hours: number;
  gross_million_tonnes: number;
  recorded_fault_count: number;
  vibration_index: number | null;
}

const defaultAssetLogs: AssetOperationalLog[] = [
  {
    asset_id: "OHE-TRK-102",
    corridor_id: "CORR-MUM-DEL",
    department: "Traction Distribution",
    last_overhaul_date: "2023-01-15",
    operating_hours: 4500,
    gross_million_tonnes: 26.5,
    recorded_fault_count: 4,
    vibration_index: 0.85
  }
];

const defaultDataset = {
  corridors: [
    {
      corridor_id: "CORR-MUM-DEL",
      name: "Mumbai-Delhi Main",
      length_km: 1384.0,
      is_electrified: true,
      available_start_minute: 0,
      available_end_minute: 1440,
      max_parallel_blocks: 2
    }
  ],
  assets: [
    {
      asset_id: "OHE-TRK-102",
      corridor_id: "CORR-MUM-DEL",
      department: "Traction Distribution",
      start_km: 45.0,
      end_km: 55.0,
      track_type: "BOTH"
    }
  ],
  defects: [],
  trains: [],
  block_requests: [],
  constraints: {
    min_headway_minutes: 15,
    max_concurrent_blocks_per_corridor: 2,
    allow_joint_department_blocks: true,
    power_cutoff_buffer_minutes: 15
  }
};

export const TrainAIPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'advisories' | 'optimize'>('advisories');
  const [codeTab, setCodeTab] = useState<'logs' | 'dataset'>('logs');

  useEffect(() => {
    if (activeTab === 'advisories') setCodeTab('logs');
  }, [activeTab]);
  const [assetLogs, setAssetLogs] = useState<AssetOperationalLog[]>(defaultAssetLogs);
  const [datasetInput, setDatasetInput] = useState(JSON.stringify(defaultDataset, null, 2));
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advisoryResult, setAdvisoryResult] = useState<any>(null);
  const [optimizeResult, setOptimizeResult] = useState<any>(null);

  const handleLogChange = (index: number, field: keyof AssetOperationalLog, value: any) => {
    const newLogs = [...assetLogs];
    newLogs[index] = { ...newLogs[index], [field]: value };
    setAssetLogs(newLogs);
  };

  const addLog = () => {
    setAssetLogs([...assetLogs, {
      asset_id: `OHE-${Math.floor(Math.random() * 1000)}`,
      corridor_id: "CORR-MUM-DEL",
      department: "Traction Distribution",
      last_overhaul_date: new Date().toISOString().split('T')[0],
      operating_hours: 0,
      gross_million_tonnes: 0,
      recorded_fault_count: 0,
      vibration_index: 0
    }]);
  };

  const removeLog = (index: number) => {
    setAssetLogs(assetLogs.filter((_, i) => i !== index));
  };

  const fetchAdvisories = async () => {
    setLoading(true);
    setError(null);
    setAdvisoryResult(null);
    try {
      const res = await apiClient.post('/api/v1/predictive/advisories', assetLogs);
      setAdvisoryResult(res.data);
    } catch (err: any) {
      setError(err.message || 'Invalid JSON or API error');
    } finally {
      setLoading(false);
    }
  };

  const runOptimization = async () => {
    setLoading(true);
    setError(null);
    setOptimizeResult(null);
    try {
      const parsedDataset = JSON.parse(datasetInput);
      const payload = {
        dataset: parsedDataset,
        asset_logs: assetLogs
      };
      const res = await apiClient.post('/api/v1/predictive/optimize', payload);
      setOptimizeResult(res.data);
    } catch (err: any) {
      setError(err.message || 'Invalid JSON or API error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 w-full max-w-[1600px] mx-auto min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 flex items-center gap-3">
          <BrainCircuit className="text-blue-600 dark:text-blue-400" size={32} />
          Predictive Maintenance Engine
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2 text-lg">
          Simulate operational telemetry to synthesize maintenance advisories and optimize scheduling.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-8">
        <div className="inline-flex gap-1.5 bg-gray-100 dark:bg-gray-800/80 p-1.5 rounded-2xl shadow-inner">
          <button
            onClick={() => setActiveTab('advisories')}
            className={`px-6 py-2.5 font-bold text-sm transition-all duration-300 rounded-xl flex items-center gap-2 ${
              activeTab === 'advisories'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-gray-700/50'
            }`}
          >
            <ActivityIcon size={16}/> Advisories Analysis
          </button>
          <button
            onClick={() => setActiveTab('optimize')}
            className={`px-6 py-2.5 font-bold text-sm transition-all duration-300 rounded-xl flex items-center gap-2 ${
              activeTab === 'optimize'
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-gray-700/50'
            }`}
          >
            <Zap size={16}/> Predictive Optimization
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Left Column: Inputs */}
        <div className="flex flex-col gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-6 flex flex-col min-h-[500px]">
            {/* Header: Tabs & Submit Button */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4">
              <div className="flex items-center gap-6 w-full sm:w-auto flex-1">
                <button
                  onClick={() => setCodeTab('logs')}
                  className={`pb-2 px-1 text-sm font-bold transition-all border-b-2 -mb-px flex items-center gap-2 ${
                    codeTab === 'logs'
                      ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  <Code size={16} /> Asset Logs
                </button>
                {activeTab === 'optimize' && (
                  <button
                    onClick={() => setCodeTab('dataset')}
                    className={`pb-2 px-1 text-sm font-bold transition-all border-b-2 -mb-px flex items-center gap-2 ${
                      codeTab === 'dataset'
                        ? 'border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    <Code size={16} /> Railway Dataset
                  </button>
                )}
              </div>
              
              {/* Submit Button */}
              <div className="shrink-0 mb-1 sm:mb-0">
                {activeTab === 'advisories' ? (
                  <button
                    onClick={fetchAdvisories}
                    disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-all shadow hover:shadow-md flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {loading ? <><Activity className="animate-spin" size={16} /> Analyzing...</> : 'Fetch Advisories'}
                  </button>
                ) : (
                  <button
                    onClick={runOptimization}
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-lg transition-all shadow hover:shadow-md flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {loading ? <><Activity className="animate-spin" size={16} /> Optimizing...</> : 'Run Optimization'}
                  </button>
                )}
              </div>
            </div>

            {/* Editor Area */}
            {codeTab === 'logs' ? (
              <div className="flex-1 min-h-[400px] max-h-[600px] overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Operational Logs ({assetLogs.length})</h3>
                  <button onClick={addLog} className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 px-3 py-1.5 rounded-lg transition-colors">
                    <Plus size={14} /> Add Log
                  </button>
                </div>
                <div className="space-y-4">
                  {assetLogs.map((log, i) => (
                    <div key={i} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm relative group animate-in fade-in zoom-in-95 duration-200">
                      <button onClick={() => removeLog(i)} className="absolute top-3 right-3 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title="Remove Log">
                        <Trash2 size={16} />
                      </button>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Asset ID</label>
                          <input type="text" value={log.asset_id} onChange={(e) => handleLogChange(i, 'asset_id', e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 text-sm p-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Corridor</label>
                          <input type="text" value={log.corridor_id} onChange={(e) => handleLogChange(i, 'corridor_id', e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 text-sm p-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Department</label>
                          <input type="text" value={log.department} onChange={(e) => handleLogChange(i, 'department', e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 text-sm p-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Overhaul Date</label>
                          <input type="date" value={log.last_overhaul_date} onChange={(e) => handleLogChange(i, 'last_overhaul_date', e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 text-sm p-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Op. Hours</label>
                          <input type="number" value={log.operating_hours} onChange={(e) => handleLogChange(i, 'operating_hours', Number(e.target.value))} className="w-full bg-gray-50 dark:bg-gray-900 text-sm p-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">GMT</label>
                          <input type="number" step="0.1" value={log.gross_million_tonnes} onChange={(e) => handleLogChange(i, 'gross_million_tonnes', Number(e.target.value))} className="w-full bg-gray-50 dark:bg-gray-900 text-sm p-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Fault Count</label>
                          <input type="number" value={log.recorded_fault_count} onChange={(e) => handleLogChange(i, 'recorded_fault_count', Number(e.target.value))} className="w-full bg-gray-50 dark:bg-gray-900 text-sm p-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Vibration Idx</label>
                          <input type="number" step="0.01" value={log.vibration_index || ''} onChange={(e) => handleLogChange(i, 'vibration_index', e.target.value ? Number(e.target.value) : null)} className="w-full bg-gray-50 dark:bg-gray-900 text-sm p-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100" />
                        </div>
                      </div>
                    </div>
                  ))}
                  {assetLogs.length === 0 && (
                    <div className="text-center py-8 text-gray-500">No logs added.</div>
                  )}
                </div>
              </div>
            ) : (
              <textarea
                value={datasetInput}
                onChange={(e) => setDatasetInput(e.target.value)}
                className="w-full flex-1 min-h-[400px] p-4 rounded-xl bg-gray-50 dark:bg-gray-900 font-mono text-sm text-gray-800 dark:text-gray-300 focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                spellCheck={false}
              />
            )}
          </div>
        </div>

        {/* Right Column: Results */}
        <div className="flex flex-col gap-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 text-red-700 dark:text-red-400 p-4 rounded-r-xl flex items-start gap-3 animate-in fade-in">
              <AlertTriangle className="shrink-0 mt-0.5" size={20} />
              <div>
                <h4 className="font-semibold">Error Executing Engine</h4>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {activeTab === 'advisories' && advisoryResult && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl shadow-blue-900/5 overflow-hidden animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Advisory Report</h2>
                  <span className="bg-white dark:bg-gray-800 px-3 py-1 rounded-full text-xs font-semibold text-gray-600 dark:text-gray-300 shadow-sm">
                    {advisoryResult.generated_at ? new Date(advisoryResult.generated_at).toLocaleTimeString() : ''}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-6">
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Evaluated</p>
                    <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">{advisoryResult.total_assets_evaluated}</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl shadow-sm">
                    <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">High Risk</p>
                    <p className="text-2xl font-black text-red-700 dark:text-red-400 mt-1">{advisoryResult.high_risk_count}</p>
                  </div>
                </div>
              </div>
              
              <div className="p-6">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4">Generated Advisories</h3>
                {advisoryResult.advisories?.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">No advisories generated. Assets are healthy.</p>
                ) : (
                  <div className="space-y-4">
                    {advisoryResult.advisories?.map((adv: any, i: number) => (
                      <div key={i} className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">{adv.asset_id}</span>
                            <span className="text-xs text-gray-500 ml-2">{adv.department}</span>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            adv.urgency === 'CRITICAL' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' :
                            adv.urgency === 'HIGH' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' :
                            'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                          }`}>
                            {adv.urgency}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm">
                          {adv.trigger_rule}
                        </p>
                        <div className="flex justify-between items-center mt-3 text-xs text-gray-500">
                          <span>Risk Score: <strong className="text-gray-900 dark:text-white">{adv.risk_score}</strong>/100</span>
                          <span>Est. Duration: <strong className="text-gray-900 dark:text-white">{adv.estimated_duration_minutes}m</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'optimize' && optimizeResult && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl shadow-indigo-900/5 overflow-hidden animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-6">
                <div className="flex items-center gap-3">
                  {optimizeResult.is_feasible ? (
                    <CheckCircle className="text-green-500" size={28} />
                  ) : (
                    <AlertTriangle className="text-orange-500" size={28} />
                  )}
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Optimization Result</h2>
                    <p className="text-sm font-medium text-gray-500">Plan ID: <span className="font-mono">{optimizeResult.plan_id}</span></p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Feasible</p>
                    <p className={`text-lg font-bold mt-1 ${optimizeResult.is_feasible ? 'text-green-600' : 'text-orange-600'}`}>
                      {optimizeResult.is_feasible ? 'YES' : 'NO'}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Blocks Scheduled</p>
                    <p className="text-lg font-bold mt-1 text-gray-900 dark:text-white">{optimizeResult.plan?.length || 0}</p>
                  </div>
                </div>

                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">Scheduled Blocks</h3>
                {optimizeResult.plan?.length === 0 ? (
                  <p className="text-sm text-gray-500 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl">No blocks scheduled.</p>
                ) : (
                  <div className="space-y-3">
                    {optimizeResult.plan?.map((block: any, i: number) => (
                      <div key={i} className="flex flex-col gap-2 p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>
                        <div className="flex justify-between items-center pl-2">
                          <span className="font-mono text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-2 py-0.5 rounded">
                            {block.request_id}
                          </span>
                          <span className="text-xs font-medium text-gray-500">{block.department}</span>
                        </div>
                        <div className="flex justify-between items-end pl-2 mt-1">
                          <div>
                            <p className="text-xs text-gray-500">Asset: <span className="font-mono font-medium text-gray-800 dark:text-gray-200">{block.asset_id}</span></p>
                            <p className="text-xs text-gray-500">Time: <span className="font-medium text-gray-900 dark:text-white">{block.scheduled_start_minute}m - {block.scheduled_end_minute}m</span></p>
                          </div>
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded-lg">
                            {block.allocated_duration_minutes}m
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {optimizeResult.evaluation && (
                  <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-sm text-gray-500">Total Delay Minutes: <span className="font-bold text-gray-900 dark:text-white">{optimizeResult.evaluation.total_delay_minutes}</span></p>
                    <p className="text-sm text-gray-500">Overall Score: <span className="font-bold text-gray-900 dark:text-white">{(optimizeResult.evaluation.overall_score).toFixed(2)}</span></p>
                  </div>
                )}
              </div>
            </div>
          )}

          {!advisoryResult && !optimizeResult && !error && (
             <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center h-[500px]">
               <BrainCircuit className="text-gray-400 mb-4" size={56} />
               <h3 className="text-xl font-medium text-gray-700 dark:text-gray-300">Ready to Analyze</h3>
               <p className="text-gray-500 mt-2 max-w-sm">Submit JSON payloads on the left to invoke the production AI engines.</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};
