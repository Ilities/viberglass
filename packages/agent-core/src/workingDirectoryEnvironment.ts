/**
 * Returns `env` with `PWD` pointing at `cwd`.
 *
 * `spawn({ cwd })` changes the child's working directory but leaves the
 * inherited `PWD` untouched. Some harnesses resolve their project directory
 * from `PWD` (OpenCode 1.18 `run` does), so a stale `PWD` from the worker
 * container (`/app`) makes the agent work outside the cloned repository.
 */
export function withWorkingDirectory(
  env: NodeJS.ProcessEnv,
  cwd: string | undefined,
): NodeJS.ProcessEnv {
  if (!cwd) {
    return env;
  }
  return { ...env, PWD: cwd };
}
