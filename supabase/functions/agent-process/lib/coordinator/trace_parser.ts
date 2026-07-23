import { TraceParseResult } from './types.ts';

export function extractSourceTrace(msg: string): TraceParseResult {
  const lines = msg.split('\n');
  const formatRegex = /[A-Z]{2,3}-\d{4}/;
  const keywordRegex = /^(?:\W|_)*(?:source\s*trace|sources?|referensi)\b/i;
  
  // Scan 30 baris terakhir (diperluas dari 15 — ADR-0012, 2026-07-23)
  // Instruksi prompt baru menaruh SOURCE TRACE di akhir, tapi jawaban panjang
  // memerlukan window yang lebih besar untuk memastikan parser bisa menemukan format ID.
  const scanLimit = Math.max(0, lines.length - 30);
  let headerIndex = -1;
  let firstIdIndex = -1;
  
  for (let i = scanLimit; i < lines.length; i++) {
    const line = lines[i].trim();
    if (headerIndex === -1 && keywordRegex.test(line)) headerIndex = i;
    if (firstIdIndex === -1 && formatRegex.test(line)) firstIdIndex = i;
  }
  
  let startIndex = -1;
  if (headerIndex !== -1) {
    let hasId = false;
    for (let i = headerIndex; i < lines.length; i++) {
      if (formatRegex.test(lines[i])) { hasId = true; break; }
    }
    if (hasId) startIndex = headerIndex;
    else if (firstIdIndex !== -1) startIndex = firstIdIndex;
  } else if (firstIdIndex !== -1) {
    startIndex = firstIdIndex;
  }
  
  if (startIndex !== -1) {
    return {
      replyWithoutTrace: lines.slice(0, startIndex).join('\n').trim(),
      sourceTrace: lines.slice(startIndex).join('\n').trim()
    };
  }
  
  return { replyWithoutTrace: msg, sourceTrace: undefined };
}
