import type { IAM } from "@aws-sdk/client-iam";
import { ecsAppRoleName, ecsAppRolePolicy, ecsAppTrustPolicy } from "./ecsAppResources";

// IAM is eventually consistent: ECS may not be able to take a role created a moment ago.
const NEW_ROLE_SETTLE_MS = 10_000;
const POLICY_NAME = "app-data";

export interface EcsAppRolesOptions {
  prefix: string;
  rolePath: string;
  permissionsBoundaryArn: string;
  bucket: string;
}

/** Each App space's two task roles: the live app's and its previews', each reaching only that space's replica. */
export class EcsAppRoles {
  constructor(
    private readonly options: EcsAppRolesOptions,
    private readonly iam: () => Promise<Pick<IAM, "getRole" | "createRole" | "putRolePolicy" | "deleteRolePolicy" | "deleteRole">>,
    private readonly sleep: (ms: number) => Promise<void>,
  ) {}

  /** The role exists before its first task, with a policy that only reaches this App space's replica. */
  async ensure(projectId: string, preview: boolean): Promise<string> {
    const iam = await this.iam();
    const RoleName = ecsAppRoleName(this.options.prefix, projectId, preview);
    let arn: string | undefined;
    let created = false;
    try {
      arn = (await iam.getRole({ RoleName })).Role?.Arn;
    } catch (error) {
      if (awsErrorName(error) !== "NoSuchEntityException") throw error;
      arn = (await iam.createRole({
        RoleName,
        Path: this.options.rolePath,
        PermissionsBoundary: this.options.permissionsBoundaryArn,
        AssumeRolePolicyDocument: JSON.stringify(ecsAppTrustPolicy(accountOf(this.options.permissionsBoundaryArn))),
        Description: preview ? `Previews of Viberglass app ${projectId}` : `Viberglass app ${projectId}`,
        Tags: [{ Key: "viberglass:app-project", Value: projectId }],
      })).Role?.Arn;
      created = true;
    }
    if (!arn) throw new Error(`IAM returned no role for ${RoleName}`);
    await iam.putRolePolicy({
      RoleName,
      PolicyName: POLICY_NAME,
      PolicyDocument: JSON.stringify(ecsAppRolePolicy(this.options.bucket, projectId, preview)),
    });
    if (created) await this.sleep(NEW_ROLE_SETTLE_MS);
    return arn;
  }

  /** Both of the space's roles; one that's already gone is fine. */
  async remove(projectId: string): Promise<void> {
    const iam = await this.iam();
    for (const preview of [false, true]) {
      const RoleName = ecsAppRoleName(this.options.prefix, projectId, preview);
      await ignoreMissing(() => iam.deleteRolePolicy({ RoleName, PolicyName: POLICY_NAME }));
      await ignoreMissing(() => iam.deleteRole({ RoleName }));
    }
  }
}

async function ignoreMissing(call: () => Promise<unknown>): Promise<void> {
  try {
    await call();
  } catch (error) {
    if (awsErrorName(error) !== "NoSuchEntityException") throw error;
  }
}

function awsErrorName(error: unknown): string | undefined {
  return error instanceof Error ? error.name : undefined;
}

function accountOf(arn: string): string {
  const account = arn.split(":")[4];
  if (!account) throw new Error(`Can't read the AWS account from ${arn}`);
  return account;
}
