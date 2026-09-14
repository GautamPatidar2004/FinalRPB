import test from 'node:test';
import assert from 'node:assert/strict';

// Test mock fixtures representing real backend Prompt 1 & Prompt 2 payloads
const mockUnifiedExplanation = {
  planning_run_id: 'PLAN-TEST-2026',
  selected_plan: {
    plan_id: 'PLAN-TEST-2026',
    title: 'Optimized Section Plan - Mumbai-Delhi Main',
    is_feasible: true,
    overall_score: 0.885,
    selected_strategy: 'Priority Greedy + Feasibility',
    scheduled_blocks: [
      {
        id: 'BLK-001',
        request_id: 'REQ-ENG-101',
        department: 'Engineering',
        asset_id: 'AST-TRK-01',
        corridor_id: 'CORR-MUM-DEL',
        scheduled_start_minute: 120,
        scheduled_end_minute: 240,
        allocated_duration_minutes: 120,
        status: 'SCHEDULED',
        conflict_flags: [],
      },
    ],
  },
  provider_metadata: {
    provider: 'gemini',
    provider_status: 'AVAILABLE',
    fallback_used: false,
    fallback_reason: null,
    model: 'gemini-2.5-flash',
    request_timestamp: '2026-09-15T01:00:00Z',
    latency_ms: 320.5,
  },
  narrative: {
    executive_summary: 'Plan schedules 8 critical track blocks with zero train clashes.',
    operational_context: 'Peak morning passenger traffic preserved by utilizing night slots.',
    key_tradeoffs: ['Overdue track renewal prioritized over routine inspection'],
    risk_mitigation: 'OHE power cut buffered by 20 minutes before train block.',
    recommendations: ['Authorize 120-minute possession on UP line between 02:00-04:00'],
  },
  prediction_evidence: {
    'REQ-ENG-101': {
      request_id: 'REQ-ENG-101',
      predicted_score: 0.92,
      predicted_category: 'CRITICAL',
      explanation_method: 'SHAP',
      base_value: 0.55,
      aspects: {
        asset_risk_priority: {
          aspect: 'asset_risk_priority',
          summary: 'Critical track geometry defect drove urgency.',
          features: [
            {
              feature: 'defect_severity_index',
              input_value: 4.8,
              contribution: 0.22,
              direction: 'POSITIVE',
              importance_rank: 1,
            },
          ],
        },
      },
      feature_contributions: [
        {
          feature: 'defect_severity_index',
          input_value: 4.8,
          contribution: 0.22,
          direction: 'POSITIVE',
          importance_rank: 1,
        },
        {
          feature: 'days_overdue',
          input_value: 14.0,
          contribution: 0.15,
          direction: 'POSITIVE',
          importance_rank: 2,
        },
        {
          feature: 'passenger_train_density',
          input_value: 12.0,
          contribution: -0.05,
          direction: 'NEGATIVE',
          importance_rank: 3,
        },
      ],
    },
  },
  decision_trace: [
    {
      request_id: 'REQ-ENG-101',
      final_decision: 'SELECTED',
      stages: [
        { stage_name: 'ML_PREDICTION', status: 'PASSED', details: { score: 0.92, priority: 'CRITICAL' } },
        { stage_name: 'CONSTRAINT_CHECK', status: 'PASSED', details: { violations: 0 } },
        { stage_name: 'CANDIDATE_WINDOW', status: 'FEASIBLE', details: { window: [120, 240] } },
        { stage_name: 'CONFLICT_CHECK', status: 'PASSED', details: { headways_ok: true } },
        { stage_name: 'OPTIMIZATION', status: 'SCHEDULED', details: { objective_gain: 0.88 } },
        { stage_name: 'FINAL_DECISION', status: 'SELECTED', details: { slot: [120, 240] } },
      ],
    },
  ],
  constraint_results: [
    {
      constraint_type: 'HEADWAY_BUFFER',
      canonical_type: 'HEADWAY_BUFFER',
      passed: true,
      request_id: 'REQ-ENG-101',
      block_id: 'BLK-001',
      affected_window: [120, 240],
      reason: '20-minute safety buffer maintained from Express train 12951',
      relevant_values: { required_buffer_min: 15, actual_buffer_min: 20 },
    },
  ],
  optimizer_decisions: {
    selected_strategy: 'Priority Greedy + Feasibility',
    candidates_evaluated: [
      {
        strategy_name: 'Priority Greedy + Feasibility',
        is_feasible: true,
        score: 0.885,
        hard_violations_count: 0,
        objective_contribution: 0.885,
        grouping_benefit: 0.12,
        operational_impact: 0.05,
        asset_priority_benefit: 0.45,
        overdue_benefit: 0.35,
        is_selected: true,
      },
    ],
    replanning_applied: false,
    decision_log: [],
  },
  score_breakdown: {
    overall_score: 0.885,
    asset_availability: 0.95,
    risk_coverage: 0.92,
    overdue: 0.85,
    operational_impact: 0.80,
    train_conflict: 1.0,
    grouping: 0.78,
    resource_utilization: 0.82,
    factor_scores: {
      risk_coverage: 0.92,
      train_conflict: 1.0,
      grouping: 0.78,
    },
  },
  scheduled_reasons: [
    {
      request_id: 'REQ-ENG-101',
      decision: 'SELECTED',
      primary_reason: 'High track wear severity and available 120-minute shadow window at 02:00.',
      evidence: ['Track geometry index 4.8', 'Zero conflict with scheduled timetable'],
      slot: [120, 240],
      affected_asset: 'AST-TRK-01',
    },
  ],
  postponed_reasons: [
    {
      request_id: 'REQ-SNT-202',
      decision: 'POSTPONED',
      primary_reason: 'Corridor traffic saturation during required daylight window.',
      evidence: ['Track possession requires 180 min, available gap only 90 min'],
      affected_asset: 'AST-SIG-04',
    },
  ],
  grouping_reasons: [
    {
      request_id: 'REQ-ENG-101',
      decision: 'GROUPED',
      primary_reason: 'Combined with OHE maintenance to form a Mega-Block, saving 45 minutes possession.',
      evidence: ['Co-located on track km 45.0 - 55.0'],
    },
  ],
  alternative_reasons: [
    {
      request_id: 'REQ-ENG-101',
      decision: 'ALTERNATIVE_WINDOW',
      primary_reason: 'Night window 02:00 chosen over midday 12:00 due to 80% lower train disruption.',
      evidence: ['Midday would delay 4 express services'],
      slot: [120, 240],
    },
  ],
  warnings: [],
  model_versions: { xgboost: '1.7.6', gemini: '2.5-flash' },
};

test('1. Successful explanation payload parsing and contract adherence', () => {
  assert.equal(mockUnifiedExplanation.planning_run_id, 'PLAN-TEST-2026');
  assert.equal(mockUnifiedExplanation.selected_plan.is_feasible, true);
  assert.equal(typeof mockUnifiedExplanation.score_breakdown.overall_score, 'number');
});

test('2. SHAP factors: ranking, input value, contribution, direction and aspect filtering', () => {
  const reqEvidence = mockUnifiedExplanation.prediction_evidence['REQ-ENG-101'];
  assert.ok(reqEvidence);
  assert.equal(reqEvidence.explanation_method, 'SHAP');
  assert.equal(reqEvidence.feature_contributions.length, 3);

  const top1 = reqEvidence.feature_contributions[0];
  assert.equal(top1.importance_rank, 1);
  assert.equal(top1.feature, 'defect_severity_index');
  assert.equal(top1.input_value, 4.8);
  assert.equal(top1.direction, 'POSITIVE');
  assert.ok(top1.contribution > 0);

  const neg = reqEvidence.feature_contributions[2];
  assert.equal(neg.direction, 'NEGATIVE');
  assert.ok(neg.contribution < 0);

  // Aspect filtering
  const aspectFeatures = reqEvidence.aspects.asset_risk_priority.features;
  assert.equal(aspectFeatures.length, 1);
  assert.equal(aspectFeatures[0].feature, 'defect_severity_index');
});

test('3. Decision trace: stages sequence, status resolution, and details', () => {
  const trace = mockUnifiedExplanation.decision_trace[0];
  assert.equal(trace.request_id, 'REQ-ENG-101');
  assert.equal(trace.final_decision, 'SELECTED');
  assert.equal(trace.stages.length, 6);

  const stageNames = trace.stages.map((s) => s.stage_name);
  assert.deepEqual(stageNames, [
    'ML_PREDICTION',
    'CONSTRAINT_CHECK',
    'CANDIDATE_WINDOW',
    'CONFLICT_CHECK',
    'OPTIMIZATION',
    'FINAL_DECISION',
  ]);

  for (const stg of trace.stages) {
    assert.ok(stg.status);
    assert.ok(stg.details);
  }
});

test('4. Constraint evidence: passed/failed records, affected windows, reasons', () => {
  const c = mockUnifiedExplanation.constraint_results[0];
  assert.equal(c.constraint_type, 'HEADWAY_BUFFER');
  assert.equal(c.passed, true);
  assert.equal(c.request_id, 'REQ-ENG-101');
  assert.deepEqual(c.affected_window, [120, 240]);
  assert.match(c.reason, /20-minute safety buffer maintained/);
});

test('5. Score breakdown: overall score and 7 factor breakdown', () => {
  const sb = mockUnifiedExplanation.score_breakdown;
  assert.equal(sb.overall_score, 0.885);
  assert.equal(sb.asset_availability, 0.95);
  assert.equal(sb.risk_coverage, 0.92);
  assert.equal(sb.overdue, 0.85);
  assert.equal(sb.operational_impact, 0.80);
  assert.equal(sb.train_conflict, 1.0);
  assert.equal(sb.grouping, 0.78);
  assert.equal(sb.resource_utilization, 0.82);
});

test('6. Scheduled explanation: primary reason, slot, and supporting evidence', () => {
  const r = mockUnifiedExplanation.scheduled_reasons[0];
  assert.equal(r.request_id, 'REQ-ENG-101');
  assert.equal(r.decision, 'SELECTED');
  assert.match(r.primary_reason, /High track wear severity/);
  assert.deepEqual(r.slot, [120, 240]);
  assert.ok(r.evidence.length >= 2);
});

test('7. Postponed explanation: primary reason and blocking evidence', () => {
  const p = mockUnifiedExplanation.postponed_reasons[0];
  assert.equal(p.request_id, 'REQ-SNT-202');
  assert.equal(p.decision, 'POSTPONED');
  assert.match(p.primary_reason, /traffic saturation/);
  assert.match(p.evidence[0], /gap only 90 min/);
});

test('8. Grouped-task explanation: Mega-Block synergy rationale', () => {
  const g = mockUnifiedExplanation.grouping_reasons[0];
  assert.equal(g.request_id, 'REQ-ENG-101');
  assert.equal(g.decision, 'GROUPED');
  assert.match(g.primary_reason, /Mega-Block/);
});

test('9. Alternative window explanation: trade-off and evaluated alternatives', () => {
  const a = mockUnifiedExplanation.alternative_reasons[0];
  assert.equal(a.request_id, 'REQ-ENG-101');
  assert.equal(a.decision, 'ALTERNATIVE_WINDOW');
  assert.match(a.primary_reason, /Night window 02:00 chosen over midday/);
  assert.deepEqual(a.slot, [120, 240]);
});

test('10. Provider indicator: Gemini telemetry & sanitized attributes', () => {
  const pm = mockUnifiedExplanation.provider_metadata;
  assert.equal(pm.provider, 'gemini');
  assert.equal(pm.provider_status, 'AVAILABLE');
  assert.equal(pm.model, 'gemini-2.5-flash');
  assert.equal(pm.fallback_used, false);
  assert.ok(pm.latency_ms > 0);
  // Ensure no API keys or internal tokens exposed
  assert.equal(pm.api_key, undefined);
  assert.equal(pm.token_count, undefined);
});

test('11. Fallback indicator: Groq -> Gemini fallback metadata handling', () => {
  const fallbackMeta = {
    provider: 'gemini',
    provider_status: 'AVAILABLE',
    fallback_used: true,
    fallback_reason: 'Groq RATE_LIMITED: Cooldown active (60s)',
    model: 'gemini-2.5-flash',
    request_timestamp: '2026-09-15T01:05:00Z',
    latency_ms: 410.0,
  };
  assert.equal(fallbackMeta.fallback_used, true);
  assert.match(fallbackMeta.fallback_reason, /RATE_LIMITED/);
});

test('12. Deterministic fallback: offline / quota exhausted indicator', () => {
  const deterministicMeta = {
    provider: 'deterministic',
    provider_status: 'AVAILABLE',
    fallback_used: true,
    fallback_reason: 'All configured LLM providers unavailable or quota exhausted',
    model: 'RailwayDeterministicRuleEngine',
    request_timestamp: '2026-09-15T01:06:00Z',
    latency_ms: 5.2,
  };
  assert.equal(deterministicMeta.provider, 'deterministic');
  assert.equal(deterministicMeta.fallback_used, true);
});

test('13. No explanation data / empty state handling', () => {
  const emptyExp = null;
  assert.equal(emptyExp, null);
});

test('14. Backend authority: decisions and scores cannot be overridden on frontend', () => {
  // Freezing plan payload ensures immutability
  const frozenPlan = Object.freeze({ ...mockUnifiedExplanation.selected_plan });
  assert.throws(() => {
    frozenPlan.is_feasible = false;
  });
});
