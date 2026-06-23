import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uuyzdjifhdfyyvpxsofu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function extract() {
    console.log("Mengekstrak data dari table 'user_memories'...");
    // Must supply user_id to pass RLS policy if it's based on user_id
    const userId = "3841e124-15c1-44bb-9034-bde61410882d";
    const { data, error } = await supabase.from('user_memories').select('summary, memory_type, memory_state, created_at').eq('user_id', userId).limit(50);
    if (error) {
        console.error("Error Query:", error);
    } else {
        console.log(`\nSukses! Ditemukan ${data.length} memori.\n`);
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
