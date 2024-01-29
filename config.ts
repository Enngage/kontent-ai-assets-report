import { createManagementClient } from "@kontent-ai/management-sdk";
import { environmentHelper } from "./environment-helper";

export const environmentId: string =
  environmentHelper.getRequiredValue("ENVIRONMENT_ID");
const apiKey: string = environmentHelper.getRequiredValue("MANAGEMENT_API_KEY");

export const managementClient = createManagementClient({
  environmentId: environmentId,
  apiKey: apiKey,
  retryStrategy: {
    addJitter: true,
    canRetryError: (error) => {
      return true;
    },
  },
});

export const unusedAssetsFilename = `_unused-assets`;
export const duplicateAssetsFilename = `_duplicate-assets`;
