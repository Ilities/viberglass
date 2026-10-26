import { mergeWorkerSettings } from "./workerSettings";

describe("mergeWorkerSettings", () => {
  test("applies precedence override > project > clanker > job", () => {
    const merged = mergeWorkerSettings({
      defaults: { maxExecutionTime: 900 },
      jobSettings: {
        maxChanges: 1,
        testRequired: false,
        codingStandards: "job",
        runTests: false,
        testCommand: "npm run job-test",
        maxExecutionTime: 100,
      },
      clankerConfig: {
        runtime: {
          settings: {
            maxChanges: 2,
            testRequired: true,
            codingStandards: "clanker",
            runTests: true,
            testCommand: "npm run clanker-test",
            maxExecutionTime: 200,
          },
        },
      },
      projectConfig: {
        id: "proj-1",
        name: "Project",
        autoFixTags: [],
        customFieldMappings: {},
        workerSettings: {
          maxChanges: 3,
          testRequired: false,
          codingStandards: "project",
          runTests: false,
          testCommand: "npm run project-test",
          maxExecutionTime: 300,
        },
      },
      overrides: {
        settings: {
          maxChanges: 4,
          testRequired: true,
          codingStandards: "override",
          runTests: true,
          testCommand: "npm run override-test",
          maxExecutionTime: 400,
        },
      },
    });

    expect(merged).toEqual({
      maxChanges: 4,
      testRequired: true,
      codingStandards: "override",
      runTests: true,
      testCommand: "npm run override-test",
      maxExecutionTime: 400,
    });
  });

  test("falls back to defaults when no settings provided", () => {
    const merged = mergeWorkerSettings({
      defaults: { maxExecutionTime: 1500 },
    });

    expect(merged).toEqual({
      maxChanges: 5,
      testRequired: false,
      codingStandards: undefined,
      runTests: false,
      testCommand: "npm test",
      maxExecutionTime: 1500,
    });
  });

  test("reads the runner's time limit whether the worker gets the whole runner or its deployment config", () => {
    const runtime = { settings: { maxExecutionTime: 5400 } };
    const fromRunner = mergeWorkerSettings({ defaults: { maxExecutionTime: 2700 }, clankerConfig: { id: "r1", deploymentConfig: { version: 1, runtime } } });
    const fromConfig = mergeWorkerSettings({ defaults: { maxExecutionTime: 2700 }, clankerConfig: { version: 1, runtime } });
    expect(fromRunner.maxExecutionTime).toBe(5400);
    expect(fromConfig.maxExecutionTime).toBe(5400);
  });
});
