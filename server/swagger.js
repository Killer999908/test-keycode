import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "KEYCODE Studio API",
      version: "1.0.0",
      description: "AI-powered digital design platform API"
    },
    servers: [
      { url: "http://localhost:5000", description: "Development server" }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "apiKey",
          in: "header",
          name: "Authorization",
          description: "Bearer JWT token"
        }
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        },
        HealthResponse: {
          type: "object",
          properties: {
            status: { type: "string" },
            uptime: { type: "number" },
            timestamp: { type: "string" }
          }
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 }
          }
        },
        LoginResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            token: { type: "string" },
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                email: { type: "string" },
                role: { type: "string" }
              }
            }
          }
        },
        RegisterRequest: {
          type: "object",
          required: ["name", "email", "password"],
          properties: {
            name: { type: "string" },
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
            phone: { type: "string" }
          }
        },
        RegisterResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            token: { type: "string" },
            user: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                email: { type: "string" },
                role: { type: "string" }
              }
            }
          }
        },
        AiGenerateRequest: {
          type: "object",
          required: ["prompt"],
          properties: {
            prompt: { type: "string" },
            model: { type: "string" },
            temperature: { type: "number" },
            maxTokens: { type: "integer" }
          }
        },
        AiGenerateResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            result: { type: "string" },
            model: { type: "string" }
          }
        },
        AiChatRequest: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string" },
            conversationId: { type: "string" },
            context: { type: "string" }
          }
        },
        AiChatResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            reply: { type: "string" },
            conversationId: { type: "string" }
          }
        },
        OrderListResponse: {
          type: "array",
          items: {
            type: "object",
            properties: {
              _id: { type: "string" },
              status: { type: "string" },
              total: { type: "number" },
              createdAt: { type: "string", format: "date-time" }
            }
          }
        },
        ServiceListResponse: {
          type: "array",
          items: {
            type: "object",
            properties: {
              _id: { type: "string" },
              name: { type: "string" },
              slug: { type: "string" },
              category: { type: "string" },
              basePrice: { type: "number" },
              description: { type: "string" }
            }
          }
        },
        UserProfileResponse: {
          type: "object",
          properties: {
            user: {
              type: "object",
              properties: {
                _id: { type: "string" },
                name: { type: "string" },
                email: { type: "string" },
                role: { type: "string" },
                avatar: { type: "string" }
              }
            }
          }
        }
      }
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/health": {
        get: {
          tags: ["Health"],
          summary: "Health check endpoint",
          security: [],
          responses: {
            200: {
              description: "Server is healthy",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HealthResponse" } } }
            }
          }
        }
      },
      "/api/auth/login": {
        post: {
          tags: ["Authentication"],
          summary: "Login with email and password",
          security: [],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } }
          },
          responses: {
            200: { description: "Login successful", content: { "application/json": { schema: { $ref: "#/components/schemas/LoginResponse" } } } },
            401: { description: "Invalid credentials", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/auth/register": {
        post: {
          tags: ["Authentication"],
          summary: "Register a new user",
          security: [],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterRequest" } } }
          },
          responses: {
            201: { description: "User registered successfully", content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterResponse" } } } },
            400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/ai/generate-website": {
        post: {
          tags: ["AI Generation"],
          summary: "Generate a website from a prompt",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/AiGenerateRequest" } } }
          },
          responses: {
            200: { description: "Website generated", content: { "application/json": { schema: { $ref: "#/components/schemas/AiGenerateResponse" } } } },
            400: { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/ai/cad-design": {
        post: {
          tags: ["AI Generation"],
          summary: "Generate a CAD design from a prompt",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/AiGenerateRequest" } } }
          },
          responses: {
            200: { description: "CAD design generated", content: { "application/json": { schema: { $ref: "#/components/schemas/AiGenerateResponse" } } } },
            400: { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/ai/pcb-design": {
        post: {
          tags: ["AI Generation"],
          summary: "Generate a PCB design from a prompt",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/AiGenerateRequest" } } }
          },
          responses: {
            200: { description: "PCB design generated", content: { "application/json": { schema: { $ref: "#/components/schemas/AiGenerateResponse" } } } },
            400: { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/ai/arduino-code": {
        post: {
          tags: ["AI Generation"],
          summary: "Generate Arduino/MCU code from a prompt",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/AiGenerateRequest" } } }
          },
          responses: {
            200: { description: "Arduino code generated", content: { "application/json": { schema: { $ref: "#/components/schemas/AiGenerateResponse" } } } },
            400: { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/ai/code-review": {
        post: {
          tags: ["AI Generation"],
          summary: "Review code with AI",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/AiGenerateRequest" } } }
          },
          responses: {
            200: { description: "Code review complete", content: { "application/json": { schema: { $ref: "#/components/schemas/AiGenerateResponse" } } } },
            400: { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/ai/chat": {
        post: {
          tags: ["AI Generation"],
          summary: "Chat with AI assistant",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/AiChatRequest" } } }
          },
          responses: {
            200: { description: "AI chat response", content: { "application/json": { schema: { $ref: "#/components/schemas/AiChatResponse" } } } },
            400: { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/ai/orchestrate": {
        post: {
          tags: ["AI Generation"],
          summary: "Orchestrate multi-step AI generation",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/AiGenerateRequest" } } }
          },
          responses: {
            200: { description: "Orchestration result", content: { "application/json": { schema: { $ref: "#/components/schemas/AiGenerateResponse" } } } },
            400: { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/ai/analyze": {
        post: {
          tags: ["AI Generation"],
          summary: "Analyze input with AI",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/AiGenerateRequest" } } }
          },
          responses: {
            200: { description: "Analysis result", content: { "application/json": { schema: { $ref: "#/components/schemas/AiGenerateResponse" } } } },
            400: { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/orders": {
        get: {
          tags: ["Orders"],
          summary: "Get current user's orders",
          responses: {
            200: { description: "List of orders", content: { "application/json": { schema: { $ref: "#/components/schemas/OrderListResponse" } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/services": {
        get: {
          tags: ["Services"],
          summary: "Get all active services",
          security: [],
          responses: {
            200: { description: "List of services", content: { "application/json": { schema: { $ref: "#/components/schemas/ServiceListResponse" } } } }
          }
        }
      },
      "/api/user/profile": {
        get: {
          tags: ["User"],
          summary: "Get current user profile",
          responses: {
            200: { description: "User profile", content: { "application/json": { schema: { $ref: "#/components/schemas/UserProfileResponse" } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      }
    }
  },
  apis: []
};

export function generateSpec() {
  return swaggerJsdoc(options);
}
