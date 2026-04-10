export interface IAgentGitService {
  cloneRepository(repoUrl: string, branch: string, workDir: string): Promise<void>;
  getChangedFiles(repoDir: string): Promise<string[]>;
}
