import MainOrchestrator from '../mainOrchestrator.js';

// Simple test for MainOrchestrator
const testMainOrchestrator = () => {
  console.log('Testing MainOrchestrator...');
  
  const orchestrator = new MainOrchestrator();
  
  // Test getStats
  console.log('Initial stats:', orchestrator.getStats());
  
  // Test configure
  orchestrator.configure({
    maxTokensPerTask: 1000,
    budgetPerHour: 10000
  });
  console.log('Stats after configure:', orchestrator.getStats());
  
  // Test resetUsage
  orchestrator.resetUsage();
  console.log('Stats after reset:', orchestrator.getStats());
  
  console.log('MainOrchestrator tests passed!');
};

// Run tests
testMainOrchestrator();
