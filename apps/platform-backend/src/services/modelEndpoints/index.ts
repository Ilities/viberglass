import { ModelEndpointInputValidator } from "./ModelEndpointInputValidator";
import { ModelEndpointDAO } from "../../persistence/modelEndpoint/ModelEndpointDAO";
import { SecretDAO } from "../../persistence/secret/SecretDAO";
import { SecretService } from "../SecretService";
import { ModelEndpointService } from "./ModelEndpointService";
import { ModelEndpointChecker } from "./ModelEndpointChecker";
import { RunnerModelEndpointResolver } from "./RunnerModelEndpointResolver";

export const modelEndpoints = new ModelEndpointService(
  new ModelEndpointDAO(),
  new ModelEndpointInputValidator(new SecretDAO()),
);
export const modelEndpointChecker = new ModelEndpointChecker(
  new SecretService(),
);
export const runnerModelEndpoints = new RunnerModelEndpointResolver(
  modelEndpoints,
);
