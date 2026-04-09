import { PromptTemplateService } from "../../../services/PromptTemplateService";
import type {
  PromptTemplateDAO,
  PromptType,
} from "../../../persistence/promptTemplate/PromptTemplateDAO";

// PromptTemplateDAO is injected via constructor, so we use a plain mock object
// rather than jest.mock() at module level.
function makeDao(template: string): jest.Mocked<PromptTemplateDAO> {
  return {
    getEffectiveTemplate: jest.fn().mockResolvedValue(template),
    listForProject: jest.fn(),
    listSystemDefaults: jest.fn(),
    setSystemDefault: jest.fn(),
    setProjectTemplate: jest.fn(),
    deleteProjectTemplate: jest.fn(),
  } as unknown as jest.Mocked<PromptTemplateDAO>;
}

function makeService(template: string): {
  service: PromptTemplateService;
  dao: jest.Mocked<PromptTemplateDAO>;
} {
  const dao = makeDao(template);
  return { service: new PromptTemplateService(dao), dao };
}

async function render(
  template: string,
  vars: Record<string, string | undefined> = {},
  type: PromptType = "ticket_research",
  projectId = "proj-1",
): Promise<string> {
  const { service } = makeService(template);
  return service.render(type, projectId, vars);
}

// ---------------------------------------------------------------------------
// Rendering engine
// ---------------------------------------------------------------------------

describe("PromptTemplateService — rendering engine", () => {
  describe("simple variable substitution {{var}}", () => {
    it("substitutes a present variable", async () => {
      const result = await render("Hello {{name}}!", { name: "world" });
      expect(result).toBe("Hello world!");
    });

    it("substitutes multiple variables", async () => {
      const result = await render("{{a}} + {{b}} = {{c}}", {
        a: "1",
        b: "2",
        c: "3",
      });
      expect(result).toBe("1 + 2 = 3");
    });

    it("replaces an undefined variable with empty string", async () => {
      const result = await render("{{missing}}", {});
      expect(result).toBe("");
    });

    it("replaces an explicitly undefined variable with empty string", async () => {
      const result = await render("{{x}}", { x: undefined });
      expect(result).toBe("");
    });

    it("leaves surrounding text intact when var is missing", async () => {
      const result = await render("prefix-{{missing}}-suffix", {});
      expect(result).toBe("prefix--suffix");
    });
  });

  describe("conditional blocks {{#var}}...{{/var}}", () => {
    it("renders block content when variable is present", async () => {
      const result = await render("{{#name}}Hello {{name}}!{{/name}}", {
        name: "world",
      });
      expect(result).toBe("Hello world!");
    });

    it("hides block when variable is absent", async () => {
      const result = await render("{{#name}}Hello {{name}}!{{/name}}", {});
      expect(result).toBe("");
    });

    it("hides block when variable is undefined", async () => {
      const result = await render("{{#name}}shown{{/name}}", {
        name: undefined,
      });
      expect(result).toBe("");
    });

    it("hides block when variable is empty string", async () => {
      const result = await render("{{#name}}shown{{/name}}", { name: "" });
      expect(result).toBe("");
    });

    it("interpolates inner vars from the vars map", async () => {
      const result = await render(
        "{{#flag}}<tag>{{value}}</tag>{{/flag}}",
        { flag: "yes", value: "content" },
      );
      expect(result).toBe("<tag>content</tag>");
    });

    it("replaces unknown inner vars with empty string", async () => {
      const result = await render("{{#flag}}{{unknown}}{{/flag}}", {
        flag: "yes",
      });
      expect(result).toBe("");
    });

    it("handles multi-line inner content", async () => {
      const result = await render(
        "before\n{{#doc}}\n{{doc}}\n{{/doc}}\nafter",
        { doc: "the document" },
      );
      expect(result).toBe("before\n\nthe document\n\nafter");
    });
  });

  describe("inverted blocks {{^var}}...{{/var}}", () => {
    it("renders block content when variable is absent", async () => {
      const result = await render("{{^name}}(none){{/name}}", {});
      expect(result).toBe("(none)");
    });

    it("renders block content when variable is undefined", async () => {
      const result = await render("{{^name}}(none){{/name}}", {
        name: undefined,
      });
      expect(result).toBe("(none)");
    });

    it("renders block content when variable is empty string", async () => {
      const result = await render("{{^name}}(none){{/name}}", { name: "" });
      expect(result).toBe("(none)");
    });

    it("hides block content when variable is present", async () => {
      const result = await render("{{^name}}(none){{/name}}", {
        name: "world",
      });
      expect(result).toBe("");
    });

    it("interpolates inner vars inside inverted block", async () => {
      const result = await render(
        "{{^doc}}<placeholder>{{fallback}}</placeholder>{{/doc}}",
        { doc: "", fallback: "No document yet" },
      );
      expect(result).toBe("<placeholder>No document yet</placeholder>");
    });
  });

  describe("mixed conditional and inverted blocks", () => {
    const template =
      "{{#doc}}<current-doc>\n{{doc}}\n</current-doc>\n{{/doc}}" +
      "{{^doc}}<current-doc>(empty)</current-doc>\n{{/doc}}";

    it("renders the positive branch when doc is present", async () => {
      const result = await render(template, { doc: "# Research\nContent" });
      expect(result).toBe(
        "<current-doc>\n# Research\nContent\n</current-doc>\n",
      );
    });

    it("renders the negative branch when doc is absent", async () => {
      const result = await render(template, {});
      expect(result).toBe("<current-doc>(empty)</current-doc>\n");
    });
  });
});

// ---------------------------------------------------------------------------
// DAO delegation
// ---------------------------------------------------------------------------

describe("PromptTemplateService — DAO delegation", () => {
  it("calls getEffectiveTemplate with the correct type and projectId", async () => {
    const { service, dao } = makeService("hello");
    await service.render("ticket_developing", "proj-abc", {});
    expect(dao.getEffectiveTemplate).toHaveBeenCalledWith(
      "ticket_developing",
      "proj-abc",
    );
  });

  it("returns the rendered result of the template returned by DAO", async () => {
    const { service } = makeService("Title: {{ticketTitle}}");
    const result = await service.render("ticket_research", "proj-1", {
      ticketTitle: "Fix the bug",
    });
    expect(result).toBe("Title: Fix the bug");
  });

  it("delegates listSystemDefaults to DAO", async () => {
    const { service, dao } = makeService("");
    (dao.listSystemDefaults as jest.Mock).mockResolvedValue([]);
    await service.listSystemDefaults();
    expect(dao.listSystemDefaults).toHaveBeenCalled();
  });

  it("delegates listForProject to DAO", async () => {
    const { service, dao } = makeService("");
    (dao.listForProject as jest.Mock).mockResolvedValue([]);
    await service.listForProject("proj-1");
    expect(dao.listForProject).toHaveBeenCalledWith("proj-1");
  });

  it("delegates setSystemDefault to DAO", async () => {
    const { service, dao } = makeService("");
    (dao.setSystemDefault as jest.Mock).mockResolvedValue(undefined);
    await service.setSystemDefault("ticket_research", "new template");
    expect(dao.setSystemDefault).toHaveBeenCalledWith(
      "ticket_research",
      "new template",
    );
  });

  it("delegates setProjectTemplate to DAO", async () => {
    const { service, dao } = makeService("");
    (dao.setProjectTemplate as jest.Mock).mockResolvedValue(undefined);
    await service.setProjectTemplate("proj-1", "ticket_developing", "tmpl");
    expect(dao.setProjectTemplate).toHaveBeenCalledWith(
      "proj-1",
      "ticket_developing",
      "tmpl",
    );
  });

  it("delegates deleteProjectTemplate to DAO", async () => {
    const { service, dao } = makeService("");
    (dao.deleteProjectTemplate as jest.Mock).mockResolvedValue(undefined);
    await service.deleteProjectTemplate("proj-1", "ticket_developing");
    expect(dao.deleteProjectTemplate).toHaveBeenCalledWith(
      "proj-1",
      "ticket_developing",
    );
  });
});

// ---------------------------------------------------------------------------
// XML template rendering (migration 057 shapes)
// ---------------------------------------------------------------------------

describe("PromptTemplateService — XML template rendering", () => {
  // Template shapes that mirror the 057 migration templates

  const TICKET_RESEARCH_TEMPLATE =
    "Create a research document for this ticket.\n\n" +
    "<ticket>\n" +
    "<title>{{ticketTitle}}</title>\n" +
    "<description>{{ticketDescription}}</description>\n" +
    "{{#externalTicketId}}<external-ticket-id>{{externalTicketId}}</external-ticket-id>\n" +
    "{{/externalTicketId}}</ticket>";

  const TICKET_RESEARCH_REVISION_TEMPLATE =
    "{{initialMessage}}\n" +
    "{{#researchDocument}}\n" +
    "<current-research-document>\n" +
    "{{researchDocument}}\n" +
    "</current-research-document>\n" +
    "{{/researchDocument}}" +
    "{{#openComments}}\n" +
    "<open-review-comments>\n" +
    "{{openComments}}\n" +
    "</open-review-comments>\n" +
    "{{/openComments}}\n" +
    "Please update the research document to address the feedback above and rewrite RESEARCH.md.";

  const TICKET_PLANNING_REVISION_TEMPLATE =
    "{{initialMessage}}\n" +
    "{{#researchDocument}}\n" +
    "<approved-research-document>\n" +
    "{{researchDocument}}\n" +
    "</approved-research-document>\n" +
    "{{/researchDocument}}" +
    "{{#planDocument}}\n" +
    "<current-planning-document>\n" +
    "{{planDocument}}\n" +
    "</current-planning-document>\n" +
    "{{/planDocument}}" +
    "{{#openComments}}\n" +
    "<open-review-comments>\n" +
    "{{openComments}}\n" +
    "</open-review-comments>\n" +
    "{{/openComments}}\n" +
    "Please update the planning document to address the feedback above and rewrite PLAN.md.";

  const TICKET_RESEARCH_REVISION_TASK_TEMPLATE =
    "Revise the existing research document.\n\n" +
    "<feedback>\n" +
    "{{#revisionMessage}}<revision-message>\n" +
    "{{revisionMessage}}\n" +
    "</revision-message>\n" +
    "{{/revisionMessage}}" +
    "{{#openComments}}<inline-comments>\n" +
    "{{openComments}}\n" +
    "</inline-comments>\n" +
    "{{/openComments}}</feedback>\n\n" +
    "{{#researchDocument}}<current-research-document>\n" +
    "{{researchDocument}}\n" +
    "</current-research-document>\n" +
    "{{/researchDocument}}" +
    "{{^researchDocument}}<current-research-document>(No existing research document found)</current-research-document>\n" +
    "{{/researchDocument}}";

  const CLAW_SCHEDULED_TASK_TEMPLATE =
    "You are an expert software engineer. Complete the scheduled task described below.\n\n" +
    "<task-instructions>\n" +
    "{{taskInstructions}}\n" +
    "</task-instructions>";

  describe("ticket_research", () => {
    it("wraps ticket data in XML tags", async () => {
      const result = await render(TICKET_RESEARCH_TEMPLATE, {
        ticketTitle: "Fix login bug",
        ticketDescription: "Users cannot log in with SSO.",
      });
      expect(result).toContain("<ticket>");
      expect(result).toContain("<title>Fix login bug</title>");
      expect(result).toContain(
        "<description>Users cannot log in with SSO.</description>",
      );
      expect(result).toContain("</ticket>");
    });

    it("includes external-ticket-id when provided", async () => {
      const result = await render(TICKET_RESEARCH_TEMPLATE, {
        ticketTitle: "T",
        ticketDescription: "D",
        externalTicketId: "PROJ-123",
      });
      expect(result).toContain(
        "<external-ticket-id>PROJ-123</external-ticket-id>",
      );
    });

    it("omits external-ticket-id block when not provided", async () => {
      const result = await render(TICKET_RESEARCH_TEMPLATE, {
        ticketTitle: "T",
        ticketDescription: "D",
      });
      expect(result).not.toContain("<external-ticket-id>");
    });
  });

  describe("ticket_research_revision", () => {
    it("wraps research document in <current-research-document> tags", async () => {
      const result = await render(TICKET_RESEARCH_REVISION_TEMPLATE, {
        initialMessage: "Please revise.",
        researchDocument: "# Research\n\nFindings here.",
      });
      expect(result).toContain("<current-research-document>");
      expect(result).toContain("# Research\n\nFindings here.");
      expect(result).toContain("</current-research-document>");
    });

    it("omits <current-research-document> when no research document", async () => {
      const result = await render(TICKET_RESEARCH_REVISION_TEMPLATE, {
        initialMessage: "Please revise.",
      });
      expect(result).not.toContain("<current-research-document>");
    });

    it("wraps open comments in <open-review-comments> tags", async () => {
      const result = await render(TICKET_RESEARCH_REVISION_TEMPLATE, {
        initialMessage: "Revise.",
        researchDocument: "doc",
        openComments: "Line 5: clarify this",
      });
      expect(result).toContain("<open-review-comments>");
      expect(result).toContain("Line 5: clarify this");
      expect(result).toContain("</open-review-comments>");
    });

    it("omits <open-review-comments> when no comments", async () => {
      const result = await render(TICKET_RESEARCH_REVISION_TEMPLATE, {
        initialMessage: "Revise.",
        researchDocument: "doc",
      });
      expect(result).not.toContain("<open-review-comments>");
    });

    it("preserves initialMessage verbatim", async () => {
      const result = await render(TICKET_RESEARCH_REVISION_TEMPLATE, {
        initialMessage: "User asked: revise section 2.",
        researchDocument: "doc",
      });
      expect(result).toContain("User asked: revise section 2.");
    });
  });

  describe("ticket_planning_revision", () => {
    it("uses <approved-research-document> (not <current-research-document>)", async () => {
      const result = await render(TICKET_PLANNING_REVISION_TEMPLATE, {
        initialMessage: "msg",
        researchDocument: "research",
        planDocument: "plan",
      });
      expect(result).toContain("<approved-research-document>");
      expect(result).toContain("</approved-research-document>");
      expect(result).not.toContain("<current-research-document>");
    });

    it("wraps plan in <current-planning-document> tags", async () => {
      const result = await render(TICKET_PLANNING_REVISION_TEMPLATE, {
        initialMessage: "msg",
        planDocument: "# Plan\nStep 1.",
      });
      expect(result).toContain("<current-planning-document>");
      expect(result).toContain("# Plan\nStep 1.");
      expect(result).toContain("</current-planning-document>");
    });

    it("omits optional sections when not provided", async () => {
      const result = await render(TICKET_PLANNING_REVISION_TEMPLATE, {
        initialMessage: "msg",
      });
      expect(result).not.toContain("<approved-research-document>");
      expect(result).not.toContain("<current-planning-document>");
      expect(result).not.toContain("<open-review-comments>");
    });
  });

  describe("ticket_research_revision_task", () => {
    it("wraps revision message in <revision-message> inside <feedback>", async () => {
      const result = await render(TICKET_RESEARCH_REVISION_TASK_TEMPLATE, {
        revisionMessage: "Expand the root cause section.",
        researchDocument: "# Research",
      });
      expect(result).toContain("<feedback>");
      expect(result).toContain("<revision-message>");
      expect(result).toContain("Expand the root cause section.");
      expect(result).toContain("</revision-message>");
      expect(result).toContain("</feedback>");
    });

    it("wraps inline comments in <inline-comments> inside <feedback>", async () => {
      const result = await render(TICKET_RESEARCH_REVISION_TASK_TEMPLATE, {
        openComments: "L10: wrong function name",
        researchDocument: "# Research",
      });
      expect(result).toContain("<inline-comments>");
      expect(result).toContain("L10: wrong function name");
      expect(result).toContain("</inline-comments>");
    });

    it("uses positive <current-research-document> branch when doc present", async () => {
      const result = await render(TICKET_RESEARCH_REVISION_TASK_TEMPLATE, {
        revisionMessage: "msg",
        researchDocument: "existing content",
      });
      expect(result).toContain("<current-research-document>\nexisting content\n</current-research-document>");
      expect(result).not.toContain("(No existing research document found)");
    });

    it("uses fallback <current-research-document> when doc absent", async () => {
      const result = await render(TICKET_RESEARCH_REVISION_TASK_TEMPLATE, {
        revisionMessage: "msg",
      });
      expect(result).toContain(
        "<current-research-document>(No existing research document found)</current-research-document>",
      );
    });

    it("omits revision-message block when revisionMessage is absent", async () => {
      const result = await render(TICKET_RESEARCH_REVISION_TASK_TEMPLATE, {
        openComments: "a comment",
        researchDocument: "doc",
      });
      expect(result).not.toContain("<revision-message>");
    });
  });

  describe("claw_scheduled_task", () => {
    it("wraps task instructions in <task-instructions> tags", async () => {
      const result = await render(CLAW_SCHEDULED_TASK_TEMPLATE, {
        taskInstructions: "Update all dependencies to latest versions.",
      });
      expect(result).toContain("<task-instructions>");
      expect(result).toContain(
        "Update all dependencies to latest versions.",
      );
      expect(result).toContain("</task-instructions>");
    });
  });
});

// ---------------------------------------------------------------------------
// Worker deduplication tag contracts
// ---------------------------------------------------------------------------

describe("PromptTemplateService — worker deduplication tag contracts", () => {
  // These tests verify that the tag names used in the templates match exactly
  // the tag names checked in buildSessionPromptOverride (runSessionTurnJob.ts).
  // If a tag name changes, both files must be updated together.

  const RESEARCH_REVISION_TEMPLATE =
    "{{initialMessage}}\n" +
    "{{#researchDocument}}\n" +
    "<current-research-document>\n{{researchDocument}}\n</current-research-document>\n" +
    "{{/researchDocument}}";

  const PLANNING_REVISION_TEMPLATE =
    "{{initialMessage}}\n" +
    "{{#researchDocument}}\n" +
    "<approved-research-document>\n{{researchDocument}}\n</approved-research-document>\n" +
    "{{/researchDocument}}" +
    "{{#planDocument}}\n" +
    "<current-planning-document>\n{{planDocument}}\n</current-planning-document>\n" +
    "{{/planDocument}}";

  it("research revision template emits <current-research-document> tag", async () => {
    const result = await render(RESEARCH_REVISION_TEMPLATE, {
      initialMessage: "msg",
      researchDocument: "doc",
    });
    expect(result).toContain("<current-research-document>");
  });

  it("planning revision template emits <approved-research-document> tag", async () => {
    const result = await render(PLANNING_REVISION_TEMPLATE, {
      initialMessage: "msg",
      researchDocument: "doc",
    });
    expect(result).toContain("<approved-research-document>");
  });

  it("planning revision template emits <current-planning-document> tag", async () => {
    const result = await render(PLANNING_REVISION_TEMPLATE, {
      initialMessage: "msg",
      planDocument: "plan",
    });
    expect(result).toContain("<current-planning-document>");
  });
});
