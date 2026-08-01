export function openApiDocument() {
  return {
    openapi: "3.0.3",
    info: {
      title: "Echo API",
      version: "0.1.0",
      description: "REST API for Echo messaging and incoming webhooks.",
    },
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        AutomationMessage: {
          type: "object",
          properties: {
            channelId: { type: "string" },
            channelName: { type: "string" },
            body: { type: "string" },
            text: { type: "string" },
            externalKey: { type: "string" },
            idempotencyKey: { type: "string" },
            threadKey: { type: "string" },
            status: { type: "string", example: "failed" },
            title: { type: "string", example: "Deploy failed" },
            fields: {
              oneOf: [
                { type: "object", additionalProperties: { type: "string" } },
                {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { name: { type: "string" }, value: { type: "string" } },
                  },
                },
              ],
            },
          },
        },
      },
    },
    paths: {
      "/api/health": {
        get: {
          security: [],
          summary: "Health check",
          responses: { 200: { description: "Server is running" } },
        },
      },
      "/api/openapi.json": {
        get: {
          security: [],
          summary: "OpenAPI document",
          responses: { 200: { description: "OpenAPI JSON" } },
        },
      },
      "/api/channels": {
        get: {
          summary: "List channels or browse the public channel catalog",
          parameters: [
            { name: "scope", in: "query", schema: { type: "string", enum: ["all"] } },
            { name: "catalog", in: "query", schema: { type: "string", enum: ["1"] } },
            { name: "q", in: "query", schema: { type: "string", maxLength: 100 } },
            {
              name: "membership",
              in: "query",
              schema: { type: "string", enum: ["all", "joined", "available"] },
            },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
            { name: "cursor", in: "query", schema: { type: "string" } },
          ],
          responses: {
            200: { description: "Channel list or paginated public-channel catalog" },
            400: { description: "Invalid cursor" },
          },
        },
      },
      "/api/channels/by-name/{name}": {
        get: {
          summary: "Find a channel by name",
          parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Channel info" }, 404: { description: "Not found" } },
        },
      },
      "/api/webhooks": {
        get: { summary: "List incoming webhooks", responses: { 200: { description: "Webhook list" } } },
        post: {
          summary: "Create an incoming webhook",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    channelId: { type: "string" },
                    channelName: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Webhook created; token returned once" } },
        },
      },
      "/api/webhooks/{token}": {
        post: {
          security: [],
          summary: "Post to an incoming webhook",
          parameters: [
            { name: "token", in: "path", required: true, schema: { type: "string" } },
            { name: "Idempotency-Key", in: "header", schema: { type: "string" } },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AutomationMessage" },
              },
            },
          },
          responses: { 200: { description: "Message updated/deduped" }, 201: { description: "Message created" } },
        },
      },
      "/api/webhooks/{id}": {
        delete: {
          summary: "Delete an incoming webhook",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Webhook deleted" } },
        },
      },
    },
  };
}
