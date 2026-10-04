import Joi from "joi";
import { HTTP_HEADER_NAME_PATTERN } from "@viberglass/types";

export const modelEndpointSchema = Joi.object({
  name: Joi.string().trim().min(1).max(64).required(),
  baseUrl: Joi.string()
    .trim()
    .uri({ scheme: ["http", "https"] })
    .max(2048)
    .required(),
  apiFormat: Joi.string()
    .valid("openai-chat", "openai-responses", "anthropic-messages")
    .required(),
  auth: Joi.alternatives()
    .try(
      Joi.object({ scheme: Joi.string().valid("bearer", "none").required() }),
      Joi.object({
        scheme: Joi.string().valid("header").required(),
        header: Joi.string()
          .pattern(HTTP_HEADER_NAME_PATTERN)
          .max(255)
          .required(),
      }),
    )
    .required(),
  secretId: Joi.string().uuid().allow(null).optional(),
  extraHeaders: Joi.object()
    .pattern(
      HTTP_HEADER_NAME_PATTERN,
      Joi.string()
        .max(4096)
        .pattern(/^[^\r\n]*$/)
        .allow(""),
    )
    .max(20)
    .default({}),
  models: Joi.array()
    .items(Joi.string().trim().min(1).max(255))
    .unique()
    .max(1000)
    .default([]),
  mayColdStart: Joi.boolean().default(false),
});
