import React from 'react';
import { Bot, Sparkles, Cpu, AlertTriangle, ArrowRightLeft } from 'lucide-react';
import type { ProviderMetadata } from '../../types';

export interface ProviderBadgeProps {
  metadata?: ProviderMetadata | null;
  compact?: boolean;
  className?: string;
}

export const ProviderBadge: React.FC<ProviderBadgeProps> = ({
  metadata,
  compact = false,
  className = '',
}) => {
  if (!metadata) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11.5px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 ${className}`}
        title="Deterministic Rule Engine"
      >
        <Cpu className="w-3 h-3 text-slate-500" />
        <span>Deterministic</span>
      </span>
    );
  }

  const provider = metadata.provider.toLowerCase();
  const isGemini = provider.includes('gemini');
  const isGroq = provider.includes('groq');
  const isOpenAI = provider.includes('openai');

  const providerLabel = isGemini ? 'Gemini' : isGroq ? 'Groq' : isOpenAI ? 'OpenAI' : 'Deterministic';

  // Badge theme colors
  const themeClasses = isGemini
    ? 'bg-blue-50 text-blue-700 border-blue-200'
    : isGroq
    ? 'bg-orange-50 text-orange-700 border-orange-200'
    : isOpenAI
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-slate-100 text-slate-700 border-slate-200';

  const icon = isGemini ? (
    <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
  ) : isGroq ? (
    <Bot className="w-3.5 h-3.5 text-orange-600 shrink-0" />
  ) : isOpenAI ? (
    <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
  ) : (
    <Cpu className="w-3.5 h-3.5 text-slate-600 shrink-0" />
  );

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] font-medium border ${themeClasses} ${className}`}
        title={`${providerLabel} (${metadata.model || 'Standard Engine'}) • Status: ${metadata.provider_status}`}
      >
        {icon}
        <span className="font-semibold">{providerLabel}</span>
        {metadata.fallback_used && (
          <span
            className="inline-flex items-center text-[10px] px-1 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 font-bold ml-0.5"
            title={`Fallback occurred: ${metadata.fallback_reason || 'Primary provider unavailable'}`}
          >
            <ArrowRightLeft className="w-2.5 h-2.5 mr-0.5" />
            Fallback
          </span>
        )}
      </span>
    );
  }

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-2 px-2.5 py-1 rounded-lg text-[12.5px] border shadow-xs ${themeClasses} ${className}`}
    >
      <div className="flex items-center gap-1.5 font-semibold">
        {icon}
        <span>{providerLabel}</span>
      </div>

      {metadata.model && (
        <span className="font-mono text-[11px] text-slate-600 bg-white/70 px-1.5 py-0.5 rounded border border-slate-200">
          {metadata.model}
        </span>
      )}

      {metadata.latency_ms > 0 && (
        <span className="text-[11px] text-slate-500 font-mono">
          {metadata.latency_ms.toFixed(0)}ms
        </span>
      )}

      {metadata.fallback_used && (
        <span
          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-semibold"
          title={metadata.fallback_reason || 'Fallback used due to quota or health constraints'}
        >
          <AlertTriangle className="w-3 h-3 text-amber-600" />
          <span>Fallback</span>
        </span>
      )}
    </div>
  );
};
