const fs = require('fs');
const path = require('path');

const cronPath = path.join(__dirname, '../supabase/functions/cron-agent/index.ts');
let code = fs.readFileSync(cronPath, 'utf8');

// Insert the check right before processing shopee_queue
const targetPoint = /\/\/ 3\. Proses Antrean Shopee Affiliate/;
const logicToInsert = `// Cek Master Switch Shopee Ninja
    const { data: toggleData } = await supabase
      .from('scheduled_tasks')
      .select('is_active')
      .eq('title', 'SYSTEM_SHOPEE_NINJA_TOGGLE')
      .limit(1)
      .maybeSingle();
      
    const isShopeeNinjaEnabled = toggleData ? toggleData.is_active : true;

    if (!isShopeeNinjaEnabled) {
      console.log('Shopee Ninja is globally DISABLED via dashboard. Skipping processing.');
    } else {
      console.log('Shopee Ninja is ENABLED.');
    }

    // 3. Proses Antrean Shopee Affiliate`;

if (!code.includes('SYSTEM_SHOPEE_NINJA_TOGGLE')) {
  code = code.replace(targetPoint, logicToInsert);
  
  // Wrap step 3 and 4 inside the condition
  // We'll just replace "if (!isStealthSkip) {" with "if (isShopeeNinjaEnabled && !isStealthSkip) {"
  // and for step 4 auto discovery: "if ((pendingCount || 0) < 3) {" with "if (isShopeeNinjaEnabled && (pendingCount || 0) < 3) {"
  
  code = code.replace(/if \(\!isStealthSkip\) \{/, 'if (isShopeeNinjaEnabled && !isStealthSkip) {');
  code = code.replace(/if \(\(pendingCount \|\| 0\) < 3\) \{/, 'if (isShopeeNinjaEnabled && (pendingCount || 0) < 3) {');
  
  fs.writeFileSync(cronPath, code);
  console.log('Cron Agent patched to respect toggle switch!');
} else {
  console.log('Already patched.');
}
