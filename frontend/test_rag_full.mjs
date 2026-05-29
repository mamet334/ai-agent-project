import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runTest() {
  console.log("Signing up a test user to get a valid user_id...");
  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email: 'test_rag_user@example.com',
    password: 'Password123!',
  });
  
  let userId = authData?.user?.id;
  
  if (authErr) {
    console.log("Auth error, maybe user already exists. Attempting login...");
    const { data: loginData } = await supabase.auth.signInWithPassword({
        email: 'test_rag_user@example.com',
        password: 'Password123!',
    });
    userId = loginData?.user?.id;
  }
  
  if (!userId) {
    console.error("Could not get a valid user ID.");
    return;
  }
  
  console.log("Valid user_id obtained:", userId);
  
  console.log("Invoking rag-process...");
  const { data, error } = await supabase.functions.invoke('rag-process', {
    body: {
      title: 'test_doc_rag.txt',
      text: 'This is a test chunk to see if Gemini embedding works.',
      userId: userId
    }
  });

  console.log("Result data:", data);
  if (error) {
    console.error("Result error:", error);
    // error is typically FunctionsHttpError which contains context. 
    // We can't directly read the body if it threw, so let's use node-fetch to get the exact error message.
  }
}

runTest();
