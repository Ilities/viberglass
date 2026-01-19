import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { GitService } from "./GitService";

describe("GitService", () => {
  let gitService: GitService;

  beforeEach(() => {
    gitService = new GitService("/tmp/test-repo");
  });

  afterEach(() => {
    // Cleanup if needed
  });

  describe("clone", () => {
    it("should clone a repository", async () => {
      const url = "https://github.com/example/repo.git";
      // Mock the actual clone operation
      const result = await gitService.clone(url);
      expect(result).toBeDefined();
    });

    it("should handle clone errors", async () => {
      const url = "invalid-url";
      await expect(gitService.clone(url)).rejects.toThrow();
    });
  });

  describe("getCommitHistory", () => {
    it("should return commit history", async () => {
      const history = await gitService.getCommitHistory(10);
      expect(Array.isArray(history)).toBe(true);
    });
  });
});
