import type { AppRunState } from "@viberglass/types";
import { AppDirectory } from "../../../../services/apps/AppDirectory";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const app = (projectId: string, state: AppRunState = "running") => ({ projectId, slug: projectId, name: projectId, isPrivate: false, state });

function directory(visible: string[] | null, listed: string[]) {
  return new AppDirectory(
    { listLive: async () => [app("laptops"), app("payroll", "off"), app("rota")] },
    { visibleProjectIds: async () => visible },
    { projectIdsFor: async () => listed },
    { originFor: (slug: string) => `https://${slug}.apps.example.com` },
  );
}

describe("AppDirectory", () => {
  it("lists every app for admins", async () => {
    const apps = await directory(null, []).openableBy({ id: "a", role: "admin" });

    expect(apps.map((entry) => entry.slug)).toEqual(["laptops", "payroll", "rota"]);
  });

  it("lists apps in visible spaces and on the person's access lists", async () => {
    const apps = await directory(["laptops"], ["rota"]).openableBy({ id: "m", role: "member" });

    expect(apps).toEqual([
      { projectId: "laptops", name: "laptops", slug: "laptops", state: "running", url: "https://laptops.apps.example.com" },
      { projectId: "rota", name: "rota", slug: "rota", state: "running", url: "https://rota.apps.example.com" },
    ]);
  });

  it("lists only an app user's access lists", async () => {
    const apps = await directory([], ["payroll"]).openableBy({ id: "u", role: "app_user" });

    expect(apps.map((entry) => [entry.slug, entry.state])).toEqual([["payroll", "off"]]);
  });
});
