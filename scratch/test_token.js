import TokenSaverAgent from '../frontend/src/lib/tokenSaverAgent.js';

const agent = new TokenSaverAgent();
const task = {
  context: [{ role: 'user', content: 'Hello Mamet' }]
};

try {
  agent._estimateComplexity(task);
} catch (e) {
  console.log("RUNTIME STACK TRACE:");
  console.log(e.stack);
  console.log("\nVARIABLE VALUE:");
  console.log("task.context =", JSON.stringify(task.context));
}
