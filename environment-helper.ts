import { config } from "dotenv";

export class EnvironmentHelper {
  constructor() {
    config({
      path: ".env",
    });
  }

  getRequiredValue(variableName: string): string {
    // get value from environment variables first
    let value = process.env[variableName];

    if (!value) {
      throw Error(`Missing environment variable '${variableName}'`);
    }

    return value;
  }

  getBooleanValue(variableName: string): boolean {
    let value = process.env[variableName];
    return value?.toLowerCase() === "true".toLowerCase();
  }

  getOptionalValue(variableName: string): string | undefined {
    // get value from environment variables first
    let value = process.env[variableName];

    if (!value) {
      return undefined;
    }

    return value;
  }
}

export const environmentHelper = new EnvironmentHelper();
