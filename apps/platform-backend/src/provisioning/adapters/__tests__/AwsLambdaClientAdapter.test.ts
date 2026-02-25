import { AwsLambdaClientAdapter } from "../AwsLambdaClientAdapter";

// Mock the AWS SDK Lambda client
const mockSend = jest.fn();
jest.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  GetFunctionCommand: jest.fn().mockImplementation((input) => ({ input })),
  UpdateFunctionCodeCommand: jest.fn().mockImplementation((input) => ({ input })),
  UpdateFunctionConfigurationCommand: jest.fn().mockImplementation((input) => ({ input })),
  CreateFunctionCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe("AwsLambdaClientAdapter", () => {
  let adapter: AwsLambdaClientAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new AwsLambdaClientAdapter();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("waitForFunctionUpdate race condition fix", () => {
    it("should wait for InProgress before accepting Successful for subsequent updates", async () => {
      // Simulate the race condition:
      // First call is UpdateFunctionCodeCommand
      // Then polling: "Successful" from previous update, then "InProgress", then "Successful"
      mockSend
        .mockResolvedValueOnce({}) // UpdateFunctionCodeCommand response
        .mockResolvedValueOnce({
          Configuration: { LastUpdateStatus: "Successful" }, // From previous update
        })
        .mockResolvedValueOnce({
          Configuration: { LastUpdateStatus: "InProgress" }, // Current update started
        })
        .mockResolvedValueOnce({
          Configuration: { LastUpdateStatus: "Successful" }, // Current update complete
        });

      // Mock setTimeout to speed up the test
      const originalSetTimeout = global.setTimeout;
      jest.spyOn(global, "setTimeout").mockImplementation((fn: () => void, _ms?: number) => {
        return originalSetTimeout(fn, 10);
      });

      await adapter.updateFunctionCode({
        FunctionName: "test-function",
        ImageUri: "new-image:latest",
      });

      // Should have called 4 times: UpdateFunctionCodeCommand + 3 GetFunctionCommand polls
      expect(mockSend).toHaveBeenCalledTimes(4);

      // Verify GetFunction was called with correct params
      expect(mockSend).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ input: { FunctionName: "test-function" } })
      );
    });

    it("should return immediately if update is already Successful after seeing InProgress", async () => {
      mockSend
        .mockResolvedValueOnce({}) // UpdateFunctionConfigurationCommand response
        .mockResolvedValueOnce({
          Configuration: { LastUpdateStatus: "InProgress" },
        })
        .mockResolvedValueOnce({
          Configuration: { LastUpdateStatus: "Successful" },
        });

      const originalSetTimeout = global.setTimeout;
      jest.spyOn(global, "setTimeout").mockImplementation((fn: () => void, _ms?: number) => {
        return originalSetTimeout(fn, 10);
      });

      await adapter.updateFunctionConfiguration({
        FunctionName: "test-function",
        Timeout: 120,
      });

      // Should have called 3 times: UpdateFunctionConfigurationCommand + 2 GetFunctionCommand polls
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it("should throw error when update fails", async () => {
      mockSend.mockResolvedValue({
        Configuration: {
          LastUpdateStatus: "Failed",
          LastUpdateStatusReason: "Image not found",
        },
      });

      await expect(
        adapter.updateFunctionCode({
          FunctionName: "test-function",
          ImageUri: "invalid-image",
        })
      ).rejects.toThrow("Lambda function update failed: Image not found");
    });

    it("should throw timeout error if update takes too long", async () => {
      // Mock Date.now to simulate timeout
      const originalDateNow = Date.now;
      let callCount = 0;
      jest.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        // Return increasing times to simulate passage of time
        return originalDateNow() + callCount * 310000; // Jump 310 seconds each call
      });

      mockSend.mockResolvedValue({
        Configuration: { LastUpdateStatus: "InProgress" },
      });

      await expect(
        adapter.updateFunctionCode({
          FunctionName: "test-function",
          ImageUri: "slow-image",
        })
      ).rejects.toThrow(/timed out after 300 seconds/);

      jest.restoreAllMocks();
    });

    it("should handle the case where InProgress is never seen but status becomes Successful", async () => {
      // Edge case: For very fast updates, we might miss InProgress entirely
      // In this case, the polling will eventually timeout because we never see InProgress
      // This test documents that the function will wait until timeout if InProgress is never seen
      mockSend
        .mockResolvedValueOnce({}) // UpdateFunctionCodeCommand response
        .mockResolvedValue({
          Configuration: { LastUpdateStatus: "Successful" },
        });

      // Mock a short timeout for testing
      const originalDateNow = Date.now;
      let callCount = 0;
      jest.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        return originalDateNow() + callCount * 310000;
      });

      await expect(
        adapter.updateFunctionCode({
          FunctionName: "test-function",
          ImageUri: "fast-image",
        })
      ).rejects.toThrow(/timed out/);

      jest.restoreAllMocks();
    });
  });

  describe("updateFunctionCode", () => {
    it("should call UpdateFunctionCodeCommand and wait for update", async () => {
      mockSend
        .mockResolvedValueOnce({}) // UpdateFunctionCode response
        .mockResolvedValueOnce({
          Configuration: { LastUpdateStatus: "InProgress" },
        })
        .mockResolvedValueOnce({
          Configuration: { LastUpdateStatus: "Successful" },
        });

      const originalSetTimeout = global.setTimeout;
      jest.spyOn(global, "setTimeout").mockImplementation((fn: () => void, _ms?: number) => {
        return originalSetTimeout(fn, 10);
      });

      await adapter.updateFunctionCode({
        FunctionName: "test-function",
        ImageUri: "image:latest",
      });

      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it("should not wait if FunctionName is not provided", async () => {
      mockSend.mockResolvedValue({});

      // Cast to bypass type check for testing edge case without FunctionName
      await adapter.updateFunctionCode({
        ImageUri: "image:latest",
      } as import("@aws-sdk/client-lambda").UpdateFunctionCodeCommandInput);

      // Should only call UpdateFunctionCodeCommand, not GetFunction
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateFunctionConfiguration", () => {
    it("should call UpdateFunctionConfigurationCommand and wait for update", async () => {
      mockSend
        .mockResolvedValueOnce({}) // UpdateFunctionConfiguration response
        .mockResolvedValueOnce({
          Configuration: { LastUpdateStatus: "InProgress" },
        })
        .mockResolvedValueOnce({
          Configuration: { LastUpdateStatus: "Successful" },
        });

      const originalSetTimeout = global.setTimeout;
      jest.spyOn(global, "setTimeout").mockImplementation((fn: () => void, _ms?: number) => {
        return originalSetTimeout(fn, 10);
      });

      await adapter.updateFunctionConfiguration({
        FunctionName: "test-function",
        Timeout: 60,
        MemorySize: 512,
      });

      expect(mockSend).toHaveBeenCalledTimes(3);
    });
  });

  describe("getFunction", () => {
    it("should call GetFunctionCommand with correct params", async () => {
      const mockResponse = {
        Configuration: {
          FunctionName: "test-function",
          FunctionArn: "arn:aws:lambda:us-east-1:123456789:function:test-function",
          State: "Active",
        },
      };
      mockSend.mockResolvedValue(mockResponse);

      const result = await adapter.getFunction("test-function");

      expect(result).toEqual(mockResponse);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ input: { FunctionName: "test-function" } })
      );
    });
  });

  describe("createFunction", () => {
    it("should call CreateFunctionCommand with correct params", async () => {
      mockSend.mockResolvedValue({});

      await adapter.createFunction({
        FunctionName: "new-function",
        Role: "arn:aws:iam::123456789:role/lambda-role",
        Code: { ImageUri: "image:latest" },
        PackageType: "Image",
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            FunctionName: "new-function",
            Role: "arn:aws:iam::123456789:role/lambda-role",
            Code: { ImageUri: "image:latest" },
            PackageType: "Image",
          },
        })
      );
    });
  });
});
