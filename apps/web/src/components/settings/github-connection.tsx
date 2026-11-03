"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SettingsDTO, SystemInfo } from "@techgens/core";
import { CircleCheck, ExternalLink, Github, KeyRound, Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useApiMutation } from "@/lib/mutations";
import { qk } from "@/lib/queries";

interface ManifestResponse {
  action: string;
  manifest: string;
  state: string;
}

const MODE_LABEL: Record<NonNullable<SettingsDTO["github"]["mode"]>, string> = {
  pat: "Fine-grained personal access token",
  app: "GitHub App",
  demo: "Demo (simulated GitHub)",
};

/** Posts the GitHub App manifest to GitHub via a hidden form (manifest flow). */
function submitManifest({ action, manifest, state }: ManifestResponse) {
  const url = new URL(action, window.location.href);
  if (state && !url.searchParams.has("state")) url.searchParams.set("state", state);
  const form = document.createElement("form");
  form.method = "post";
  form.action = url.toString();
  form.style.display = "none";
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "manifest";
  input.value = manifest;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}

export function GithubConnection({
  settings,
  system,
}: {
  settings: SettingsDTO;
  system: SystemInfo | undefined;
}) {
  const queryClient = useQueryClient();
  const gh = settings.github;
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState(gh.owner ?? "");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [showConnect, setShowConnect] = useState(!gh.connected);

  const onSettings = (result: SettingsDTO) => {
    queryClient.setQueryData(qk.settings, result);
    void queryClient.invalidateQueries({ queryKey: qk.system });
  };

  const saveToken = useApiMutation(
    (value: string) => api.post<SettingsDTO>("/api/settings/github/token", { token: value }),
    {
      success: (r) => (r.github.login ? `Connected to GitHub as ${r.github.login}` : "GitHub token saved"),
      errorTitle: "GitHub rejected the token",
      onSuccess: (result) => {
        onSettings(result);
        setToken("");
        setShowConnect(false);
      },
    },
  );

  const createApp = useApiMutation(
    (body: { owner?: string }) => api.post<ManifestResponse>("/api/settings/github/app", body),
    {
      errorTitle: "Couldn't start the GitHub App setup",
      onSuccess: (result) => submitManifest(result),
    },
  );

  const disconnect = useApiMutation(() => api.del<SettingsDTO | undefined>("/api/settings/github"), {
    success: "GitHub disconnected",
    errorTitle: "Couldn't disconnect GitHub",
    onSuccess: (result) => {
      if (result) onSettings(result);
      else void queryClient.invalidateQueries({ queryKey: qk.settings });
      setConfirmDisconnect(false);
      setShowConnect(true);
    },
  });

  function submitToken(event: FormEvent) {
    event.preventDefault();
    if (token.trim()) saveToken.mutate(token.trim());
  }

  return (
    <Card>
      <CardHeader
        title="GitHub connection"
        description="Repositories, issues, pull requests, Actions and the Copilot coding agent run through this connection."
        icon={Github}
        action={
          gh.connected ? (
            <Badge tone="success" dot size="md">
              Connected
            </Badge>
          ) : (
            <Badge tone="danger" dot size="md">
              Not connected
            </Badge>
          )
        }
      />
      <CardContent className="space-y-5">
        {gh.connected ? (
          <div className="flex flex-col gap-3 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.05] p-4 sm:flex-row sm:items-center">
            <CircleCheck aria-hidden className="size-5 shrink-0 text-emerald-300" />
            <dl className="grid flex-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-subtle">Account</dt>
                <dd className="font-medium">{gh.login ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-subtle">Method</dt>
                <dd>
                  {gh.mode ? MODE_LABEL[gh.mode] : "—"}
                  {gh.appSlug ? (
                    <a
                      href={`https://github.com/apps/${gh.appSlug}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="ml-1.5 inline-flex items-center gap-0.5 text-accent hover:underline"
                    >
                      {gh.appSlug} <ExternalLink aria-hidden className="size-3" />
                    </a>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-subtle">Owner</dt>
                <dd>{gh.owner ?? "—"}</dd>
              </div>
            </dl>
            <div className="flex gap-2">
              {!showConnect ? (
                <Button variant="ghost" size="sm" onClick={() => setShowConnect(true)}>
                  Change
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="border-rose-400/40 text-rose-200 hover:bg-rose-500/10"
                onClick={() => setConfirmDisconnect(true)}
              >
                <Unplug />
                Disconnect
              </Button>
            </div>
          </div>
        ) : null}

        {system && (system.demoMode || system.runtime.kind === "fake") ? (
          <p className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-sm text-amber-100">
            Demo mode: agents run on a simulated runtime{gh.mode === "demo" ? " and GitHub is simulated" : ""}
            . Connect GitHub and sign in to Copilot on the orchestrator host to run real agents.
          </p>
        ) : null}

        {showConnect ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-accent/30 bg-accent/[0.04] p-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Create a GitHub App</h3>
                <Badge tone="accent">Recommended</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">
                Creates a dedicated app with exactly the permissions Techgens needs, using GitHub&apos;s
                manifest flow. You&apos;ll be redirected to GitHub and back.
              </p>
              <form
                className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
                onSubmit={(event) => {
                  event.preventDefault();
                  createApp.mutate(owner.trim() ? { owner: owner.trim() } : {});
                }}
              >
                <Field
                  label="Organisation"
                  htmlFor="gh-owner"
                  hint="Leave empty to use your personal account."
                  className="flex-1"
                >
                  <Input
                    id="gh-owner"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    placeholder="acme-inc"
                  />
                </Field>
                <Button
                  type="submit"
                  variant="primary"
                  loading={createApp.isPending}
                  className="sm:mb-[22px]"
                >
                  {createApp.isPending ? null : <Github />}
                  Create GitHub App
                </Button>
              </form>
            </section>
            <section className="rounded-lg border border-border p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound aria-hidden className="size-4 text-subtle" /> Use a fine-grained token
              </h3>
              <p className="mt-1 text-sm text-muted">
                Read/write on Contents, Issues, Pull requests, Actions, Workflows, Environments and
                Administration (to create repos).{" "}
                <a
                  href="https://github.com/settings/personal-access-tokens/new"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-0.5 text-accent hover:underline"
                >
                  Create a token <ExternalLink aria-hidden className="size-3" />
                </a>
              </p>
              <form className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={submitToken}>
                <Field
                  label="Personal access token"
                  htmlFor="gh-token"
                  className="flex-1"
                  hint="Stored encrypted on the orchestrator."
                >
                  <Input
                    id="gh-token"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="github_pat_…"
                    className="font-mono"
                  />
                </Field>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={!token.trim()}
                  loading={saveToken.isPending}
                  className="sm:mb-[22px]"
                >
                  Save token
                </Button>
              </form>
            </section>
          </div>
        ) : null}
      </CardContent>
      <ConfirmDialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        onConfirm={() => disconnect.mutate()}
        loading={disconnect.isPending}
        title="Disconnect GitHub?"
        description="Agents lose access to repositories, issues and pull requests until you reconnect. Work in progress pauses at the next GitHub step."
        confirmLabel="Disconnect"
      />
    </Card>
  );
}
