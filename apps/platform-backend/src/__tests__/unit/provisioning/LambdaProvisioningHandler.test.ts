import type { LambdaClientPort } from "../../../provisioning/ports/LambdaClientPort";
import { LambdaProvisioningHandler } from "../../../provisioning/strategies/LambdaProvisioningHandler";
import { buildClanker } from "./testUtils";

describe("LambdaProvisioningHandler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.VIBERATOR_LAMBDA_ROLE_ARN;
    delete process.env.VIBERATOR_LAMBDA_IMAGE_URI;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function buildLambdaClient(): {
    client: LambdaClientPort;
    getFunction: jest.Mock;
    createFunction: jest.Mock;
    updateFunctionCode: jest.Mock;
    updateFunctionConfiguration: jest.Mock;
  } {
    const getFunction = jest.fn(async () => ({
      Configuration: {
        FunctionName: "test-function",
        FunctionArn: "arn:aws:lambda:eu-west-1:123456789012:function:test-function",
      },
      Code: {
        ImageUri: "worker:latest",
      },
    }));
    const createFunction = jest.fn(async () => undefined);
    const updateFunctionCode = jest.fn(async () => undefined);
    const updateFunctionConfiguration = jest.fn(async () => undefined);

    const client: LambdaClientPort = {
      getFunction,
      createFunction,
      updateFunctionCode,
      updateFunctionConfiguration,
    };

    return {
      client,
      getFunction,
      createFunction,
      updateFunctionCode,
      updateFunctionConfiguration,
    };
  }

  it("returns null preflight error", () => {
    const { client } = buildLambdaClient();
    const handler = new LambdaProvisioningHandler(client);

    expect(handler.getPreflightError(buildClanker("lambda", null))).toBeNull();
  });

  it("provisions existing lambda function and returns active", async () => {
    const {
      client,
      getFunction,
      updateFunctionCode,
      updateFunctionConfiguration,
    } = buildLambdaClient();

    getFunction
      .mockResolvedValueOnce({
        Configuration: {
          FunctionName: "worker-fn",
          FunctionArn: "arn:worker-fn",
        },
        Code: {
          ImageUri: "old-image",
        },
      })
      .mockResolvedValueOnce({
        Configuration: {
          FunctionName: "worker-fn",
          FunctionArn: "arn:worker-fn",
          Role: "arn:role",
          MemorySize: 1024,
          Timeout: 120,
        },
        Code: {
          ImageUri: "new-image",
        },
      })
      .mockResolvedValueOnce({
        Configuration: {
          FunctionName: "worker-fn",
          FunctionArn: "arn:worker-fn",
        },
      });

    const handler = new LambdaProvisioningHandler(client);

    const clanker = buildClanker("lambda", {
      version: 1,
      strategy: {
        type: "lambda",
        functionName: "worker-fn",
        imageUri: "new-image",
        roleArn: "arn:role",
        memorySize: 1024,
        timeout: 120,
      },
      agent: { type: "claude-code" },
    });

    const result = await handler.provision(clanker);

    expect(updateFunctionCode).toHaveBeenCalledWith({
      FunctionName: "worker-fn",
      ImageUri: "new-image",
    });
    expect(updateFunctionConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({
        FunctionName: "worker-fn",
        Role: "arn:role",
        MemorySize: 1024,
        Timeout: 120,
      }),
    );
    expect(result.status).toBe("active");
    expect(result.statusMessage).toBe("Lambda function ready: arn:worker-fn");
  });

  it("creates lambda function when it does not exist", async () => {
    const { client, getFunction, createFunction } = buildLambdaClient();
    process.env.VIBERATOR_LAMBDA_ROLE_ARN = "arn:env-role";

    getFunction
      .mockRejectedValueOnce({ name: "ResourceNotFoundException" })
      .mockResolvedValueOnce({
        Configuration: {
          FunctionName: "viberator-test-clanker",
          FunctionArn: "arn:new",
        },
        Code: {
          ImageUri: "env-image",
        },
      })
      .mockResolvedValueOnce({
        Configuration: {
          FunctionName: "viberator-test-clanker",
          FunctionArn: "arn:new",
        },
      });

    const handler = new LambdaProvisioningHandler(client);
    const clanker = buildClanker("lambda", {
      version: 1,
      strategy: {
        type: "lambda",
        imageUri: "env-image",
      },
      agent: { type: "claude-code" },
    });

    const result = await handler.provision(clanker);

    expect(createFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        FunctionName: "viberator-test-clanker",
        Role: "arn:env-role",
        PackageType: "Image",
      }),
    );
    expect(result.status).toBe("active");
  });

  it("returns inactive when lambda function is not configured", async () => {
    const { client } = buildLambdaClient();
    const handler = new LambdaProvisioningHandler(client);

    const result = await handler.checkAvailability(buildClanker("lambda", null));

    expect(result).toEqual({
      status: "inactive",
      statusMessage: "Lambda function not configured",
    });
  });

  it("returns inactive when lambda function does not exist", async () => {
    const { client, getFunction } = buildLambdaClient();
    getFunction.mockRejectedValue({ name: "ResourceNotFoundException" });

    const handler = new LambdaProvisioningHandler(client);
    const clanker = buildClanker("lambda", {
      version: 1,
      strategy: {
        type: "lambda",
        functionName: "missing",
      },
      agent: { type: "claude-code" },
    });

    const result = await handler.checkAvailability(clanker);

    expect(result).toEqual({
      status: "inactive",
      statusMessage: "Lambda function not found",
    });
  });

  it("returns failed when lambda availability check errors", async () => {
    const { client, getFunction } = buildLambdaClient();
    getFunction.mockRejectedValue(new Error("lambda timeout"));

    const handler = new LambdaProvisioningHandler(client);
    const clanker = buildClanker("lambda", {
      version: 1,
      strategy: {
        type: "lambda",
        functionName: "existing",
      },
      agent: { type: "claude-code" },
    });

    const result = await handler.checkAvailability(clanker);

    expect(result.status).toBe("failed");
    expect(result.statusMessage).toContain("lambda timeout");
  });
});
