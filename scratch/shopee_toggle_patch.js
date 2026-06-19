const fs = require('fs');
const path = require('path');

const dashPath = path.join(__dirname, '../frontend/src/components/ShopeeDashboard.jsx');
let code = fs.readFileSync(dashPath, 'utf8');

// Import Power icon
if (!code.includes('Power')) {
  code = code.replace(/import { ShoppingBag, Plus, Trash2, Check, ExternalLink, RefreshCw, Clock } from 'lucide-react';/, "import { ShoppingBag, Plus, Trash2, Check, ExternalLink, RefreshCw, Clock, Power } from 'lucide-react';");
}

// Add state for toggle
if (!code.includes('isSystemActive')) {
  code = code.replace(/const \[loading, setLoading\] = useState\(true\);/, `const [loading, setLoading] = useState(true);
  const [isSystemActive, setIsSystemActive] = useState(true);
  const [toggleLoading, setToggleLoading] = useState(false);`);
}

// Update fetchData to fetch toggle state
const fetchDataReplacement = `const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shopee_queue')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setQueue(data || []);

      // Get system toggle state
      const { data: toggleData, error: toggleError } = await supabase
        .from('scheduled_tasks')
        .select('is_active')
        .eq('title', 'SYSTEM_SHOPEE_NINJA_TOGGLE')
        .limit(1)
        .maybeSingle();

      if (!toggleError && toggleData) {
        setIsSystemActive(toggleData.is_active);
      } else if (!toggleData) {
        // Create it if it doesn't exist
        await supabase.from('scheduled_tasks').insert({
          title: 'SYSTEM_SHOPEE_NINJA_TOGGLE',
          prompt: 'System toggle for Shopee Ninja',
          is_active: true,
          interval_hours: 9999
        });
      }
    } catch (error) {
      console.error('Error fetching shopee queue:', error);
    } finally {
      setLoading(false);
    }
  };`;
code = code.replace(/const fetchData = async \(\) => \{[\s\S]*?setLoading\(false\);\n    \}\n  \};/, fetchDataReplacement);

// Add handleToggle function
if (!code.includes('handleToggleSystem')) {
  code = code.replace(/const handleAddQueue = async \(e\) => \{/, `const handleToggleSystem = async () => {
    setToggleLoading(true);
    try {
      const newState = !isSystemActive;
      const { error } = await supabase
        .from('scheduled_tasks')
        .update({ is_active: newState })
        .eq('title', 'SYSTEM_SHOPEE_NINJA_TOGGLE');
      
      if (error) throw error;
      setIsSystemActive(newState);
    } catch (error) {
      alert('Gagal mengubah status: ' + error.message);
    } finally {
      setToggleLoading(false);
    }
  };

  const handleAddQueue = async (e) => {`);
}

// Add Toggle Button UI
const buttonUI = `<button 
              onClick={handleToggleSystem}
              disabled={toggleLoading}
              className={\`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-lg \${isSystemActive ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}\`}
              title={isSystemActive ? 'Matikan Auto-Post' : 'Hidupkan Auto-Post'}
            >
              <Power className={\`w-4 h-4 \${toggleLoading ? 'animate-pulse' : ''}\`} /> {isSystemActive ? 'Sistem ON' : 'Sistem OFF'}
            </button>
            <button `;

code = code.replace(/<button [\s\S]*?onClick=\{fetchData\}/, buttonUI.replace('<button ', '<button onClick={fetchData}')); // small hack to inject before refresh button

fs.writeFileSync(dashPath, code);
console.log('ShopeeDashboard toggle patched!');
