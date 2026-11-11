import { isPiStartupNotice, piEventMapper } from "../src/piEventMapper";

const NOTICE =
  "pi v1.0.2\n---\n\n## Skills\n- /home/viberator/.agents/skills/viberglass-app/SKILL.md\n\n---\nNew version available: v1.5.2 (installed v1.0.2). Run: `npm i -g @earendil-works/pi-coding-agent`\n";

const chunk = (text: string) => ({ sessionId: "s", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } });

describe("piEventMapper", () => {
  it("drops pi-acp's startup notice, so it isn't the start of the reply", () => {
    expect(piEventMapper.mapSessionUpdate(chunk(NOTICE))).toEqual([]);
  });

  it("recognises the notice with its other sections, or the update notice alone", () => {
    expect(isPiStartupNotice("pi v1.0.2\n---\n\n## Context\n- /work/repo/AGENTS.md\n\n## Extensions\n- npm:pi-mcp\n  - index.ts\n")).toBe(true);
    expect(isPiStartupNotice("New version available: v1.5.2 (installed v1.0.2). Run: `npm i -g @earendil-works/pi-coding-agent`\n")).toBe(true);
  });

  it("keeps what the agent says, even when it talks about Pi or lists things", () => {
    expect(piEventMapper.mapSessionUpdate(chunk("I'll start by reading the repository"))).toEqual([
      { eventType: "assistant_message", payload: { text: "I'll start by reading the repository" } },
    ]);
    expect(isPiStartupNotice("pi v1.0.2 is the installed version, and this repository needs Node 22.")).toBe(false);
    expect(isPiStartupNotice("## Skills\n- drawing the boss sprite\nThat's the plan.")).toBe(false);
    expect(isPiStartupNotice("- ")).toBe(false);
  });
});
