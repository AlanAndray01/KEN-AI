import type { PublicAIModel, PublicAIProvider } from "@Ken/shared";
import { request } from "./client";

export const modelsApi = {
  list: () => request<{ models: PublicAIModel[] }>("/models"),
};

export const providersApi = {
  list: () => request<{ providers: PublicAIProvider[] }>("/providers"),
};
