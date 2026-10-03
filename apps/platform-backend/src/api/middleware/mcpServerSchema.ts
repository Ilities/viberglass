import Joi from "joi";
import { HTTP_HEADER_NAME_PATTERN, MCP_SERVER_NAME_PATTERN, RESERVED_MCP_SERVER_NAMES } from "@viberglass/types";

const headerSchema = Joi.alternatives().try(
  Joi.object({
    name: Joi.string().pattern(HTTP_HEADER_NAME_PATTERN).max(255).required(),
    value: Joi.string().max(4096).allow("").required(),
  }),
  Joi.object({
    name: Joi.string().pattern(HTTP_HEADER_NAME_PATTERN).max(255).required(),
    secretId: Joi.string().uuid().required(),
    prefix: Joi.string().max(255).allow("").optional(),
  }),
);

export const mcpServerSchema = Joi.object({
  name: Joi.string()
    .trim()
    .pattern(MCP_SERVER_NAME_PATTERN)
    .invalid(...RESERVED_MCP_SERVER_NAMES)
    .required()
    .messages({
      "string.pattern.base": "Name must be lowercase letters, digits, - and _, starting with a letter or digit",
      "any.invalid": "This name is used by Viberglass itself",
    }),
  description: Joi.string().trim().max(1000).allow(null, "").optional(),
  url: Joi.string().trim().uri({ scheme: ["http", "https"] }).max(2048).required(),
  headers: Joi.array()
    .items(headerSchema)
    .max(20)
    .unique((a: { name: string }, b: { name: string }) => a.name.toLowerCase() === b.name.toLowerCase())
    .default([]),
});
