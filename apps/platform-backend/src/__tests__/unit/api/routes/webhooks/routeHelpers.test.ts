import type { Response } from 'express';
import {
  getRequestRawBody,
  respondWithWebhookResult,
} from '../../../../../api/routes/webhooks/routeHelpers';

function createMockResponse(): Response {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;

  (res.status as unknown as jest.Mock).mockReturnValue(res);
  (res.json as unknown as jest.Mock).mockReturnValue(res);
  return res;
}

describe('routeHelpers', () => {
  describe('respondWithWebhookResult', () => {
    it('returns processed payload with 200 status', () => {
      const res = createMockResponse();

      respondWithWebhookResult(res, {
        status: 'processed',
        ticketId: 'ticket-1',
        jobId: 'job-1',
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Webhook processed successfully',
        ticketId: 'ticket-1',
        jobId: 'job-1',
      });
    });

    it('answers 400 to a payload the sender has to fix and 404 to an unknown address', () => {
      const invalid = createMockResponse();
      respondWithWebhookResult(invalid, { status: 'invalid', reason: 'Missing required field: title' });
      expect(invalid.status).toHaveBeenCalledWith(400);
      expect(invalid.json).toHaveBeenCalledWith({ error: 'Invalid webhook payload', reason: 'Missing required field: title' });

      const notFound = createMockResponse();
      respondWithWebhookResult(notFound, { status: 'not_found', reason: 'No webhook with this address' });
      expect(notFound.status).toHaveBeenCalledWith(404);
    });

    it('supports custom duplicate/failed response options', () => {
      const duplicateRes = createMockResponse();

      respondWithWebhookResult(
        duplicateRes,
        {
          status: 'duplicate',
          existingId: 'existing-1',
        },
        {
          duplicateMessage: 'Delivery already succeeded',
        },
      );

      expect(duplicateRes.status).toHaveBeenCalledWith(200);
      expect(duplicateRes.json).toHaveBeenCalledWith({
        message: 'Delivery already succeeded',
        existingId: 'existing-1',
      });

      const duplicateWithoutIdRes = createMockResponse();
      respondWithWebhookResult(
        duplicateWithoutIdRes,
        {
          status: 'duplicate',
          existingId: 'existing-2',
        },
        {
          duplicateMessage: 'Delivery already succeeded',
          includeExistingId: false,
        },
      );

      expect(duplicateWithoutIdRes.status).toHaveBeenCalledWith(200);
      expect(duplicateWithoutIdRes.json).toHaveBeenCalledWith({
        message: 'Delivery already succeeded',
      });

      const failedRes = createMockResponse();

      respondWithWebhookResult(
        failedRes,
        {
          status: 'failed',
          reason: 'test failure',
        },
        {
          failedError: 'Retry failed',
          failedStatusCode: 400,
        },
      );

      expect(failedRes.status).toHaveBeenCalledWith(400);
      expect(failedRes.json).toHaveBeenCalledWith({
        error: 'Retry failed',
        reason: 'test failure',
      });
    });
  });

  describe('getRequestRawBody', () => {
    it('returns request raw body when available', () => {
      const rawBody = Buffer.from('hello');
      const req = { rawBody } as any;

      expect(getRequestRawBody(req)).toBe(rawBody);
    });

    it('throws when raw body is missing', () => {
      const req = {} as any;

      expect(() => getRequestRawBody(req)).toThrow(
        'Missing raw body for webhook request',
      );
    });
  });
});
