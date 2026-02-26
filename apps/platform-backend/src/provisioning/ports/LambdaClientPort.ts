import type {
  CreateFunctionCommandInput,
  UpdateFunctionCodeCommandInput,
  UpdateFunctionConfigurationCommandInput,
} from "@aws-sdk/client-lambda";

export interface LambdaFunctionResponse {
  Configuration?: {
    FunctionName?: string;
    FunctionArn?: string;
    Role?: string;
    Version?: string;
    State?: string;
    LastModified?: string;
    MemorySize?: number;
    Timeout?: number;
    Architectures?: string[];
  };
  Code?: {
    ImageUri?: string;
  };
}

export interface LambdaClientPort {
  getFunction(functionName: string): Promise<LambdaFunctionResponse>;
  createFunction(input: CreateFunctionCommandInput): Promise<void>;
  updateFunctionCode(input: UpdateFunctionCodeCommandInput): Promise<void>;
  updateFunctionConfiguration(
    input: UpdateFunctionConfigurationCommandInput,
  ): Promise<void>;
  deleteFunction(functionName: string): Promise<void>;
}
