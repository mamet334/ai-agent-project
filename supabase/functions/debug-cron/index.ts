import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Test 1: List auth users
    const { data: authData } = await supabase.auth.admin.listUsers();
    const users = authData?.users?.map(u => ({ id: u.id, email: u.email })) || [];

    // Test 2: Try insert with a dummy user_id
    let insertResult = null;
    let insertError = null;
    try {
      const testUserId = users.length > 0 ? users[0].id : 'test-no-auth-user';
      const { data, error } = await supabase.from('scheduled_tasks').insert([{
        user_id: testUserId,
        title: 'SYSTEM_TEST_DELETE_ME',
        prompt: 'test',
        interval_hours: 24,
        tools: ['web_search']
      }]).select();
      insertResult = data;
      insertError = error;

      // Clean up test data
      if (data && data.length > 0) {
        await supabase.from('scheduled_tasks').delete().eq('id', data[0].id);
      }
    } catch (e) {
      insertError = e.message;
    }

    // Test 3: List all scheduled tasks
    const { data: tasks, error: tasksError } = await supabase.from('scheduled_tasks').select('*');

    return new Response(JSON.stringify({
      auth_users: users,
      auth_users_count: users.length,
      insert_test: { result: insertResult, error: insertError },
      existing_tasks: tasks,
      tasks_error: tasksError,
      supabase_url: supabaseUrl
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
