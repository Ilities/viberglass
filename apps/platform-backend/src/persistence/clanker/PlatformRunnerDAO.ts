import db from "../config/database";

export type PlatformRunnerPurpose = "app_builder";

/** Runners the platform owns for its own jobs; created here, read back through ClankerDAO.getClanker. */
export class PlatformRunnerDAO {
  async findId(purpose: PlatformRunnerPurpose): Promise<string | null> {
    const row = await db
      .selectFrom("clankers")
      .select("id")
      .where("purpose", "=", purpose)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    return row?.id ?? null;
  }

  /** Returns the existing runner's id when another caller created it first. */
  async create(
    purpose: PlatformRunnerPurpose,
    runner: { name: string; slug: string; deploymentStrategyId: string; deploymentConfig: Record<string, unknown> },
  ): Promise<string> {
    const row = await db
      .insertInto("clankers")
      .values({
        name: runner.name,
        slug: runner.slug,
        description: null,
        deployment_strategy_id: runner.deploymentStrategyId,
        deployment_config: JSON.stringify(runner.deploymentConfig),
        agent: null,
        status_message: null,
        purpose,
      })
      .onConflict((conflict) => conflict.doNothing())
      .returning("id")
      .executeTakeFirst();
    if (row) return row.id;
    const existing = await this.findId(purpose);
    if (!existing) throw new Error(`Could not create the ${purpose} runner`);
    return existing;
  }
}
