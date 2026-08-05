import { readdir } from "node:fs/promises";

import { LocalObjectStorage } from "./local-storage";
import { createLocalMediaServer } from "./local-service";

async function status(): Promise<void> {
  const storage = new LocalObjectStorage();
  await storage.initialize();
  const entries = await readdir(storage.root, { recursive: true });
  const objectCount = entries.filter((entry) => entry.endsWith(".webp")).length;
  console.log(`Local synthetic media storage is ready (${objectCount} objects).`);
}

async function clean(): Promise<void> {
  const storage = new LocalObjectStorage();
  await storage.cleanTestRoot();
  console.log("Synthetic local media storage removed.");
}

async function serve(): Promise<void> {
  const port = Number(process.env.MEDIA_LOCAL_SERVICE_PORT || "43127");
  const server = createLocalMediaServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`nexi local media service ready on 127.0.0.1:${port}`);
  });
}

switch (process.argv[2]) {
  case "serve":
  case "process":
    await serve();
    break;
  case "status":
    await status();
    break;
  case "clean-test":
    await clean();
    break;
  default:
    throw new Error("Expected one command: serve, process, status or clean-test");
}
