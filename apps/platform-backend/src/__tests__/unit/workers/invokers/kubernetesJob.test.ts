import { buildKubernetesJob } from "../../../../workers/invokers/kubernetesJob";

it("gives a stopped worker at least 30 seconds to save its work", () => {
  const job = buildKubernetesJob({
    jobId: "id",
    tenantId: "tenant",
    image: "worker:1",
    callbackSecret: "run-auth",
    platformApiUrl: "http://backend",
    config: { type: "kubernetes" },
  });

  expect(job.spec?.template.spec?.terminationGracePeriodSeconds).toBeGreaterThanOrEqual(30);
});
