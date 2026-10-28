import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useContext, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthProvider";
import { AuthContext, type AuthContextValue } from "./auth-context";
import { useDraftStore } from "@/stores/draftStore";

vi.mock("@/query", () => ({ prefetchSignedInWorkspace: () => () => {} }));

afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); localStorage.clear(); });

it("removes private queries and page state on account changes, including late query completion", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let current = "a";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).endsWith("/auth/login")) current = "b";
    return Response.json({ user: { id: current, name: current, email: `${current}@test.invalid`,
      role: "user", preferences: { theme: "dark", language: "en", sendOnEnter: false } } });
  }));
  let auth!: AuthContextValue;
  function Probe() {
    auth = useContext(AuthContext);
    const [pageOwner] = useState(auth.user?.id ?? "guest");
    return <div>{auth.user?.id ?? "guest"}:{pageOwner}</div>;
  }
  render(<QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
  await screen.findByText("a:a");
  client.setQueryData(["conversations"], ["private A"]);
  useDraftStore.getState().setDraft("new", "private A");
  let complete!: (value: string) => void;
  const pending = client.fetchQuery({ queryKey: ["files"], queryFn: () => new Promise<string>(resolve => { complete = resolve; }) }).catch(() => undefined);
  await act(async () => { await auth.logout(); });
  expect(client.getQueryData(["conversations"])).toBeUndefined();
  expect(useDraftStore.getState().drafts).toEqual({});
  await act(async () => { await auth.login("b@test.invalid", "fake"); });
  await screen.findByText("b:b");
  complete("private A response");
  await pending;
  await waitFor(() => expect(client.getQueryData(["files"])).toBeUndefined());
  expect(useDraftStore.getState().drafts.new).toBeUndefined();
  client.clear();
});
