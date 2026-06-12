// ============================================================================
// Calibration orchestrator.
//
// Pure: given the already-built fields (historical + synthetic), the config-
// independent stat norms, and the resolved candidates, replay + score each
// candidate and assemble the report. The CLI is responsible for sourcing the
// fields (DB-backed or fixture) and norms, so this layer needs no I/O and is
// fully unit-testable.
// ============================================================================

import type { StatNorms } from "../types";
import { replayCandidate } from "./extract";
import { scoreCandidate } from "./score";
import type {
  CalibrationReport,
  CalibrationRunOptions,
  ReplayField,
  ResolvedCandidate,
} from "./types";

export interface RunCalibrationParams {
  options: CalibrationRunOptions;
  candidates: ResolvedCandidate[];
  historicalFields: ReplayField[];
  syntheticFields: ReplayField[];
  norms: StatNorms;
  runId: string;
  generatedAt: string; // ISO timestamp (passed in — scripts can't read the clock deterministically)
}

export function runCalibration(p: RunCalibrationParams): CalibrationReport {
  const allFields = [...p.historicalFields, ...p.syntheticFields];
  const candidates = p.candidates.map((c) => {
    const obs = replayCandidate(c, allFields, p.norms);
    return scoreCandidate(c, obs);
  });

  return {
    runId: p.runId,
    generatedAt: p.generatedAt,
    options: p.options,
    historicalFields: p.historicalFields.length,
    syntheticFields: p.syntheticFields.length,
    candidates,
  };
}
