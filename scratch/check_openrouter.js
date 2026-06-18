async function run() {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    const data = await res.json();
    const freeModels = data.data.filter(m => m.id.endsWith(":free") || m.pricing.prompt === "0");
    console.log("Free Models count:", freeModels.length);
    console.log(freeModels.map(m => m.id));
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
