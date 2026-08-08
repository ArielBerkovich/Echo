import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { register } from "prom-client";
import { describe, it } from "node:test";
import {
  activeConnections,
  httpRequestDuration,
  httpRequests,
  httpMetricsMiddleware,
  metricsHandler,
  processUptime,
  recordSocketError,
  socketErrors,
} from "./metrics.js";

describe("Prometheus metrics", () => {
  it("records completed HTTP requests using the normalized route", async () => {
    httpRequests.reset();
    httpRequestDuration.reset();

    const request = {
      method: "GET",
      path: "/api/health",
      baseUrl: "/api",
      route: { path: "/health" },
    };
    const response = Object.assign(new EventEmitter(), { statusCode: 200 });

    httpMetricsMiddleware(request as any, response as any, () => response.emit("finish"));

    const output = await register.metrics();
    assert.match(output, /echo_http_requests_total\{[^}]*method="GET"[^}]*route="\/api\/health"[^}]*status_code="200"[^}]*\} 1/);
    assert.match(output, /echo_http_request_duration_seconds_count\{[^}]*method="GET"[^}]*route="\/api\/health"[^}]*\} 1/);
  });

  it("records socket error types", async () => {
    socketErrors.reset();

    recordSocketError("message_send");

    const output = await register.metrics();
    assert.match(output, /echo_socket_errors_total\{type="message_send"\} 1/);
  });

  it("exports the instance gauges", async () => {
    activeConnections.set(3);

    const output = await register.metrics();
    assert.match(output, /echo_active_connections 3/);
    assert.match(output, /echo_process_uptime_seconds /);
  });

  it("supports protecting the metrics endpoint with a bearer token", async () => {
    const previousToken = process.env.METRICS_TOKEN;
    process.env.METRICS_TOKEN = "test-metrics-token";

    try {
      const response = {
        statusCode: 200,
        headers: {},
        body: "",
        setHeader(name: string, value: string) {
          this.headers[name] = value;
        },
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        end(body = "") {
          this.body = body;
        },
      };
      const request = { get: () => undefined };

      await metricsHandler(request as any, response as any, () => {});
      assert.equal(response.statusCode, 401);

      response.statusCode = 200;
      request.get = () => "Bearer test-metrics-token";
      await metricsHandler(request as any, response as any, () => {});
      assert.equal(response.statusCode, 200);
      assert.match(response.body, /# HELP echo_/);
    } finally {
      if (previousToken === undefined) delete process.env.METRICS_TOKEN;
      else process.env.METRICS_TOKEN = previousToken;
    }
  });
});
