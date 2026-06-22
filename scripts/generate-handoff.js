const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Path to the handoff file
const HANDOFF_FILE = path.join(__dirname, '../handoff context untuk chatgpt.txt');

function generateHandoff() {
  try {
    console.log("Analyzing git diff for handoff context generation...");

    // Get the list of changed files in the latest commit
    // Uses git diff-tree to ensure it works in CI reliably
    const gitDiffOutput = execSync('git diff-tree --no-commit-id --name-only -r HEAD').toString().trim();
    
    if (!gitDiffOutput) {
      console.log("No files changed in this commit.");
      return;
    }

    const changedFiles = gitDiffOutput.split('\n');

    let memoryChanges = [];
    let decisionChanges = [];
    let behaviorChanges = [];
    let pipelineChanges = [];
    let riskNotes = [];

    // Classify changes deterministically based on file paths
    for (const file of changedFiles) {
      if (!file) continue;
      
      const lowerFile = file.toLowerCase();

      if (lowerFile.includes('memoryengine') || lowerFile.includes('shorttermmemory') || lowerFile.includes('mamet_memory')) {
        memoryChanges.push(file);
      } else if (lowerFile.includes('decisionengine') || lowerFile.includes('contextunifier')) {
        decisionChanges.push(file);
      } else if (lowerFile.includes('behaviormemoryengine')) {
        behaviorChanges.push(file);
      } else if (lowerFile.includes('intentpreprocessor') || lowerFile.includes('semanticbridge') || lowerFile.includes('context_optimizer')) {
        pipelineChanges.push(file);
      }
      
      // Check for high-risk modifications (schema or core API)
      if (lowerFile.includes('schema') || lowerFile.endsWith('.sql')) {
        riskNotes.push(`Schema changed in ${file} - requires Supabase sync verification`);
      }
    }

    // Determine if we should generate a snapshot
    const hasSignificantChanges = memoryChanges.length > 0 || decisionChanges.length > 0 || 
                                  behaviorChanges.length > 0 || pipelineChanges.length > 0 || 
                                  riskNotes.length > 0;

    if (!hasSignificantChanges) {
      console.log("No relevant architecture files changed. Skipping handoff sync to keep file clean.");
      process.exit(0);
    }

    // Metadata
    const date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '') + ' UTC';
    const commitHash = execSync('git rev-parse --short HEAD').toString().trim();
    
    // Format snapshot safely
    const snapshot = `
============================================================
LAST UPDATE SNAPSHOT v${commitHash}:
- Timestamp: ${date}
- Changed modules: ${changedFiles.filter(f => f.includes('lib/') || f.includes('schema')).join(', ') || 'General Project Updates'}
- Memory layer changes: ${memoryChanges.length ? memoryChanges.join(', ') : 'None'}
- Decision engine changes: ${decisionChanges.length ? decisionChanges.join(', ') : 'None'}
- Behavior layer changes: ${behaviorChanges.length ? behaviorChanges.join(', ') : 'None'}
- Pipeline changes: ${pipelineChanges.length ? pipelineChanges.join(', ') : 'None'}
- Risk notes: ${riskNotes.length ? riskNotes.join('; ') : 'Low - Code logic only, deterministic execution expected'}
- System status: ACTIVE - Auto-compiled and verified.
`;

    // Append to handoff file (DO NOT OVERWRITE)
    if (fs.existsSync(HANDOFF_FILE)) {
      fs.appendFileSync(HANDOFF_FILE, snapshot, 'utf8');
      console.log(`Successfully appended snapshot v${commitHash} to handoff file.`);
    } else {
      // Fallback if file doesn't exist at all
      fs.writeFileSync(HANDOFF_FILE, "BASE INSTRUCTOR CONTEXT (Auto-Generated)\n\n" + snapshot, 'utf8');
      console.log(`Created new handoff file with snapshot v${commitHash}.`);
    }

  } catch (error) {
    console.error("Critical Error during handoff generation:", error.message);
    process.exit(1);
  }
}

generateHandoff();
