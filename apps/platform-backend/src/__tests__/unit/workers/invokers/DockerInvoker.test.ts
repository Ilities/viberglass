/**
 * Unit tests for DockerInvoker error classification
 *
 * Tests:
 * - Connection error classification (ECONNREFUSED, ETIMEDOUT = transient)
 * - Container name conflict classification (transient)
 * - Missing containerImage throws PERMANENT error
 * - Other errors default to PERMANENT
 */

import { DockerInvoker } from "../../../../workers";
import { ErrorClassification } from "../../../../workers";
import { JOB_KIND, type Clanker } from "@viberglass/types";
import type { JobData } from "../../../../types/Job";

// Mock dockerode
const mockCreateContainer = jest.fn();
const mockPing = jest.fn();
jest.mock("dockerode", () => {
  return jest.fn().mockImplementation(() => ({
    createContainer: mockCreateContainer,
    ping: mockPing,
  }));
});

describe("DockerInvoker", () => {
  let invoker: DockerInvoker;
  let mockJob: JobData;
  let mockClanker: Clanker;
  let mockContainer: {
    start: jest.Mock;
    id: string;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    invoker = new DockerInvoker({ socketPath: "/var/run/docker.sock" });

    // Setup mock container
    mockContainer = {
      start: jest.fn().mockResolvedValue(undefined),
      id: "container-abc123",
    };

    // Setup mock job
    mockJob = {
      id: "job-123",
      jobKind: JOB_KIND.EXECUTION,
      tenantId: "tenant-abc",
      repository: "https://github.com/user/repo",
      task: "Fix the bug in auth module",
      branch: "fix/auth-bug",
      baseBranch: "main",
      context: {
        ticketId: "ticket-123",
        stepsToReproduce: "1. Login\n2. Click profile",
        expectedBehavior: "Profile loads",
        actualBehavior: "Error 500",
      },
      timestamp: Date.now(),
    };

    // Setup mock clanker with Docker config
    mockClanker = {
      id: "clanker-1",
      name: "Docker Fixer",
      slug: "docker-fixer",
      description: "Fixes bugs via Docker",
      status: "active",
      agent: "kimi-code",
      configFiles: [],
      secretIds: [],
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      deploymentConfig: {
        containerImage: "viberator/worker:latest",
        environmentVariables: {
          NODE_ENV: "production",
        },
      },
    };

    // Default successful mock
    mockPing.mockResolvedValue(true);
  });

  describe("invoke() - error classification", () => {
    describe("transient connection errors", () => {
      it("should classify ECONNREFUSED as TRANSIENT", async () => {
        const error = new Error("ECONNREFUSED 127.0.0.1:2375") as any;
        error.code = "ECONNREFUSED";
        mockCreateContainer.mockRejectedValueOnce(error);

        const resultPromise = invoker.invoke(mockJob, mockClanker);

        await expect(resultPromise).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
          name: "WorkerError",
        });

        await expect(resultPromise).rejects.toThrow(
          /Docker daemon connection failed \(transient\)/,
        );
      });

      it("should classify ETIMEDOUT as TRANSIENT", async () => {
        const error = new Error("ETIMEDOUT 127.0.0.1:2375") as any;
        error.code = "ETIMEDOUT";
        mockCreateContainer.mockRejectedValueOnce(error);

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });

      it("should classify socket hang up as TRANSIENT", async () => {
        const error = new Error("socket hang up") as any;
        mockCreateContainer.mockRejectedValueOnce(error);

        const resultPromise = invoker.invoke(mockJob, mockClanker);

        await expect(resultPromise).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });

        await expect(resultPromise).rejects.toThrow(
          /Docker daemon connection failed \(transient\)/,
        );
      });

      it("should classify connect ENOENT as TRANSIENT", async () => {
        const error = new Error("connect ENOENT /var/run/docker.sock") as any;
        error.code = "ENOENT";
        mockCreateContainer.mockRejectedValueOnce(error);

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });
    });

    describe("transient container conflicts", () => {
      it('should classify container name Conflict with "already in use" as TRANSIENT', async () => {
        const error = new Error(
          'Conflict. The container name "/viberator-job-job-123" is already in use',
        ) as any;
        mockCreateContainer.mockRejectedValueOnce(error);

        const resultPromise = invoker.invoke(mockJob, mockClanker);

        await expect(resultPromise).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
          name: "WorkerError",
        });

        await expect(resultPromise).rejects.toThrow(
          /Container name collision \(transient\)/,
        );
      });

      it("should classify conflict errors containing both keywords as TRANSIENT", async () => {
        const error = new Error(
          "Conflict: container name already in use",
        ) as any;
        mockCreateContainer.mockRejectedValueOnce(error);

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });

      it('should classify conflict without "already in use" as PERMANENT', async () => {
        const error = new Error("Conflict: some other conflict") as any;
        mockCreateContainer.mockRejectedValueOnce(error);

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });
    });

    describe("permanent errors", () => {
      it("should classify image not found error as PERMANENT", async () => {
        const error = new Error(
          "Error: No such image: viberator/worker:latest",
        ) as any;
        mockCreateContainer.mockRejectedValueOnce(error);

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
          name: "WorkerError",
        });

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toThrow(
          /Docker container failed \(permanent\)/,
        );
      });

      it("should classify invalid image name error as PERMANENT", async () => {
        const error = new Error("invalid reference format") as any;
        mockCreateContainer.mockRejectedValueOnce(error);

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it("should classify unknown errors as PERMANENT (safe default)", async () => {
        const error = new Error("Some unknown docker error") as any;
        mockCreateContainer.mockRejectedValueOnce(error);

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it("should preserve original error in cause property", async () => {
        const originalError = new Error("ECONNREFUSED 127.0.0.1:2375") as any;
        originalError.code = "ECONNREFUSED";
        mockCreateContainer.mockRejectedValueOnce(originalError);

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
          cause: originalError,
        });
      });

      it("should include error message in WorkerError message", async () => {
        const error = new Error(
          "No such image: viberator/worker:latest",
        ) as any;
        mockCreateContainer.mockRejectedValueOnce(error);

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toThrow(
          /No such image: viberator\/worker:latest/,
        );
      });
    });

    describe("configuration errors", () => {
      it("should throw PERMANENT error when containerImage is missing", async () => {
        const clankerWithoutImage: Clanker = {
          ...mockClanker,
          deploymentConfig: {},
        };

        await expect(
          invoker.invoke(mockJob, clankerWithoutImage),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
          name: "WorkerError",
        });

        await expect(
          invoker.invoke(mockJob, clankerWithoutImage),
        ).rejects.toThrow(/Docker container image required/);
      });

      it("should throw PERMANENT error when deploymentConfig is null", async () => {
        const clankerWithNullConfig: Clanker = {
          ...mockClanker,
          deploymentConfig: null,
        };

        await expect(
          invoker.invoke(mockJob, clankerWithNullConfig),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it("should throw PERMANENT error when deploymentConfig is undefined", async () => {
        const clankerWithUndefinedConfig: Clanker = {
          ...mockClanker,
          deploymentConfig: undefined,
        };

        await expect(
          invoker.invoke(mockJob, clankerWithUndefinedConfig),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it("should throw PERMANENT error when containerImage is empty string", async () => {
        const clankerWithEmptyImage: Clanker = {
          ...mockClanker,
          deploymentConfig: {
            containerImage: "",
          },
        };

        await expect(
          invoker.invoke(mockJob, clankerWithEmptyImage),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });
    });

    describe("container start errors", () => {
      it("should classify errors during container start based on error message", async () => {
        mockCreateContainer.mockResolvedValueOnce(mockContainer as any);

        const error = new Error("ECONNREFUSED during container start") as any;
        error.code = "ECONNREFUSED";
        mockContainer.start.mockRejectedValueOnce(error);

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });

      it("should classify non-connection start errors as PERMANENT", async () => {
        mockCreateContainer.mockResolvedValueOnce(mockContainer as any);

        const error = new Error(
          "Cannot start container: invalid config",
        ) as any;
        mockContainer.start.mockRejectedValueOnce(error);

        await expect(
          invoker.invoke(mockJob, mockClanker),
        ).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });
    });

    describe("success cases", () => {
      it("should use custom network mode when provided", async () => {
        mockCreateContainer.mockResolvedValueOnce(mockContainer as any);

        const clankerWithNetwork: Clanker = {
          ...mockClanker,
          deploymentConfig: {
            ...(mockClanker.deploymentConfig as any),
            networkMode: "host",
          },
        };

        await invoker.invoke(mockJob, clankerWithNetwork);

        expect(mockCreateContainer).toHaveBeenCalledWith(
          expect.objectContaining({
            HostConfig: expect.objectContaining({
              NetworkMode: "host",
            }),
          }),
        );
      });

      it("should handle empty environment variables", async () => {
        mockCreateContainer.mockResolvedValueOnce(mockContainer as any);

        const clankerWithoutEnv: Clanker = {
          ...mockClanker,
          deploymentConfig: {
            containerImage: "viberator/worker:latest",
          },
        };

        await invoker.invoke(mockJob, clankerWithoutEnv);

        expect(mockCreateContainer).toHaveBeenCalled();
      });

      it("should include custom environment variables in container", async () => {
        mockCreateContainer.mockResolvedValueOnce(mockContainer as any);

        const clankerWithEnv: Clanker = {
          ...mockClanker,
          deploymentConfig: {
            containerImage: "viberator/worker:latest",
            environmentVariables: {
              CUSTOM_VAR: "custom-value",
              ANOTHER_VAR: "another-value",
            },
          },
        };

        await invoker.invoke(mockJob, clankerWithEnv);

        expect(mockCreateContainer).toHaveBeenCalledWith(
          expect.objectContaining({
            Env: expect.arrayContaining([
              expect.stringContaining("CUSTOM_VAR=custom-value"),
              expect.stringContaining("ANOTHER_VAR=another-value"),
            ]),
          }),
        );
      });

      it("should mount job volume bindings as read-only by default", async () => {
        mockCreateContainer.mockResolvedValueOnce(mockContainer as any);

        const jobWithMounts: JobData = {
          ...mockJob,
          mounts: [
            {
              hostPath: "/tmp/viberator-ticket-media/screenshots/a.png",
              containerPath: "/tmp/viberator-ticket-media/screenshots/a.png",
            },
            {
              hostPath: "/tmp/viberator-ticket-media/recordings/b.mp4",
              containerPath: "/tmp/viberator-ticket-media/recordings/b.mp4",
              readOnly: false,
            },
          ],
        };

        await invoker.invoke(jobWithMounts, mockClanker);

        expect(mockCreateContainer).toHaveBeenCalledWith(
          expect.objectContaining({
            HostConfig: expect.objectContaining({
              Binds: expect.arrayContaining([
                "/tmp/viberator-ticket-media/screenshots/a.png:/tmp/viberator-ticket-media/screenshots/a.png:ro",
                "/tmp/viberator-ticket-media/recordings/b.mp4:/tmp/viberator-ticket-media/recordings/b.mp4:rw",
              ]),
            }),
          }),
        );
      });

      it("should include callback token in worker payload", async () => {
        mockCreateContainer.mockResolvedValueOnce(mockContainer as any);

        const jobWithCallbackToken: JobData = {
          ...mockJob,
          callbackToken: "cb-token-123",
        };

        await invoker.invoke(jobWithCallbackToken, mockClanker);

        const createContainerCall = mockCreateContainer.mock.calls[0][0];
        const payloadArg =
          createContainerCall.Cmd[
            createContainerCall.Cmd.indexOf("--job-data") + 1
          ];
        const payload = JSON.parse(payloadArg);

        expect(payload.callbackToken).toBe("cb-token-123");
        expect(payload.agent).toBe("kimi-code");
      });

      it("should use job-ref command and callback token env when bootstrap payload is available", async () => {
        mockCreateContainer.mockResolvedValueOnce(mockContainer as any);

        const jobWithBootstrap: JobData = {
          ...mockJob,
          callbackToken: "cb-token-456",
          bootstrapPayload: {
            workerType: "docker",
            jobId: mockJob.id,
            tenantId: mockJob.tenantId,
          },
        };

        await invoker.invoke(jobWithBootstrap, mockClanker);

        const createContainerCall = mockCreateContainer.mock.calls[0][0];

        expect(createContainerCall.Cmd).toEqual([
          "node",
          "apps/viberator/dist/cli-worker.js",
          "--job-ref",
          mockJob.id,
        ]);
        expect(createContainerCall.Env).toEqual(
          expect.arrayContaining([
            expect.stringContaining("CALLBACK_TOKEN=cb-token-456"),
          ]),
        );
      });
    });
  });

  describe("isAvailable()", () => {
    it("should return true when Docker daemon is reachable", async () => {
      mockPing.mockResolvedValueOnce(true);

      const result = await invoker.isAvailable();

      expect(result).toBe(true);
    });

    it("should return false when Docker daemon is not reachable", async () => {
      mockPing.mockRejectedValueOnce(new Error("Cannot connect"));

      const result = await invoker.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe("name property", () => {
    it("should have correct invoker name", () => {
      expect(invoker.name).toBe("DockerInvoker");
    });
  });

  describe("constructor", () => {
    it("should use default socket path when not provided", () => {
      const defaultInvoker = new DockerInvoker();

      expect(defaultInvoker).toBeInstanceOf(DockerInvoker);
    });

    it("should use custom socket path when provided", () => {
      const customInvoker = new DockerInvoker({
        socketPath: "/custom/docker.sock",
      });

      expect(customInvoker).toBeInstanceOf(DockerInvoker);
    });

    it("should use host and port when provided", () => {
      const remoteInvoker = new DockerInvoker({
        host: "192.168.1.1",
        port: 2376,
      });

      expect(remoteInvoker).toBeInstanceOf(DockerInvoker);
    });
  });
});
