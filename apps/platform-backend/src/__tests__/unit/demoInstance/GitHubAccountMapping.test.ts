import type { Row } from "../../../demo/bundle/jsonValues";
import { parseExportConfig } from "../../../demo/export/exportConfig";
import { GitHubAccountMapping } from "../../../demo/export/GitHubAccountMapping";

const mapping = new GitHubAccountMapping(parseExportConfig({ githubAccounts: { Xantier: { name: "Dev Patel" } } }).githubAccounts);

describe("GitHubAccountMapping", () => {
  it("shows the merging account as the persona's login and keeps the pull request link", () => {
    const created = new Date("2026-11-01T12:00:00Z");
    const [activity] = mapping.repair("task_activity", [
      {
        id: "a1",
        kind: "pull_request_merged",
        created_at: created,
        payload_json: { merged: true, mergedBy: "Xantier", pullRequestUrl: "https://github.com/Xantier/acme-website/pull/5" },
      },
    ]);

    expect(activity).toEqual({
      id: "a1",
      kind: "pull_request_merged",
      created_at: created,
      payload_json: { merged: true, mergedBy: "devpatel", pullRequestUrl: "https://github.com/Xantier/acme-website/pull/5" },
    });
  });

  it("uses the name under name keys and in text, the login in mentions, and clears the account's avatar", () => {
    const [row] = mapping.repair("task_messages", [
      {
        id: "m1",
        body: "Done · merged by xantier, thanks @Xantier. See Xantier/acme-website.",
        review: { login: "Xantier", name: "Xantier", avatar_url: "https://avatars.githubusercontent.com/u/1?v=4" },
        other: { login: "someone", avatar_url: "https://avatars.githubusercontent.com/u/2?v=4" },
      },
    ]);

    expect(row).toEqual({
      id: "m1",
      body: "Done · merged by Dev Patel, thanks @devpatel. See Xantier/acme-website.",
      review: { login: "devpatel", name: "Dev Patel", avatar_url: null },
      other: { login: "someone", avatar_url: "https://avatars.githubusercontent.com/u/2?v=4" },
    });
  });

  it("leaves rows without the account and longer logins alone", () => {
    const rows: Row[] = [{ id: "a2", payload_json: { mergedBy: "Xantier2", text: "XantierBot opened it" } }];
    const repaired = mapping.repair("task_activity", rows);
    expect(repaired[0]).toBe(rows[0]);
  });

  it("takes an explicit login and avatar, and needs a name", () => {
    const config = parseExportConfig({ githubAccounts: { Xantier: { name: "Dev Patel", login: "dev-p", avatarUrl: "/avatars/dev.png" } } });
    expect(config.githubAccounts).toEqual({ Xantier: { login: "dev-p", name: "Dev Patel", avatarUrl: "/avatars/dev.png" } });
    expect(() => parseExportConfig({ githubAccounts: { Xantier: { login: "dev" } } })).toThrow("githubAccounts.Xantier needs a name");
  });
});
