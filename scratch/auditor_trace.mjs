import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uuyzdjifhdfyyvpxsofu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjMyODUsImV4cCI6MjA5NTIzOTI4NX0.atDqwfpg_uwFI0nZuKQNxebCYh1KC7tdkSooC52m4YQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const userId = "3841e124-15c1-44bb-9034-bde61410882d";
const userPrompt = "sebelum saya tinggal di bandung, saya tinggal di mana?";

async function audit() {
    console.log("=== STEP 1: RAW TABLE FETCH ===");
    const { data: rawData, error: rawError } = await supabase.from('user_memories').select('*').eq('user_id', userId);
    console.log("Raw Error:", rawError ? rawError.message : "None");
    console.log("Raw Row Count:", rawData ? rawData.length : "UNKNOWN");
    
    console.log("\n=== STEP 2: VIEW FETCH ===");
    const { data: viewData, error: viewError } = await supabase.from('active_user_memories').select('*');
    console.log("View Error:", viewError ? viewError.message : "None");
    console.log("View Row Count:", viewData ? viewData.length : "UNKNOWN");
    if (viewData && viewData.length > 0) {
        console.log("Columns present in View:", Object.keys(viewData[0]));
    }
}
audit();
