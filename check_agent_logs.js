import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'frontend/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLogs() {
    console.log("Fetching latest agent logs...");
    const { data: logs, error } = await supabase
        .from('agent_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
    
    if (error) {
        console.error("Error fetching logs:", error.message);
        return;
    }

    console.log("Latest Logs:");
    logs.forEach(log => {
        console.log(`[${log.created_at}] [${log.event_type}] [${log.provider || 'N/A'}]: ${log.message}`);
    });
}

checkLogs();
