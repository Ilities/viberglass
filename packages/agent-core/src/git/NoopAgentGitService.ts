import type { IAgentGitService } from "./IAgentGitService";

export class NoopAgentGitService implements IAgentGitService {
  async cloneRepository(_repoUrl: string, _branch: string, _workDir: string): Promise<void> {}
  async getChangedFiles(_repoDir: string): Promise<string[]> { return []; }
}
