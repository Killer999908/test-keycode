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
      },
      "/api/marketplace/list": {
        get: {
          tags: ["Marketplace"],
          summary: "List active marketplace listings",
          security: [],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "search", in: "query", schema: { type: "string" } }
          ],
          responses: {
            200: { description: "List of listings", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, listings: { type: "array" }, total: { type: "integer" }, page: { type: "integer" }, totalPages: { type: "integer" } } } } } },
            500: { description: "Server error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/marketplace/listings/{slug}": {
        get: {
          tags: ["Marketplace"],
          summary: "Get a marketplace listing by slug",
          security: [],
          parameters: [
            { name: "slug", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            200: { description: "Listing details", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, listing: { type: "object" } } } } } },
            404: { description: "Listing not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/marketplace/purchase": {
        post: {
          tags: ["Marketplace"],
          summary: "Purchase a marketplace listing",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["slug", "quantity"], properties: { slug: { type: "string" }, quantity: { type: "integer", minimum: 1 }, notes: { type: "string" } } } } }
          },
          responses: {
            201: { description: "Order created", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, order: { type: "object" } } } } } },
            400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            404: { description: "Listing not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/marketplace/my-orders": {
        get: {
          tags: ["Marketplace"],
          summary: "Get the current user's marketplace orders",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
            { name: "status", in: "query", schema: { type: "string", enum: ["pending", "paid", "fulfilled", "cancelled"] } }
          ],
          responses: {
            200: { description: "User's orders", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, orders: { type: "array" }, total: { type: "integer" }, page: { type: "integer" }, totalPages: { type: "integer" } } } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/teams/me": {
        get: {
          tags: ["Team"],
          summary: "Get the current user's team and role",
          responses: {
            200: { description: "Team membership", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, team: { type: "object" }, role: { type: "string" }, isOwner: { type: "boolean" }, membership: { type: "object" } } } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/teams": {
        get: {
          tags: ["Team"],
          summary: "List teams the current user belongs to",
          responses: {
            200: { description: "Teams list", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, teams: { type: "array" } } } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        },
        post: {
          tags: ["Team"],
          summary: "Create a new team",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, slug: { type: "string" }, description: { type: "string" } } } } }
          },
          responses: {
            201: { description: "Team created", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, team: { type: "object" } } } } } },
            400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/teams/{teamId}/invite": {
        post: {
          tags: ["Team"],
          summary: "Send an invite to a team",
          parameters: [
            { name: "teamId", in: "path", required: true, schema: { type: "string" } }
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" }, role: { type: "string", enum: ["admin", "member", "viewer"], default: "member" } } } } }
          },
          responses: {
            201: { description: "Invite sent", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, invite: { type: "object" } } } } } },
            400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            404: { description: "Team not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/teams/invites": {
        get: {
          tags: ["Team"],
          summary: "List invites for the current user",
          responses: {
            200: { description: "Invites list", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, invites: { type: "array" } } } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/teams/invites/{token}/accept": {
        post: {
          tags: ["Team"],
          summary: "Accept a team invite",
          parameters: [
            { name: "token", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            200: { description: "Invite accepted", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, team: { type: "object" } } } } } },
            404: { description: "Invite not found or expired", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/teams/invites/{token}/reject": {
        post: {
          tags: ["Team"],
          summary: "Reject a team invite",
          parameters: [
            { name: "token", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            200: { description: "Invite rejected", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" } } } } } },
            404: { description: "Invite not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/teams/{teamId}/members": {
        get: {
          tags: ["Team"],
          summary: "List members of a team",
          parameters: [
            { name: "teamId", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            200: { description: "Team members", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, team: { type: "object" }, members: { type: "array" } } } } } },
            403: { description: "Not a member", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            404: { description: "Team not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/teams/{teamId}/members/{userId}": {
        delete: {
          tags: ["Team"],
          summary: "Remove a member from a team",
          parameters: [
            { name: "teamId", in: "path", required: true, schema: { type: "string" } },
            { name: "userId", in: "path", required: true, schema: { type: "string" } }
          ],
          responses: {
            200: { description: "Member removed", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" } } } } } },
            400: { description: "Cannot remove owner/self", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            403: { description: "Forbidden", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            404: { description: "Team or member not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/analytics/overview": {
        get: {
          tags: ["Analytics"],
          summary: "Analytics overview (user-scoped; admin may request ?scope=global)",
          parameters: [
            { name: "scope", in: "query", schema: { type: "string", enum: ["user", "global"], default: "user" } }
          ],
          responses: {
            200: { description: "Analytics overview", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, scope: { type: "string" }, overview: { type: "object" }, ordersByStatus: { type: "object" }, monthlyRevenue: { type: "array" }, dailyOrders: { type: "array" }, projectBreakdown: { type: "object" }, recentActivity: { type: "array" }, period: { type: "object" } } } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/analytics/projects": {
        get: {
          tags: ["Analytics"],
          summary: "Analytics projects breakdown by type and status",
          responses: {
            200: { description: "Projects analytics", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, byType: { type: "object" }, byStatus: { type: "object" }, recent: { type: "array" }, total: { type: "integer" }, period: { type: "object" } } } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/analytics/activity": {
        get: {
          tags: ["Analytics"],
          summary: "Analytics activity stream (projects + orders)",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } }
          ],
          responses: {
            200: { description: "Activity events", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, events: { type: "array" }, total: { type: "integer" } } } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/settings/preferences": {
        get: {
          tags: ["Settings"],
          summary: "Get current user preferences",
          responses: {
            200: { description: "User preferences", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, preferences: { type: "object" } } } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        },
        put: {
          tags: ["Settings"],
          summary: "Save user preferences",
          requestBody: {
            required: false,
            content: { "application/json": { schema: { type: "object" } } }
          },
          responses: {
            200: { description: "Preferences saved", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, preferences: { type: "object" } } } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/settings/notifications": {
        get: {
          tags: ["Settings"],
          summary: "Get notification preferences and recent notifications",
          responses: {
            200: { description: "Notification settings", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, notifications: { type: "object" }, unreadCount: { type: "integer" }, recent: { type: "array" } } } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        },
        put: {
          tags: ["Settings"],
          summary: "Update notification preferences",
          requestBody: {
            required: false,
            content: { "application/json": { schema: { type: "object", properties: { notifications: { type: "object" } } } } }
          },
          responses: {
            200: { description: "Notification preferences saved", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, notifications: { type: "object" } } } } } },
            400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/settings/profile": {
        get: {
          tags: ["Settings"],
          summary: "Get user profile (extended settings shape)",
          responses: {
            200: { description: "User profile", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, profile: { type: "object" }, preferences: { type: "object" } } } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        },
        put: {
          tags: ["Settings"],
          summary: "Update profile fields",
          requestBody: {
            required: false,
            content: { "application/json": { schema: { type: "object", properties: { name: { type: "string", minLength: 2, maxLength: 100 }, phone: { type: "string" }, avatar: { type: "string" }, social: { type: "object" } } } } }
          },
          responses: {
            200: { description: "Profile updated", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, profile: { type: "object" } } } } } },
            400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }
          }
        }
      },
      "/api/settings/ping": {
        post: {
          tags: ["Settings"],
          summary: "Refresh the user's lastLogin timestamp",
          responses: {
            200: { description: "Ping acknowledged", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, ts: { type: "string" } } } } } },
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
