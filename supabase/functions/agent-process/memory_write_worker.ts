import { saveFactDirectly } from './plugins/memory_manager_v1.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { detectFact } from './lib/fact_detector.ts';

export const processMemoryWriteQueue = async (
  userId: string,
  userMessage: string,
  supabaseUrl: string,
  supabaseKey: string
) => {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const logAudit = async (action: string, intent: string, confidence: number, reason: string) => {
    try {
      await supabase.from('memory_audit_log').insert([{
        user_id: userId,
        input_text: userMessage,
        detected_intent: intent,
        confidence: confidence,
        action: action,
        reason: reason,
        source: 'fact_detector'
      }]);
      console.log(`[MEMORY_AUDIT_LOG] ${action} | Intent: ${intent} | Reason: ${reason}`);
    } catch (e) {
      console.error("[MEMORY_AUDIT_LOG_ERROR]", e);
    }
  };

  try {
    // 1. FACT DETECTOR GATE
    const detectorResult = detectFact(userMessage);

    if (!detectorResult.shouldSaveMemory) {
       await logAudit('SKIPPED', detectorResult.intent, detectorResult.confidence, detectorResult.reason);
       return;
    }

    const msgLower = userMessage.trim().toLowerCase();
    
    let extractedFact = userMessage.trim();
    let memoryType = 'FACT';

    if (msgLower.includes('suka') || msgLower.includes('alergi') || msgLower.includes('benci')) {
        memoryType = 'PREFERENCE';
    } else if (msgLower.includes('nama') || msgLower.includes('panggil')) {
        memoryType = 'IDENTITY';
    }

    // 2. DEDUPLICATION LAYER
    const { data: existing } = await supabase
      .from('user_memories')
      .select('id, summary, confidence')
      .eq('user_id', userId)
      .ilike('summary', `%${extractedFact}%`)
      .limit(1);

    if (existing && existing.length > 0) {
       const newConfidence = Math.min(1.0, (existing[0].confidence || 0.8) + 0.1);
       await supabase.from('user_memories').update({ confidence: newConfidence }).eq('id', existing[0].id);
       await logAudit('DEDUPED', 'FACT', 0.9, 'Duplikat, confidence naik');
       return;
    }

    // 3. INSERT FACT BARU
    await saveFactDirectly({
      user_id: userId,
      content: extractedFact,
      memory_type: memoryType,
      confidence: 0.9,
      source: 'rule_based_async_worker'
    }, supabaseUrl, supabaseKey);

    await logAudit('STORED', 'FACT', 0.9, 'Pola baru cocok dan tersimpan');
  } catch (error) {
    await logAudit('REJECTED', 'UNKNOWN', 0.0, `System Error: ${error}`);
  }
};
