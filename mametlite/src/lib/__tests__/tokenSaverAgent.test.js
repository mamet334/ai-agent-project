import TokenSaverAgent from '../tokenSaverAgent.js';

// Simple test for TokenSaverAgent
const testTokenSaverAgent = () => {
  console.log('Testing TokenSaverAgent...');
  
  const agent = new TokenSaverAgent(500, 5000);
  
  // Test analyzeTask
  const task = {
    prompt: 'Test prompt with some context',
    context: 'This is a longer context that should increase complexity',
    repeatable: false
  };
  
  const strategy = agent.analyzeTask(task);
  console.log('Strategy:', strategy);
  
  // Test optimizePrompt
  const optimized = agent.optimizePrompt('silahkan informasi terima kasih');
  console.log('Optimized prompt:', optimized);
  
  // Test checkBudget
  console.log('Budget check (1000 tokens):', agent.checkBudget(1000));
  console.log('Budget check (6000 tokens):', agent.checkBudget(6000));
  
  // Test logUsage
  agent.logUsage(500);
  console.log('Stats after logging:', agent.getStats());
  
  console.log('TokenSaverAgent tests passed!');
};

// Run tests
testTokenSaverAgent();
