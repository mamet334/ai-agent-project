import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkChats() {
    console.log("Fetching latest chats...");
    const { data: chats, error } = await supabase
        .from('chats')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(3);
    
    if (error) {
        console.error("Error fetching chats:", error.message);
        return;
    }

    console.log("Latest Chats:");
    chats.forEach(chat => {
        console.log(`[${chat.id}] [${chat.title}]: ${chat.messages?.length || 0} messages`);
        if (chat.messages && chat.messages.length > 0) {
            console.log("  Last Message:", JSON.stringify(chat.messages[chat.messages.length - 1]).substring(0, 500));
        }
    });
}

checkChats();
