import express, { type Request, type Response, type NextFunction } from "express";
import { Counter, Gauge, Histogram, register } from "prom-client";

export const httpRequests = new Counter({
  name: "echo_http_requests_total",
  help: "Total number of HTTP requests handled by Echo.",
  labelNames: ["method", "route", "status_code"],
});

export const httpRequestDuration = new Histogram({
  name: "echo_http_request_duration_seconds",
  help: "HTTP request duration in seconds.",
  labelNames: ["method", "route"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const activeConnections = new Gauge({
  name: "echo_active_connections",
  help: "Number of active Socket.IO connections on this server instance.",
});

export const socketErrors = new Counter({
  name: "echo_socket_errors_total",
  help: "Total number of Socket.IO errors on this server instance.",
  labelNames: ["type"],
});

export function recordSocketError(type: string) {
  socketErrors.inc({ type });
}

export const processUptime = new Gauge({
  name: "echo_process_uptime_seconds",
  help: "Time that the Echo process has been running in seconds.",
  collect() {
    this.set(process.uptime());
  },
});

function routeLabel(req: Request) {
  const route = req.route?.path;
  if (!route) return "unmatched";
  return `${req.baseUrl || ""}${Array.isArray(route) ? route[0] : route}`;
}

export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/metrics") return next();

  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const route = routeLabel(req);
    const method = req.method;
    httpRequests.inc({ method, route, status_code: String(res.statusCode) });
    httpRequestDuration.observe(
      { method, route },
      Number(process.hrtime.bigint() - startedAt) / 1e9
    );
  });

  next();
}

export async function metricsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    res.setHeader("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    next(err);
  }
}

export function createMetricsApp() {
  const app = express();
  app.get("/metrics", metricsHandler);
  return app;
}
