import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uuyzdjifhdfyyvpxsofu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function extract() {
    console.log("Mengekstrak data dari view 'active_user_memories' (Bypass RLS)...");
    const { data, error } = await supabase.from('active_user_memories').select('*').limit(50);
    if (error) {
        console.error("Error Query:", error);
    } else {
        console.log(`\nSukses! Ditemukan ${data.length} memori.\n`);
        
        // Pretty print important columns
        const formattedData = data.map(d => ({
            Summary: d.summary,
            Type: d.memory_type,
            State: d.memory_state,
            Date: new Date(d.created_at).toISOString().split('T')[0]
        }));
        
        console.table(formattedData);
    }
}
extract();
