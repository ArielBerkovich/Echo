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
        MessageCard: {
          type: "object",
          required: ["title", "url"],
          properties: {
            eyebrow: { type: "string", maxLength: 120, example: "Build #1842" },
            title: { type: "string", maxLength: 300, example: "Client production build failed" },
            description: { type: "string", maxLength: 1000 },
            url: { type: "string", format: "uri", maxLength: 2048 },
            color: { type: "string", description: "Named theme color or #RRGGBB", example: "red" },
            titleColor: { type: "string", description: "Named theme color or #RRGGBB", example: "red" },
            timestamp: { type: "string", format: "date-time", description: "Event time in ISO 8601 Zulu format ending in Z", example: "2026-09-10T10:15:00Z" },
            attributes: {
              type: "array",
              maxItems: 12,
              items: {
                type: "object",
                required: ["label", "value"],
                properties: {
                  label: { type: "string", maxLength: 64, example: "Status" },
                  value: { type: "string", maxLength: 400, example: "Failed" },
                  type: { type: "string", enum: ["text", "user"], default: "text" },
                },
              },
            },
          },
        },
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
      "/api/channels/{channelName}/messages": {
        post: {
          summary: "Send a message to a channel by name or id",
          parameters: [{ name: "channelName", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    body: { type: "string" },
                    parentId: { type: "string" },
                    attachments: { type: "array" },
                    card: { $ref: "#/components/schemas/MessageCard" },
                    survey: {
                      type: "object",
                      required: ["question", "options"],
                      properties: {
                        question: { type: "string", maxLength: 500 },
                        allowMultiple: { type: "boolean" },
                        options: { type: "array", minItems: 2, maxItems: 10, items: { type: "object", properties: { label: { type: "string" } } } },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Message created" } },
        },
      },
      "/api/users/{username}/messages": {
        post: {
          summary: "Send a direct message by username",
          parameters: [{ name: "username", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    body: { type: "string" },
                    parentId: { type: "string" },
                    attachments: { type: "array" },
                    card: { $ref: "#/components/schemas/MessageCard" },
                    survey: { $ref: "#/paths/~1api~1channels~1{channelName}~1messages/post/requestBody/content/application~1json/schema/properties/survey" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Direct message created" } },
        },
      },
      "/api/channels/{channelId}/messages/{messageId}/survey-vote": {
        post: {
          summary: "Vote on a survey",
          parameters: [
            { name: "channelId", in: "path", required: true, schema: { type: "string" } },
            { name: "messageId", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["optionIds"],
                  properties: { optionIds: { type: "array", items: { type: "string" } } },
                },
              },
            },
          },
          responses: { 200: { description: "Updated survey" }, 400: { description: "Invalid selection" } },
        },
      },
      "/api/channels/{channelId}/messages/{messageId}/reactions": {
        post: {
          summary: "Toggle an emoji reaction on a message",
          parameters: [
            { name: "channelId", in: "path", required: true, schema: { type: "string" } },
            { name: "messageId", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["emoji"],
                  properties: { emoji: { type: "string", maxLength: 64, example: "👍" } },
                },
              },
            },
          },
          responses: {
            200: { description: "Updated reaction summary" },
            400: { description: "Invalid emoji" },
            403: { description: "Access denied" },
            404: { description: "Message not found" },
          },
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
