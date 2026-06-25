import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const supabaseUrl = 'https://uuyzdjifhdfyyvpxsofu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1eXpkamlmaGRmeXl2cHhzb2Z1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTY2MzI4NSwiZXhwIjoyMDk1MjM5Mjg1fQ.XQ1pG3v3KkQGZ8Uq8MvqL_x5JkX2o8P_h2i6Q_R7L9s'; // Wait, I don't have the service role key.

// I can't easily query the schema without the service role key.
// But wait, the anon key was in `mametlite/.env`.
// Let's use `npm` inside `backend` or another place where `dotenv` is installed, or just write it with deno!
