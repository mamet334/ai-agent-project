export function handleCorsAndOptions(req: Request, corsHeaders: HeadersInit): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}