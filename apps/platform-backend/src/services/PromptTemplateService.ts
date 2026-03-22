import type {
  PromptTemplateDAO,
  PromptTemplateEntry,
  PromptType,
} from "../persistence/promptTemplate/PromptTemplateDAO";

export class PromptTemplateService {
  constructor(private readonly dao: PromptTemplateDAO) {}

  async render(
    type: PromptType,
    projectId: string,
    vars: Record<string, string | undefined>,
  ): Promise<string> {
    const template = await this.dao.getEffectiveTemplate(type, projectId);
    return this.renderTemplate(template, vars);
  }

  async listForProject(projectId: string): Promise<PromptTemplateEntry[]> {
    return this.dao.listForProject(projectId);
  }

  async listSystemDefaults(): Promise<PromptTemplateEntry[]> {
    return this.dao.listSystemDefaults();
  }

  async setSystemDefault(type: PromptType, template: string): Promise<void> {
    return this.dao.setSystemDefault(type, template);
  }

  async setProjectTemplate(
    projectId: string,
    type: PromptType,
    template: string,
  ): Promise<void> {
    return this.dao.setProjectTemplate(projectId, type, template);
  }

  async deleteProjectTemplate(
    projectId: string,
    type: PromptType,
  ): Promise<void> {
    return this.dao.deleteProjectTemplate(projectId, type);
  }

  private renderTemplate(
    template: string,
    vars: Record<string, string | undefined>,
  ): string {
    // Process conditional blocks: {{#var}}...{{/var}}
    let result = template.replace(
      /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
      (_, key: string, inner: string) => {
        const value = vars[key];
        if (!value) return "";
        return inner.replace(
          /\{\{(\w+)\}\}/g,
          (_m: string, innerKey: string) => vars[innerKey] ?? "",
        );
      },
    );

    // Replace remaining {{var}} placeholders
    result = result.replace(
      /\{\{(\w+)\}\}/g,
      (_: string, key: string) => vars[key] ?? "",
    );

    return result;
  }
}
