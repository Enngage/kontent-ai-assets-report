import { createManagementClient } from "@kontent-ai/management-sdk";

export const environmentId: string = "";
const apiKey: string = "";

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
