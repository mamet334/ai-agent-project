const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../supabase/functions/agent-process/index.ts');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Safe JSON Parser at the top
code = code.replace(
  'const corsHeaders = {',
  `const safeJsonParse = (text, fallback = []) => {
  try {
    if(!text) return fallback;
    const match = text.match(/\\[[\\s\\S]*\\]/) || text.match(/\\{[\\s\\S]*\\}/);
    if(match) return JSON.parse(match[0].replace(/,\\s*([\\]}])/g, '$1'));
    return JSON.parse(text);
  } catch (e) {
    console.error('Safe JSON parse failed', e);
    return fallback;
  }
};

const corsHeaders = {`
);

// 2. Add AbortSignal.timeout(15000) to fetch calls in non-stream functions
// We can use a simpler replacement for fetch inside these functions.
// Let's just find specific fetch calls and append the signal
code = code.replace(
  /body: JSON\.stringify\(payload\)\n\s*}\);/g,
  `body: JSON.stringify(payload),\n          signal: AbortSignal.timeout(15000)\n        });`
);

code = code.replace(
  /body: JSON\.stringify\(\{([\s\S]*?)temperature: 0\.1\n\s*\}\)/g,
  (match, p1) => {
    // Check if it's not a streaming call
    if (match.includes('stream: true')) return match;
    return `body: JSON.stringify({${p1}temperature: 0.1\n        }),\n        signal: AbortSignal.timeout(15000)`;
  }
);

// 3. Replace JSON.parse(planText) with safeJsonParse(planText, [])
code = code.replace(/plan = JSON\.parse\(planText\);/g, 'plan = safeJsonParse(planText, []);');

// 4. Remove Mamet Healer JSON fixer block
const healerBlock = `      } catch (err) {
        console.error("Mamet Healer: Mendeteksi format JSON rusak. Memperbaiki...");
        // --- MAMET HEALER (DOKTER BEDAH LOGIKA) ---
        const jsonMatch = planText.match(/\\[[\\s\\S]*\\]/);
        if (jsonMatch) {
          try {
            plan = JSON.parse(jsonMatch[0].replace(/,\\s*\\]/g, ']'));
            console.log("Mamet Healer: Berhasil memperbaiki JSON!");
          } catch(e) {
            console.error("Mamet Healer: Gagal memperbaiki JSON, sub-agent dibatalkan.");
            plan = [];
          }
        }
      }`;
code = code.replace(healerBlock, `      } catch (err) { console.error("Coordinator Error:", err); plan = []; }`);

// 5. Change HTTP 500 to 200 with fallback_response
code = code.replace(
  /return new Response\(JSON\.stringify\(\{ error: error\.message \}\), \{\n\s*status: 500,\n\s*headers: \{ \.\.\.corsHeaders, 'Content-Type': 'application\/json' \},\n\s*\}\);/,
  `return new Response(JSON.stringify({ success: false, error: error.message || String(error), fallback_response: "Maaf, sistem AI sedang mengalami gangguan sementara. Kami telah menstabilkan koneksi, silakan coba lagi." }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });`
);

fs.writeFileSync(filePath, code);
console.log('index.ts patched successfully!');
