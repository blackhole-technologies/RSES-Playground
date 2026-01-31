/**
 * @file agent-executor.ts
 * @description Agent Execution Engine for AI Personal Assistant
 * @phase Phase 11 - AI Personal Assistant
 * @author AI/ML Expert Agent
 * @created 2026-02-01
 *
 * Executes agents and manages tool calls.
 * Implements ReAct (Reasoning and Acting) pattern.
 */

import { EventEmitter } from "events";
import {
  AgentConfig,
  AgentTool,
  AGENT_REGISTRY,
  getAgentConfig,
} from "./agent-config";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Agent execution context.
 */
export interface ExecutionContext {
  userId: string;
  sessionId: string;
  conversationHistory: Message[];
  variables: Map<string, unknown>;
  metadata: Record<string, unknown>;
}

/**
 * Message in conversation.
 */
export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  timestamp: Date;
}

/**
 * Tool call request.
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool execution result.
 */
export interface ToolResult {
  callId: string;
  success: boolean;
  output: unknown;
  error?: string;
}

/**
 * Agent execution result.
 */
export interface ExecutionResult {
  agentId: string;
  success: boolean;
  response: string;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  reasoning?: string;
  metadata: Record<string, unknown>;
  executionTimeMs: number;
}

/**
 * Tool handler function type.
 */
export type ToolHandler = (
  args: Record<string, unknown>,
  context: ExecutionContext
) => Promise<unknown>;

// =============================================================================
// TOOL REGISTRY
// =============================================================================

/**
 * Registry of tool handlers.
 */
class ToolRegistry {
  private handlers: Map<string, ToolHandler> = new Map();

  register(name: string, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  get(name: string): ToolHandler | undefined {
    return this.handlers.get(name);
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  getAll(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// Global tool registry
const toolRegistry = new ToolRegistry();

/**
 * Register a tool handler.
 */
export function registerToolHandler(name: string, handler: ToolHandler): void {
  toolRegistry.register(name, handler);
}

// =============================================================================
// AGENT EXECUTOR
// =============================================================================

/**
 * Executes agent requests using the ReAct pattern.
 */
export class AgentExecutor extends EventEmitter {
  private maxIterations: number;
  private timeoutMs: number;

  constructor(options: { maxIterations?: number; timeoutMs?: number } = {}) {
    super();
    this.maxIterations = options.maxIterations || 10;
    this.timeoutMs = options.timeoutMs || 30000;
  }

  /**
   * Execute an agent with the given input.
   */
  async execute(
    agentId: string,
    input: string,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const agent = getAgentConfig(agentId);

    if (!agent) {
      return {
        agentId,
        success: false,
        response: `Agent ${agentId} not found`,
        toolCalls: [],
        toolResults: [],
        metadata: {},
        executionTimeMs: Date.now() - startTime,
      };
    }

    this.emit("execution:start", { agentId, input });

    const toolCalls: ToolCall[] = [];
    const toolResults: ToolResult[] = [];
    let currentIteration = 0;
    let shouldContinue = true;
    let finalResponse = "";
    let reasoning = "";

    // Build initial messages
    const messages: Message[] = [
      {
        role: "system",
        content: this.buildSystemPrompt(agent, context),
        timestamp: new Date(),
      },
      ...context.conversationHistory,
      {
        role: "user",
        content: input,
        timestamp: new Date(),
      },
    ];

    try {
      while (shouldContinue && currentIteration < this.maxIterations) {
        currentIteration++;

        // Generate agent response (simulated)
        const response = await this.generateResponse(agent, messages);

        // Check if we need to call tools
        if (response.toolCalls && response.toolCalls.length > 0) {
          for (const toolCall of response.toolCalls) {
            toolCalls.push(toolCall);

            // Execute tool
            const result = await this.executeTool(toolCall, context);
            toolResults.push(result);

            // Add tool result to messages
            messages.push({
              role: "tool",
              content: JSON.stringify(result.output),
              toolResult: result,
              timestamp: new Date(),
            });
          }

          // Continue to next iteration to process tool results
        } else {
          // No tool calls, we have the final response
          finalResponse = response.content;
          reasoning = response.reasoning || "";
          shouldContinue = false;
        }

        this.emit("iteration:complete", {
          agentId,
          iteration: currentIteration,
          toolCalls: response.toolCalls?.length || 0,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        agentId,
        success: false,
        response: `Execution error: ${errorMessage}`,
        toolCalls,
        toolResults,
        metadata: { error: errorMessage },
        executionTimeMs: Date.now() - startTime,
      };
    }

    const result: ExecutionResult = {
      agentId,
      success: true,
      response: finalResponse,
      toolCalls,
      toolResults,
      reasoning,
      metadata: {
        iterations: currentIteration,
        toolCallCount: toolCalls.length,
      },
      executionTimeMs: Date.now() - startTime,
    };

    this.emit("execution:complete", result);

    return result;
  }

  /**
   * Build the system prompt with context.
   */
  private buildSystemPrompt(agent: AgentConfig, context: ExecutionContext): string {
    let prompt = agent.prompts.system;

    // Add tool descriptions
    if (agent.tools.length > 0) {
      prompt += "\n\nAvailable tools:\n";
      for (const tool of agent.tools) {
        prompt += `\n- ${tool.name}: ${tool.description}`;
        if (tool.parameters.length > 0) {
          prompt += "\n  Parameters:";
          for (const param of tool.parameters) {
            prompt += `\n    - ${param.name} (${param.type}${param.required ? ", required" : ""}): ${param.description}`;
          }
        }
      }
    }

    // Apply context template
    const contextPrompt = agent.prompts.contextTemplate
      .replace("{{userName}}", String(context.variables.get("userName") || "User"))
      .replace("{{timezone}}", String(context.variables.get("timezone") || "UTC"))
      .replace("{{preferences}}", JSON.stringify(context.variables.get("preferences") || {}))
      .replace("{{memories}}", String(context.variables.get("memories") || "None"))
      .replace("{{currentTopic}}", String(context.variables.get("currentTopic") || "General"))
      .replace("{{activeEntities}}", String(context.variables.get("activeEntities") || "None"))
      .replace("{{pendingActions}}", String(context.variables.get("pendingActions") || "None"))
      .replace("{{conversationHistory}}", "See previous messages");

    return prompt + "\n\n" + contextPrompt;
  }

  /**
   * Generate a response from the agent (simulated).
   * In production, this would call the actual LLM API.
   */
  private async generateResponse(
    agent: AgentConfig,
    messages: Message[]
  ): Promise<{
    content: string;
    toolCalls?: ToolCall[];
    reasoning?: string;
  }> {
    // Simulate API latency
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    const input = lastUserMessage?.content.toLowerCase() || "";

    // Check for tool-requiring patterns
    if (input.includes("schedule") || input.includes("meeting")) {
      return {
        content: "",
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: "create_event",
            arguments: {
              title: "Meeting",
              startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
            },
          },
        ],
        reasoning: "User wants to schedule a meeting. Using create_event tool.",
      };
    }

    if (input.includes("task") || input.includes("remind")) {
      return {
        content: "",
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: "create_task",
            arguments: {
              title: "New task from conversation",
              priority: "medium",
            },
          },
        ],
        reasoning: "User wants to create a task or reminder. Using create_task tool.",
      };
    }

    if (input.includes("calendar") || input.includes("events")) {
      return {
        content: "",
        toolCalls: [
          {
            id: `call_${Date.now()}`,
            name: "list_events",
            arguments: {
              startDate: new Date().toISOString(),
              endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
          },
        ],
        reasoning: "User wants to see their calendar. Using list_events tool.",
      };
    }

    // Default response without tools
    return {
      content: this.generateDefaultResponse(agent, input),
    };
  }

  /**
   * Generate a default response based on agent type.
   */
  private generateDefaultResponse(agent: AgentConfig, input: string): string {
    switch (agent.id) {
      case "conversation":
        if (input.includes("help")) {
          return `I can help you with:
- **Calendar**: Schedule, view, and manage meetings
- **Tasks**: Create and track your to-do items
- **Content**: Create, edit, and publish content
- **Workflows**: Automate repetitive tasks

What would you like to do?`;
        }
        return `I understand you said: "${input}". How can I help you with that?`;

      case "calendar":
        return "I can help you manage your calendar. Would you like to schedule an event, check your availability, or view upcoming meetings?";

      case "task":
        return "I can help you manage your tasks. Would you like to create a new task, see your to-do list, or check on overdue items?";

      case "voice":
        return "Voice processing is ready. Please speak your command.";

      case "notification":
        return "I can send you notifications or create suggestions. What would you like to be notified about?";

      case "coordinator":
        return "I'll coordinate the appropriate agents to handle your request.";

      default:
        return "I'm here to help. What would you like to do?";
    }
  }

  /**
   * Execute a tool call.
   */
  private async executeTool(
    toolCall: ToolCall,
    context: ExecutionContext
  ): Promise<ToolResult> {
    const handler = toolRegistry.get(toolCall.name);

    if (!handler) {
      return {
        callId: toolCall.id,
        success: false,
        output: null,
        error: `Tool handler not found: ${toolCall.name}`,
      };
    }

    try {
      const output = await handler(toolCall.arguments, context);
      return {
        callId: toolCall.id,
        success: true,
        output,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        callId: toolCall.id,
        success: false,
        output: null,
        error: errorMessage,
      };
    }
  }
}

// =============================================================================
// MULTI-AGENT COORDINATOR
// =============================================================================

/**
 * Coordinates multiple agents for complex requests.
 */
export class MultiAgentCoordinator extends EventEmitter {
  private executor: AgentExecutor;

  constructor() {
    super();
    this.executor = new AgentExecutor();
  }

  /**
   * Route a request to the appropriate agent(s).
   */
  async route(
    input: string,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    // Analyze input to determine which agent(s) to use
    const agentId = this.determineAgent(input);

    // Execute the selected agent
    return this.executor.execute(agentId, input, context);
  }

  /**
   * Execute a multi-step plan across agents.
   */
  async executePlan(
    plan: ExecutionPlan,
    context: ExecutionContext
  ): Promise<PlanResult> {
    const stepResults: ExecutionResult[] = [];
    const variables = new Map(context.variables);

    for (const step of plan.steps) {
      // Check dependencies
      if (step.dependsOn) {
        const dependencyMet = step.dependsOn.every((depId) =>
          stepResults.some((r) => r.agentId === depId && r.success)
        );

        if (!dependencyMet) {
          stepResults.push({
            agentId: step.agentId,
            success: false,
            response: "Dependencies not met",
            toolCalls: [],
            toolResults: [],
            metadata: { skipped: true },
            executionTimeMs: 0,
          });
          continue;
        }
      }

      // Update context with accumulated variables
      const stepContext: ExecutionContext = {
        ...context,
        variables,
      };

      // Execute step
      const result = await this.executor.execute(
        step.agentId,
        step.input,
        stepContext
      );

      stepResults.push(result);

      // Store output for dependent steps
      if (result.success && step.outputVariable) {
        variables.set(step.outputVariable, result.response);
      }

      // Stop on failure if required
      if (!result.success && step.stopOnFailure) {
        break;
      }
    }

    return {
      success: stepResults.every((r) => r.success),
      stepResults,
      finalResponse: this.aggregateResponses(stepResults),
    };
  }

  /**
   * Determine which agent should handle the input.
   */
  private determineAgent(input: string): string {
    const lowerInput = input.toLowerCase();

    // Calendar-related keywords
    if (
      lowerInput.includes("schedule") ||
      lowerInput.includes("meeting") ||
      lowerInput.includes("calendar") ||
      lowerInput.includes("event") ||
      lowerInput.includes("availability")
    ) {
      return "calendar";
    }

    // Task-related keywords
    if (
      lowerInput.includes("task") ||
      lowerInput.includes("todo") ||
      lowerInput.includes("remind") ||
      lowerInput.includes("workflow") ||
      lowerInput.includes("automate")
    ) {
      return "task";
    }

    // Voice-related keywords
    if (
      lowerInput.includes("voice") ||
      lowerInput.includes("speak") ||
      lowerInput.includes("dictate") ||
      lowerInput.includes("transcribe")
    ) {
      return "voice";
    }

    // Notification-related keywords
    if (
      lowerInput.includes("notify") ||
      lowerInput.includes("alert") ||
      lowerInput.includes("notification")
    ) {
      return "notification";
    }

    // Default to conversation agent
    return "conversation";
  }

  /**
   * Aggregate responses from multiple agents.
   */
  private aggregateResponses(results: ExecutionResult[]): string {
    const successfulResponses = results
      .filter((r) => r.success && r.response)
      .map((r) => r.response);

    if (successfulResponses.length === 0) {
      return "I was unable to complete your request. Please try again.";
    }

    if (successfulResponses.length === 1) {
      return successfulResponses[0];
    }

    return successfulResponses.join("\n\n");
  }
}

/**
 * Execution plan for multi-agent operations.
 */
export interface ExecutionPlan {
  id: string;
  name: string;
  steps: ExecutionStep[];
}

/**
 * Single step in an execution plan.
 */
export interface ExecutionStep {
  id: string;
  agentId: string;
  input: string;
  dependsOn?: string[];
  outputVariable?: string;
  stopOnFailure?: boolean;
}

/**
 * Result of plan execution.
 */
export interface PlanResult {
  success: boolean;
  stepResults: ExecutionResult[];
  finalResponse: string;
}

// =============================================================================
// REGISTER DEFAULT TOOL HANDLERS
// =============================================================================

// Memory tools
registerToolHandler("memory.search", async (args, context) => {
  return { results: [], message: "Memory search completed" };
});

registerToolHandler("memory.store", async (args, context) => {
  return { success: true, message: "Memory stored" };
});

// Calendar tools
registerToolHandler("calendar.listEvents", async (args, context) => {
  return { events: [], message: "Events retrieved" };
});

registerToolHandler("calendar.createEvent", async (args, context) => {
  return { eventId: `event_${Date.now()}`, message: "Event created" };
});

registerToolHandler("calendar.checkAvailability", async (args, context) => {
  return { slots: [], message: "Availability checked" };
});

registerToolHandler("calendar.suggestTimes", async (args, context) => {
  return { suggestions: [], message: "Times suggested" };
});

// Task tools
registerToolHandler("tasks.createTask", async (args, context) => {
  return { taskId: `task_${Date.now()}`, message: "Task created" };
});

registerToolHandler("tasks.completeTask", async (args, context) => {
  return { success: true, message: "Task completed" };
});

registerToolHandler("tasks.listTasks", async (args, context) => {
  return { tasks: [], message: "Tasks retrieved" };
});

registerToolHandler("tasks.createWorkflow", async (args, context) => {
  return { workflowId: `workflow_${Date.now()}`, message: "Workflow created" };
});

// Voice tools
registerToolHandler("voice.transcribe", async (args, context) => {
  return { text: "Transcribed text", confidence: 0.95 };
});

registerToolHandler("voice.synthesize", async (args, context) => {
  return { audioUrl: "audio://synthesized", duration: 5 };
});

registerToolHandler("voice.registerCommand", async (args, context) => {
  return { commandId: `cmd_${Date.now()}`, message: "Command registered" };
});

// Notification tools
registerToolHandler("notifications.send", async (args, context) => {
  return { notificationId: `notif_${Date.now()}`, message: "Notification sent" };
});

registerToolHandler("notifications.schedule", async (args, context) => {
  return { notificationId: `notif_${Date.now()}`, message: "Notification scheduled" };
});

registerToolHandler("notifications.createSuggestion", async (args, context) => {
  return { suggestionId: `sug_${Date.now()}`, message: "Suggestion created" };
});

// Coordinator tools
registerToolHandler("coordinator.routeToAgent", async (args, context) => {
  return { routed: true, agentId: args.agentId };
});

registerToolHandler("coordinator.createPlan", async (args, context) => {
  return { planId: `plan_${Date.now()}`, message: "Plan created" };
});

registerToolHandler("coordinator.aggregateResults", async (args, context) => {
  return { aggregated: true };
});

// =============================================================================
// FACTORY
// =============================================================================

let coordinatorInstance: MultiAgentCoordinator | null = null;

/**
 * Get the multi-agent coordinator.
 */
export function getCoordinator(): MultiAgentCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new MultiAgentCoordinator();
  }
  return coordinatorInstance;
}

/**
 * Create a new agent executor.
 */
export function createAgentExecutor(
  options?: { maxIterations?: number; timeoutMs?: number }
): AgentExecutor {
  return new AgentExecutor(options);
}
