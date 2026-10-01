import { GetAccountCommand, GetEmailIdentityCommand, SESv2Client } from "@aws-sdk/client-sesv2";

export interface EmailSetupState {
  domain: string;
  region: string;
  /** Whether Pulumi created the DKIM records in Route 53. */
  dkimRecordsManaged: boolean;
  dkimRecords: Array<{ name: string; value: string }>;
  /** SES's DKIM status for the domain: SUCCESS once the records resolve. */
  dkimStatus: string | undefined;
  /** Null when the account couldn't be checked. */
  productionAccess: boolean | null;
}

/**
 * Whether the SES account in this region may send to anyone. Pulumi has no
 * data source for it, so this asks SES with the credentials Pulumi runs with.
 */
export async function sesProductionAccess(region: string): Promise<boolean | null> {
  try {
    const account = await new SESv2Client({ region }).send(new GetAccountCommand({}));
    return account.ProductionAccessEnabled ?? false;
  } catch {
    return null;
  }
}

/**
 * The domain's DKIM status as SES sees it now. Pulumi's stored value only
 * changes on `pulumi refresh`; null before the identity exists.
 */
export async function sesDkimStatus(region: string, domain: string): Promise<string | null> {
  try {
    const identity = await new SESv2Client({ region }).send(new GetEmailIdentityCommand({ EmailIdentity: domain }));
    return identity.DkimAttributes?.Status ?? null;
  } catch {
    return null;
  }
}

/** What the person running the stack still has to do by hand before email reaches people. */
export function emailSetupSteps(state: EmailSetupState): string[] {
  const steps: string[] = [];
  const consoleUrl = `https://${state.region}.console.aws.amazon.com/ses/home?region=${state.region}`;

  if (state.dkimStatus !== "SUCCESS") {
    steps.push(
      state.dkimRecordsManaged
        ? `Email: nothing to do. SES is verifying ${state.domain} through the DKIM records this stack added to Route 53, usually within minutes (AWS allows up to 72 hours). Email starts on its own once it's verified; until then invite links can be copied by hand. Status: ${consoleUrl}#/identities`
        : `Email: add these CNAME records to the DNS of ${state.domain}. SES verifies the domain soon after they resolve, and email starts on its own; until then invite links can be copied by hand:\n${state.dkimRecords
            .map((record) => `  ${record.name}  CNAME  ${record.value}`)
            .join("\n")}`,
    );
  }

  if (state.productionAccess === false) {
    steps.push(
      `Email: the SES account in ${state.region} is in the sandbox, so it only delivers to addresses verified in SES. Request production access: AWS console → Amazon SES (${state.region}) → Account dashboard → Request production access (${consoleUrl}#/account). AWS usually answers within a day. Until then, verify your own address under Identities to test.`,
    );
  } else if (state.productionAccess === null) {
    steps.push(
      `Email: couldn't check whether the SES account in ${state.region} has production access. Check AWS console → Amazon SES → Account dashboard (${consoleUrl}#/account); a sandboxed account only delivers to verified addresses.`,
    );
  }

  return steps;
}
