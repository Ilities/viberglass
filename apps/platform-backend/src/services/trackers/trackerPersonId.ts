import type { UserDAO } from "../../persistence/user/UserDAO";
import type { TrackerPerson } from "./TrackerIssueInbound";

/** The active Viberglass account with the tracker person's email, if the tracker shares it. */
export async function trackerPersonId(users: Pick<UserDAO, "findByEmail">, person: TrackerPerson): Promise<string | null> {
  if (!person.email) return null;
  const user = await users.findByEmail(person.email);
  return user && !user.deactivatedAt ? user.id : null;
}
