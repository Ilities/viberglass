import type { Row } from "../../../demo/bundle/jsonValues";
import { PiStartupNoticeRepair, withoutStartupNotice } from "../../../demo/export/PiStartupNoticeRepair";

const NOTICE =
  "pi v1.0.2\n---\n\n## Skills\n- /home/viberator/.agents/skills/viberglass-app/SKILL.md\n\n---\nNew version available: v1.5.2 (installed v1.0.2). Run: `npm i -g @earendil-works/pi-coding-agent`\n";
const REPLY = "I'll start by reading the repository instructions. Then the code.\n\n- first\n- second";

const repair = new PiStartupNoticeRepair();

describe("PiStartupNoticeRepair", () => {
  it("strips the notice from a turn's markdown and reply and works out its intent again", () => {
    const [turn] = repair.repair("agent_turns", [
      {
        id: "t1",
        content_markdown: `${NOTICE}\n${REPLY}`,
        content_json: { reply: `${NOTICE}\n${REPLY}`, intent: "pi v1.0.2", commit: null, contextUsage: { size: 128000, used: 43715 } },
      },
    ]);

    expect(turn).toEqual({
      id: "t1",
      content_markdown: REPLY,
      content_json: { reply: REPLY, intent: "I'll start by reading the repository instructions.", commit: null, contextUsage: { size: 128000, used: 43715 } },
    });
  });

  it("leaves out an event that held only the notice and keeps the others", () => {
    const rows: Row[] = [
      { id: "e1", event_type: "assistant_message", payload_json: { text: NOTICE } },
      { id: "e2", event_type: "assistant_message", payload_json: { text: REPLY } },
    ];
    const repaired = repair.repair("agent_session_events", rows);

    expect(repaired).toHaveLength(1);
    expect(repaired[0]).toBe(rows[1]);
  });

  it("ends the notice at its update line, so a list after it stays", () => {
    expect(withoutStartupNotice("pi v1.0.2\n---\n\n## Skills\n- /a/SKILL.md\n\n---\n\nDone.")).toBe("Done.");
    expect(withoutStartupNotice(`${NOTICE}\n- first\n- second`)).toBe("- first\n- second");
  });

  it("does not touch replies that only look like the notice's sections", () => {
    const plan = "## Context\n- the API\n\n## Approach\nAdd a route.";
    expect(withoutStartupNotice(plan)).toBe(plan);
    const rows: Row[] = [{ id: "t2", content_markdown: plan, content_json: { reply: plan, intent: "Context" } }];
    expect(repair.repair("agent_turns", rows)[0]).toBe(rows[0]);
  });
});
