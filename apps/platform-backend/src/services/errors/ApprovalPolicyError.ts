import { DomainError } from "./DomainError";

export const APPROVAL_POLICY_ERROR_CODE = {
  NO_PERSON: "APPROVAL_NO_PERSON",
  NOT_ELIGIBLE: "APPROVAL_NOT_ELIGIBLE",
} as const;

export type ApprovalPolicyErrorCode = (typeof APPROVAL_POLICY_ERROR_CODE)[keyof typeof APPROVAL_POLICY_ERROR_CODE];

/** Someone who may not approve a step tried to; the message says who can, and is shown as is. */
export class ApprovalPolicyError extends DomainError {
  readonly statusCode = 403;

  constructor(
    public readonly code: ApprovalPolicyErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function isApprovalPolicyError(error: unknown): error is ApprovalPolicyError {
  return error instanceof ApprovalPolicyError;
}
