import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config(); 

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDB() {
    console.log("Checking documents...");
    const { data: docs } = await supabase.from('documents').select('*');
    console.log("Documents:", docs?.length);
    if (docs?.length > 0) {
        console.log("First doc title:", docs[0].title);
        console.log("User ID:", docs[0].user_id);
    }

    console.log("\nChecking chunks...");
    const { data: chunks } = await supabase.from('document_chunks').select('id, content').limit(3);
    console.log("Chunks found:", chunks?.length);
    if (chunks?.length > 0) {
        console.log("Sample chunk:", chunks[0].content.substring(0, 100));
    }
}

checkDB();
