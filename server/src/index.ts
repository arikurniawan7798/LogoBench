import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const { port } = loadConfig();
createApp().listen(port, "127.0.0.1", () => {
  console.log(`LogoBench server listening on http://127.0.0.1:${port}`);
});
