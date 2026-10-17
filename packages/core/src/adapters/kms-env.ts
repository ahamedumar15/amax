import type { Env } from "../env";
import { awsKms, azureKeyVault } from "./kms-cloud";
import { localKms, parseKeyFile, type Kms } from "./kms";

export function kmsFromEnv(env: Env, readKeyFile: (path: string) => string): Kms | null {
  switch (env.AMAX_KMS) {
    case "local":
      return localKms(parseKeyFile(readKeyFile(env.AMAX_KMS_KEY_FILE!)));
    case "aws":
      return awsKms({ region: env.AWS_REGION!, keyId: env.AMAX_KMS_AWS_KEY_ID!, accessKeyId: env.AWS_ACCESS_KEY_ID!, secretAccessKey: env.AWS_SECRET_ACCESS_KEY!, sessionToken: env.AWS_SESSION_TOKEN });
    case "azure":
      return azureKeyVault({ vaultUrl: env.AMAX_KMS_AZURE_VAULT_URL!, keyName: env.AMAX_KMS_AZURE_KEY!, tenantId: env.AZURE_TENANT_ID!, clientId: env.AZURE_CLIENT_ID!, clientSecret: env.AZURE_CLIENT_SECRET!, region: env.AMAX_KMS_REGION });
    default:
      return null;
  }
}
