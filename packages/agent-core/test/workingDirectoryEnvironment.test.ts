import { withWorkingDirectory } from "../src/workingDirectoryEnvironment";

describe("withWorkingDirectory", () => {
  it("points PWD at the spawn cwd, replacing an inherited value", () => {
    const env = { PWD: "/app", HOME: "/home/viberator" };

    expect(withWorkingDirectory(env, "/tmp/work/repo")).toEqual({
      PWD: "/tmp/work/repo",
      HOME: "/home/viberator",
    });
  });

  it("does not mutate the input environment", () => {
    const env = { PWD: "/app" };

    withWorkingDirectory(env, "/tmp/work/repo");

    expect(env.PWD).toBe("/app");
  });

  it("returns the environment unchanged when no cwd is given", () => {
    const env = { PWD: "/app" };

    expect(withWorkingDirectory(env, undefined)).toBe(env);
  });
});
