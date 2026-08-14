import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
};

let server: Server | undefined;
let webRoot = "";

function sendFile(path: string, res: ServerResponse) {
  const ext = extname(path);
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  createReadStream(path).pipe(res);
}

function requestHandler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const filePath = normalize(join(webRoot, pathname));

  if (!filePath.startsWith(webRoot)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    sendFile(filePath, res);
    return;
  }

  // SPA fallback: serve index.html for client-side routes
  const indexFile = join(webRoot, "index.html");
  if (existsSync(indexFile)) {
    sendFile(indexFile, res);
    return;
  }

  res.writeHead(404).end("Not found");
}

/**
 * Start a local static file server for the bundled web frontend.
 * Returns the base URL the app should load.
 */
export async function startWebServer(root: string): Promise<string> {
  if (server) {
    stopWebServer();
  }

  webRoot = normalize(root);

  server = createServer(requestHandler);
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return `http://127.0.0.1:${port}/`;
}

export function stopWebServer() {
  if (server) {
    server.close();
    server = undefined;
  }
}
