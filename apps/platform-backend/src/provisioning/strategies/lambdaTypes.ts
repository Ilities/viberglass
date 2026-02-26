export interface LambdaFunctionDetails {
  functionName?: string;
  functionArn?: string;
  imageUri?: string;
  roleArn?: string;
  version?: string;
  state?: string;
  lastModified?: string;
  memorySize?: number;
  timeout?: number;
  architectures?: string[];
}

export interface LambdaProvisioningConfig {
  type: "lambda";
  provisioningMode?: "managed" | "prebuilt";
  functionName?: string;
  functionArn?: string;
  functionDetails?: LambdaFunctionDetails;
  imageUri?: string;
  roleArn?: string;
  memorySize?: number;
  timeout?: number;
  ephemeralStorage?: number;
  environment?: Record<string, string>;
  architecture?: "x86_64" | "arm64";
  vpc?: {
    subnetIds?: string[];
    securityGroupIds?: string[];
  };
  region?: string;
}
