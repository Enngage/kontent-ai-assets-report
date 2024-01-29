import { createManagementClient } from "@kontent-ai/management-sdk";

const environmentId: string = "2542ce4a-3be3-01e8-fdf0-ce1b87b58f11";
const apiKey: string =
  "";

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

export const unusedAssetsFilename = `unused-assets`;
