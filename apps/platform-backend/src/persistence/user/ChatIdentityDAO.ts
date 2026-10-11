import db from "../config/database";

/** The accounts people linked on chat services, by the service's adapter name. */
export class ChatIdentityDAO {
  /** Who acts for a chat account: the active person who linked it, if anyone. */
  async findActiveUserId(adapterName: string, chatUserId: string): Promise<string | null> {
    const row = await db
      .selectFrom("user_chat_identities")
      .innerJoin("users", "users.id", "user_chat_identities.user_id")
      .select("users.id")
      .where("user_chat_identities.adapter_name", "=", adapterName)
      .where("user_chat_identities.chat_user_id", "=", chatUserId)
      .where("users.deactivated_at", "is", null)
      .executeTakeFirst();
    return row?.id ?? null;
  }

  async getChatUserId(userId: string, adapterName: string): Promise<string | null> {
    const row = await db
      .selectFrom("user_chat_identities")
      .select("chat_user_id")
      .where("user_id", "=", userId)
      .where("adapter_name", "=", adapterName)
      .executeTakeFirst();
    return row?.chat_user_id ?? null;
  }

  /** Links the person's account on the service, replacing one linked before; null unlinks it. */
  async setChatUserId(userId: string, adapterName: string, chatUserId: string | null): Promise<void> {
    if (chatUserId === null) {
      await db.deleteFrom("user_chat_identities").where("user_id", "=", userId).where("adapter_name", "=", adapterName).execute();
      return;
    }
    await db
      .insertInto("user_chat_identities")
      .values({ user_id: userId, adapter_name: adapterName, chat_user_id: chatUserId })
      .onConflict((conflict) => conflict.columns(["user_id", "adapter_name"]).doUpdateSet({ chat_user_id: chatUserId }))
      .execute();
  }
}
