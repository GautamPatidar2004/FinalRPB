import React, { useState } from 'react';
import { ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import type { PredictionExplanationResponse } from '../../types';

export interface ShapAttributionCardProps {
  prediction?: PredictionExplanationResponse | null;
  className?: string;
}

export const ShapAttributionCard: React.FC<ShapAttributionCardProps> = ({
  prediction,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [selectedAspect, setSelectedAspect] = useState<string>('ALL');

  if (!prediction) {
    return (
      <div className={`p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-[13px] italic ${className}`}>
        No SHAP attribution data available for this request.
      </div>
    );
  }

  const {
    predicted_score,
    predicted_category,
    explanation_method,
    base_value,
    feature_contributions = [],
    aspects = {},
  } = prediction;

  // Max contribution magnitude for proportional bar scaling
  const maxAbsContrib = Math.max(
    ...feature_contributions.map((f) => Math.abs(f.contribution)),
    0.01
  );

  // Filter features if aspect selected
  const displayedFeatures =
    selectedAspect === 'ALL'
      ? feature_contributions
      : aspects[selectedAspect]?.features || [];

  const visibleCount = isExpanded ? displayedFeatures.length : Math.min(5, displayedFeatures.length);

  return (
    <div className={`p-4 bg-white border border-slate-200 rounded-xl space-y-4 shadow-xs ${className}`}>
      {/* Prediction Summary Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
            AI Model Prediction & Confidence
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xl font-bold font-mono text-slate-900">
              {(predicted_score * 100).toFixed(1)}%
            </span>
            <span className="px-2 py-0.5 rounded text-[11.5px] font-bold bg-blue-100 text-blue-800">
              {predicted_category}
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              ({explanation_method})
            </span>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
            Base Prior (Avg)
          </span>
          <span className="font-mono text-[14px] font-semibold text-slate-600">
            {(base_value * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Aspect Selector Pills */}
      {Object.keys(aspects).length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11.5px] font-semibold text-slate-500 mr-1 flex items-center gap-1">
            <Layers className="w-3 h-3 text-slate-400" /> Aspect:
          </span>
          <button
            type="button"
            onClick={() => setSelectedAspect('ALL')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              selectedAspect === 'ALL'
                ? 'bg-slate-900 text-white font-semibold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Features
          </button>
          {Object.entries(aspects).map(([key]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedAspect(key)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                selectedAspect === key
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {key.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}

      {/* Aspect Summary text if selected */}
      {selectedAspect !== 'ALL' && aspects[selectedAspect]?.summary && (
        <p className="text-[12px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200">
          {aspects[selectedAspect].summary}
        </p>
      )}

      {/* Feature Contributions List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
          <span>Rank • Feature & Input Value</span>
          <span>Contribution & Direction</span>
        </div>

        {displayedFeatures.length === 0 ? (
          <p className="text-[12px] text-slate-500 italic py-2">No features recorded for this aspect.</p>
        ) : (
          displayedFeatures.slice(0, visibleCount).map((f) => {
            const isPos = f.direction === 'POSITIVE' || f.contribution > 0;
            const barPct = Math.min(100, Math.round((Math.abs(f.contribution) / maxAbsContrib) * 100));

            return (
              <div
                key={f.feature}
                className="p-2 rounded-lg bg-slate-50/80 border border-slate-200/80 space-y-1.5 hover:bg-slate-100/70 transition-colors"
              >
                <div className="flex items-center justify-between text-[12.5px]">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10.5px] font-bold font-mono">
                      #{f.importance_rank}
                    </span>
                    <span className="font-semibold text-slate-800">
                      {f.feature.replace(/_/g, ' ')}
                    </span>
                    <span className="font-mono text-[11.5px] text-slate-500 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                      val: {f.input_value}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono text-[12.5px] font-bold">
                    {isPos ? (
                      <span className="flex items-center text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        <ArrowUpRight className="w-3.5 h-3.5 mr-0.5 text-emerald-600" />
                        +{(f.contribution * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="flex items-center text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                        <ArrowDownRight className="w-3.5 h-3.5 mr-0.5 text-rose-600" />
                        {(f.contribution * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Relative visual contribution bar */}
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden flex">
                  <div
                    className={`h-full rounded-full ${
                      isPos ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {displayedFeatures.length > 5 && (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center justify-center gap-1 w-full text-[12px] font-semibold text-blue-600 hover:text-blue-800 py-1"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" /> Show Top 5 Only
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" /> View All {displayedFeatures.length} Factors
            </>
          )}
        </button>
      )}
    </div>
  );
};
