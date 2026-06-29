import { parseCoordinatorPlan } from './response_parser.ts';
import { extractSourceTrace } from './trace_parser.ts';
import { CoordinatorPlanParseResult, TraceParseResult } from './types.ts';

export function executeResponsePipeline(action: 'parse_plan', payload: string): CoordinatorPlanParseResult;
export function executeResponsePipeline(action: 'extract_trace', payload: string): TraceParseResult;
export function executeResponsePipeline(action: 'parse_plan' | 'extract_trace', payload: string): any {
  if (action === 'parse_plan') {
    return parseCoordinatorPlan(payload);
  } else if (action === 'extract_trace') {
    return extractSourceTrace(payload);
  }
  throw new Error(`Unknown parser action: ${action}`);
}
