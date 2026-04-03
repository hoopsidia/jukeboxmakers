// Lightweight Node.js proxy for the Claude preview panel.
// Forwards all requests to the FastAPI server running on port 8000.
import { createServer, request as httpRequest } from "http";

const TARGET = "127.0.0.1";
const TARGET_PORT = 8000;
const LISTEN_PORT = parseInt(process.env.PORT || "3111", 10);

const server = createServer((req, res) => {
  const opts = {
    hostname: TARGET,
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };
  const proxy = httpRequest(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxy.on("error", () => {
    res.writeHead(502);
    res.end("Backend not ready yet — refresh in a few seconds.");
  });
  req.pipe(proxy, { end: true });
});

server.listen(LISTEN_PORT, () => {
  console.log(`Preview proxy listening on http://localhost:${LISTEN_PORT} -> FastAPI :${TARGET_PORT}`);
});
