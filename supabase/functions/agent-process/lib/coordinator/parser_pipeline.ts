import { parseCoordinatorPlan } from './response_parser.ts';
import { extractSourceTrace } from './trace_parser.ts';
import { CoordinatorPlanParseResult, TraceParseResult } from './types.ts';
import { eventBus } from '../event/event_bus.ts';

export function executeResponsePipeline(action: 'parse_plan', payload: string, rctx?: any): CoordinatorPlanParseResult;
export function executeResponsePipeline(action: 'extract_trace', payload: string, rctx?: any): TraceParseResult;
export function executeResponsePipeline(action: 'parse_plan' | 'extract_trace', payload: string, rctx?: any): any {
  if (action === 'parse_plan') {
    const result = parseCoordinatorPlan(payload);
    if (result.healerTriggered) {
      eventBus.emit({
        type: 'Error.Occurred',
        source: 'ParserPipeline',
        trace_id: rctx?.tasks?.traceId || 'unknown',
        payload: {
          error_type: 'JSON_PARSE_ERROR',
          raw_payload: payload,
          validation: result.validation,
          healer_status: 'TRIGGERED'
        }
      });
    }
    return result;
  } else if (action === 'extract_trace') {
    return extractSourceTrace(payload);
  }
  throw new Error(`Unknown parser action: ${action}`);
}
