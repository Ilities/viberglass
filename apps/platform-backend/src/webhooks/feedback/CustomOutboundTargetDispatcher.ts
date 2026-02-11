import axios, { type AxiosInstance } from "axios";
import crypto from "crypto";
import type { JobResult } from "../../types/Job";
import type { JobWithTicket, OutboundWebhookEventType } from "./types";
import type { CustomOutboundTargetConfig } from "./customOutboundTargetConfig";

interface CustomOutboundDispatchParams {
  target: CustomOutboundTargetConfig;
  eventType: OutboundWebhookEventType;
  job: JobWithTicket;
  result?: JobResult;
}

export class CustomOutboundTargetDispatcher {
  constructor(private httpClient: Pick<AxiosInstance, "request"> = axios) {}

  async dispatch(params: CustomOutboundDispatchParams): Promise<Record<string, unknown>> {
    const payload = this.createPayload(params);
    const payloadText = JSON.stringify(payload);
    const headers = this.createHeaders(params.target, params.eventType, payloadText);

    await this.httpClient.request({
      method: params.target.method,
      url: params.target.targetUrl,
      headers,
      data: payload,
      timeout: 10000,
    });

    return payload;
  }

  private createPayload(params: CustomOutboundDispatchParams): Record<string, unknown> {
    return {
      eventType: params.eventType,
      occurredAt: new Date().toISOString(),
      job: {
        id: params.job.id,
        ticketId: params.job.ticketId,
        status: params.job.status,
        repository: params.job.repository || null,
      },
      result: params.result || null,
    };
  }

  private createHeaders(
    target: CustomOutboundTargetConfig,
    eventType: OutboundWebhookEventType,
    payloadText: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-viberglass-event": eventType,
      ...target.headers,
    };

    this.applyAuthHeaders(headers, target);

    if (target.signingSecret) {
      const signature = this.createSignature(
        target.signatureAlgorithm,
        target.signingSecret,
        payloadText,
      );
      headers["x-viberglass-signature"] = signature;
      headers["x-viberglass-signature-algorithm"] = target.signatureAlgorithm;
    }

    return headers;
  }

  private applyAuthHeaders(
    headers: Record<string, string>,
    target: CustomOutboundTargetConfig,
  ): void {
    if (target.auth.type === "bearer" && target.auth.token) {
      headers.authorization = `Bearer ${target.auth.token}`;
      return;
    }

    if (
      target.auth.type === "basic" &&
      target.auth.username &&
      target.auth.password
    ) {
      const encoded = Buffer.from(
        `${target.auth.username}:${target.auth.password}`,
        "utf8",
      ).toString("base64");
      headers.authorization = `Basic ${encoded}`;
      return;
    }

    if (
      target.auth.type === "header" &&
      target.auth.headerName &&
      target.auth.headerValue
    ) {
      headers[target.auth.headerName] = target.auth.headerValue;
    }
  }

  private createSignature(
    algorithm: "sha256" | "sha1",
    secret: string,
    payload: string,
  ): string {
    const digest = crypto
      .createHmac(algorithm, secret)
      .update(payload, "utf8")
      .digest("hex");

    return `${algorithm}=${digest}`;
  }
}
