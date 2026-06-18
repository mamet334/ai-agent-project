async function run() {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    const data = await res.json();
    const claudeModels = data.data.filter(m => m.id.includes("claude"));
    console.log("Claude Models:");
    console.log(claudeModels.map(m => ({ id: m.id, name: m.name })));
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
