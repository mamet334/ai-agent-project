import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface UsageData {
  userId: string;
  adapter: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  callerContext?: string;
  traceId?: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
}

export interface BlockedData {
  userId: string;
  adapter?: string;
  model?: string;
  reason: string;
  traceId?: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
}

export async function checkGuardrails(
  supabaseUrl: string, 
  supabaseServiceKey: string, 
  userId: string, 
  model?: string,
  adapter?: string,
  traceId?: string
): Promise<boolean> {
  if (!supabaseUrl || !supabaseServiceKey) return true;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 1. Check system config for kill switch & budget
  const { data: config } = await supabase
    .from('system_config')
    .select('kill_switch_active, daily_budget_cap_usd')
    .single();

  if (config?.kill_switch_active) {
    await recordBlocked({
      userId,
      adapter,
      model,
      reason: 'KILL_SWITCH',
      traceId,
      supabaseUrl,
      supabaseServiceKey
    });
    throw new Error('SYSTEM_KILL_SWITCH_ACTIVE: AI generation is temporarily disabled.');
  }

  // 2. Check daily budget cap (USD)
  const today = new Date().toISOString().split('T')[0];
  const { data: usageData } = await supabase
    .from('cost_ledger')
    .select('estimated_cost_usd')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('created_at', `${today}T00:00:00Z`);

  if (usageData && config?.daily_budget_cap_usd !== undefined && config?.daily_budget_cap_usd !== null) {
    const dailyCost = usageData.reduce((sum: number, row: any) => sum + (row.estimated_cost_usd || 0), 0);
    const DAILY_LIMIT = config.daily_budget_cap_usd;
    if (dailyCost > DAILY_LIMIT) {
      await recordBlocked({
        userId,
        adapter,
        model,
        reason: 'DAILY_CAP_EXCEEDED',
        traceId,
        supabaseUrl,
        supabaseServiceKey
      });
      throw new Error(`DAILY_CAP_EXCEEDED: User ${userId} has exceeded the daily limit of $${DAILY_LIMIT} USD.`);
    }
  }

  return true;
}

export async function recordUsage(usage: UsageData): Promise<void> {
  const { supabaseUrl, supabaseServiceKey, userId, adapter, model, promptTokens, completionTokens, callerContext, traceId } = usage;
  if (!supabaseUrl || !supabaseServiceKey) return;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const totalTokens = promptTokens + completionTokens;

  let inputPrice = 0;
  let outputPrice = 0;
  
  const { data: priceData } = await supabase
    .from('model_pricing')
    .select('input_price_per_1m, output_price_per_1m')
    .eq('model', model)
    .single();

  if (priceData) {
    inputPrice = priceData.input_price_per_1m || 0;
    outputPrice = priceData.output_price_per_1m || 0;
  }

  // Calculate cost per 1M tokens
  const estimatedCostUsd = ((promptTokens / 1_000_000) * inputPrice) + ((completionTokens / 1_000_000) * outputPrice);

  await supabase.from('cost_ledger').insert({
    user_id: userId,
    trace_id: traceId || null,
    adapter: adapter,
    model: model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    estimated_cost_usd: estimatedCostUsd,
    caller_context: callerContext || null,
    status: 'completed'
  });
}

export async function recordBlocked(blocked: BlockedData): Promise<void> {
  const { supabaseUrl, supabaseServiceKey, userId, adapter, model, reason, traceId } = blocked;
  if (!supabaseUrl || !supabaseServiceKey) return;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  await supabase.from('cost_ledger').insert({
    user_id: userId,
    trace_id: traceId || null,
    adapter: adapter || null,
    model: model || null,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
    caller_context: null,
    status: 'blocked',
    blocked_reason: reason
  });
}
