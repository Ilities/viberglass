import { sql, type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

// Starting a runner used to save the published worker image it resolved, tag
// included, as if someone had chosen it, which kept the runner on that tag
// after an upgrade. A saved image naming a published worker repository is
// dropped, so the runner follows the installation's registry and tag. Images
// from other repositories are custom ones and stay.
const PUBLISHED_WORKER_IMAGE =
  "(^|/)viberator-(worker|worker-[a-z0-9-]+|ecs-worker|lambda-worker)(:[^/@]+)?(@sha256:[0-9a-f]+)?$";

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`
    UPDATE clankers
    SET deployment_config = jsonb_set(deployment_config, '{strategy}', (deployment_config->'strategy') - 'containerImage')
    WHERE purpose IS NULL
      AND (
        deployment_config->'strategy'->>'type' IN ('kubernetes', 'ecs')
        OR (deployment_config->'strategy'->>'type' = 'docker' AND deployment_config->'strategy'->>'provisioningMode' = 'prebuilt')
      )
      AND deployment_config->'strategy'->>'containerImage' ~ ${PUBLISHED_WORKER_IMAGE}
  `.execute(db);

  await sql`
    UPDATE clankers
    SET deployment_config = jsonb_set(deployment_config, '{strategy}', (deployment_config->'strategy') - 'imageUri')
    WHERE purpose IS NULL
      AND deployment_config->'strategy'->>'type' = 'lambda'
      AND deployment_config->'strategy'->>'imageUri' ~ ${PUBLISHED_WORKER_IMAGE}
  `.execute(db);
}

export async function down(): Promise<void> {
  // The dropped images were derived values; the runner works them out again when it starts.
}
