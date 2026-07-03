import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export async function handleAuth(req: Request, supabaseUrl: string, supabaseAnonKey: string, corsHeaders: HeadersInit): Promise<{ user: any, authErrorResponse: Response | null }> {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  
  if (!token) {
      return { user: null, authErrorResponse: new Response(JSON.stringify({ error: "Unauthorized: Missing token" }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }) };
  }

  const authSupabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: authError } = await authSupabase.auth.getUser(token);

  console.log('[AuthMiddleware] User dari Supabase:', JSON.stringify(user));
  console.log('[AuthMiddleware] User ID:', user?.id);

  if (authError || !user || !user.id) {
      return { user: null, authErrorResponse: new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired token" }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }) };
  }

  return { user, authErrorResponse: null };
}