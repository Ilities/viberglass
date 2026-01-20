/**
 * Unit tests for LambdaInvoker error classification
 *
 * Tests:
 * - Transient error classification (TooManyRequestsException, ServiceException, etc.)
 * - Permanent error classification (ResourceNotFoundException, InvalidParameterException, etc.)
 * - HTTP status code based classification (5xx = transient)
 * - Missing functionName throws PERMANENT error
 * - Unknown errors default to PERMANENT
 */

import { LambdaInvoker } from '../../../../workers/invokers/LambdaInvoker';
import { WorkerError, ErrorClassification } from '../../../../workers/errors/WorkerError';
import type { Clanker } from '@viberator/types';
import type { JobData } from '../../../../types/Job';

// Mock the Lambda client
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  InvokeCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe('LambdaInvoker', () => {
  let invoker: LambdaInvoker;
  let mockJob: JobData;
  let mockClanker: Clanker;

  // Helper to create AWS Lambda errors
  const createLambdaError = (name: string, statusCode: number, message: string): Error & {
    $metadata?: { httpStatusCode?: number };
  } => {
    const error = new Error(message) as any;
    error.name = name;
    error.$metadata = { httpStatusCode: statusCode };
    return error;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    invoker = new LambdaInvoker({ region: 'us-east-1' });

    // Setup mock job
    mockJob = {
      id: 'job-123',
      tenantId: 'tenant-abc',
      repository: 'https://github.com/user/repo',
      task: 'Fix the bug in auth module',
      branch: 'fix/auth-bug',
      baseBranch: 'main',
      context: {
        stepsToReproduce: '1. Login\n2. Click profile',
        expectedBehavior: 'Profile loads',
        actualBehavior: 'Error 500',
      },
      timestamp: Date.now(),
    };

    // Setup mock clanker with Lambda config
    mockClanker = {
      id: 'clanker-1',
      name: 'Lambda Fixer',
      slug: 'lambda-fixer',
      description: 'Fixes bugs via Lambda',
      status: 'active',
      configFiles: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deploymentConfig: {
        functionName: 'viberator-worker',
      },
    };
  });

  describe('invoke() - error classification', () => {
    describe('transient errors', () => {
      it('should classify TooManyRequestsException as TRANSIENT', async () => {
        const error = new Error('Rate limit exceeded') as any;
        error.name = 'TooManyRequestsException';
        error.$metadata = { httpStatusCode: 429 };

        mockSend.mockRejectedValueOnce(error);

        const resultPromise = invoker.invoke(mockJob, mockClanker);

        await expect(resultPromise).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
          name: 'WorkerError',
        });

        await expect(resultPromise).rejects.toThrow(
          /Lambda invocation failed \(transient\)/
        );
      });

      it('should classify ServiceException as TRANSIENT', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('ServiceException', 500, 'Internal service error')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });

      it('should classify EC2ThrottledException as TRANSIENT', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('EC2ThrottledException', 503, 'EC2 throttled')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });

      it('should classify EC2UnexpectedException as TRANSIENT', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('EC2UnexpectedException', 500, 'EC2 unexpected error')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });

      it('should classify ResourceNotReadyException as TRANSIENT', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('ResourceNotReadyException', 503, 'Resource not ready')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });

      it('should classify ResourceConflictException as TRANSIENT', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('ResourceConflictException', 409, 'Resource conflict')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });

      it('should classify EFSIOException as TRANSIENT', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('EFSIOException', 500, 'EFS IO error')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });

      it('should classify EFSMountConnectivityException as TRANSIENT', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('EFSMountConnectivityException', 500, 'EFS mount connectivity error')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });

      it('should classify EFSMountTimeoutException as TRANSIENT', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('EFSMountTimeoutException', 504, 'EFS mount timeout')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });

      it('should classify 5xx status codes as TRANSIENT', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('UnknownError', 500, 'Internal server error')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });

      it('should classify 502 status code as TRANSIENT', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('BadGateway', 502, 'Bad gateway')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });

      it('should classify 503 status code as TRANSIENT', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('ServiceUnavailable', 503, 'Service unavailable')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });

      it('should classify 504 status code as TRANSIENT', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('GatewayTimeout', 504, 'Gateway timeout')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
        });
      });
    });

    describe('permanent errors', () => {
      it('should classify ResourceNotFoundException as PERMANENT', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('ResourceNotFoundException', 404, 'Function not found')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toThrow(
          /Lambda invocation failed \(permanent\)/
        );
      });

      it('should classify InvalidParameterException as PERMANENT', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('InvalidParameterException', 400, 'Invalid parameter')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it('should classify InvalidParameterValueException as PERMANENT', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('InvalidParameterValueException', 400, 'Invalid parameter value')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it('should classify RequestTooLargeException as PERMANENT', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('RequestTooLargeException', 413, 'Request too large')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it('should classify unknown errors as PERMANENT (safe default)', async () => {
        const error = new Error('Something went wrong');
        mockSend.mockRejectedValueOnce(error);

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it('should classify 4xx (non-transient) status codes as PERMANENT', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('UnauthorizedException', 401, 'Unauthorized')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });
    });

    describe('configuration errors', () => {
      it('should throw PERMANENT error when functionName is missing', async () => {
        const clankerWithoutFunctionName: Clanker = {
          ...mockClanker,
          deploymentConfig: {},
        };

        await expect(invoker.invoke(mockJob, clankerWithoutFunctionName)).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
          name: 'WorkerError',
        });

        await expect(invoker.invoke(mockJob, clankerWithoutFunctionName)).rejects.toThrow(
          /Lambda function name or ARN not configured/
        );
      });

      it('should throw PERMANENT error when deploymentConfig is null', async () => {
        const clankerWithNullConfig: Clanker = {
          ...mockClanker,
          deploymentConfig: null,
        };

        await expect(invoker.invoke(mockJob, clankerWithNullConfig)).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });

      it('should throw PERMANENT error when deploymentConfig is undefined', async () => {
        const clankerWithUndefinedConfig: Clanker = {
          ...mockClanker,
          deploymentConfig: undefined,
        };

        await expect(invoker.invoke(mockJob, clankerWithUndefinedConfig)).rejects.toMatchObject({
          classification: ErrorClassification.PERMANENT,
        });
      });
    });

    describe('error cause preservation', () => {
      it('should preserve original error in cause property', async () => {
        const originalError = createLambdaError('TooManyRequestsException', 429, 'Rate limit exceeded');
        mockSend.mockRejectedValueOnce(originalError);

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toMatchObject({
          classification: ErrorClassification.TRANSIENT,
          cause: originalError,
        });
      });

      it('should include error name in message', async () => {
        mockSend.mockRejectedValueOnce(
          createLambdaError('TooManyRequestsException', 429, 'Rate limit exceeded')
        );

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toThrow(
          /TooManyRequestsException/
        );
      });

      it('should include error message in WorkerError message when name is missing', async () => {
        mockSend.mockImplementationOnce(() => {
          const error = new Error('Some error without name') as any;
          // Don't set a name - test that message is used as fallback
          error.name = '';
          return Promise.reject(error);
        });

        await expect(invoker.invoke(mockJob, mockClanker)).rejects.toThrow(
          /Some error without name/
        );
      });
    });
  });

  describe('name property', () => {
    it('should have correct invoker name', () => {
      expect(invoker.name).toBe('LambdaInvoker');
    });
  });
});
