import { describe, it, expect, vi } from "@jest/globals";
import { AgentFactory } from "./AgentFactory";

describe("AgentFactory", () => {
  describe("createAgent", () => {
    it("should create a Claude Code agent", () => {
      const config = {
        type: "claude-code",
        apiKey: "test-key",
      };
      const agent = AgentFactory.createAgent(config);
      expect(agent).toBeDefined();
      expect(agent.getType()).toBe("claude-code");
    });

    it("should throw error for unsupported agent type", () => {
      const config = {
        type: "unsupported-agent",
        apiKey: "test-key",
      };
      expect(() => AgentFactory.createAgent(config)).toThrow();
    });
  });

  describe("getSupportedAgentTypes", () => {
    it("should return list of supported agent types", () => {
      const types = AgentFactory.getSupportedAgentTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
    });
  });
});
