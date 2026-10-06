import Joi from "joi";
import { MODEL_HOST_KINDS } from "@viberglass/types";

const secretValue = Joi.string().trim().min(1).max(4096);

export const modelHostAccountSchema = Joi.object({
  name: Joi.string().trim().min(1).max(64).required(),
  host: Joi.string()
    .valid(...MODEL_HOST_KINDS)
    .required(),
  clientId: Joi.string().trim().min(1).max(512).required(),
  clientSecret: secretValue.optional(),
  endpointKey: secretValue.optional(),
  huggingFaceToken: Joi.string().trim().max(4096).allow("").optional(),
});

export const modelDeploymentSchema = Joi.object({
  name: Joi.string().trim().min(1).max(64).required(),
  accountId: Joi.string().uuid().required(),
  model: Joi.string()
    .trim()
    .pattern(/^[\w.-]+\/[\w.-]+$/)
    .max(255)
    .required()
    .messages({ "string.pattern.base": "Enter a Hugging Face model id, like Qwen/Qwen3-8B." }),
  flavour: Joi.object({
    id: Joi.string().trim().min(1).max(128).required(),
    gpuCount: Joi.number().integer().min(1).max(8).required(),
  }).required(),
  servingArgs: Joi.array()
    .items(Joi.string().max(4096))
    .max(100)
    .default([]),
});

export const modelDeploymentModeSchema = Joi.object({
  mode: Joi.string().valid("scale-to-zero", "keep-warm", "stopped").required(),
});
