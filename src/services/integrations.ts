import type { IntegrationCredentials, IntegrationRecord } from "@/lib/audit/types";
import { getStore } from "@/lib/storage";
import {
  hydrateCredentialSecret,
  storeCredentialSecret,
} from "./credential-vault";

export async function createIntegrationWithVault(
  clientId: string,
  input: Pick<
    IntegrationRecord,
    "platformKey" | "platformType" | "displayName" | "credentials" | "settings"
  >,
) {
  const store = await getStore();
  const credentials = await storeCredentialSecret(input.credentials);
  return store.createIntegration(clientId, {
    ...input,
    credentials,
  });
}

export async function updateIntegrationWithVault(
  id: string,
  patch: Partial<Pick<IntegrationRecord, "displayName" | "credentials" | "settings">>,
) {
  const store = await getStore();
  const current = await store.getIntegration(id);
  if (!current) {
    return null;
  }

  const nextCredentials = patch.credentials
    ? await storeCredentialSecret(
        {
          ...current.credentials,
          ...patch.credentials,
        },
        current.credentials.secretRef,
      )
    : current.credentials;

  return store.updateIntegration(id, {
    displayName: patch.displayName,
    settings: patch.settings,
    credentials: nextCredentials,
  });
}

export async function hydrateIntegrationForExecution<T extends IntegrationRecord>(integration: T): Promise<T> {
  return {
    ...integration,
    credentials: await hydrateCredentialSecret(integration.credentials),
  };
}

export async function hydrateCredentials(credentials: IntegrationCredentials) {
  return hydrateCredentialSecret(credentials);
}
