import { VerdaContainersHost } from "@viberglass/model-hosting-verda";
import { ModelHostAccountDAO } from "../../persistence/modelHosting/ModelHostAccountDAO";
import { ModelDeploymentDAO } from "../../persistence/modelHosting/ModelDeploymentDAO";
import { ModelEndpointDAO } from "../../persistence/modelEndpoint/ModelEndpointDAO";
import { SecretService } from "../SecretService";
import { setupSecretLocation } from "../secretStorageDefaults";
import { ModelHostAccountService } from "./ModelHostAccountService";
import { ModelHostConnector } from "./ModelHostConnector";
import { ModelHostRegistry } from "./ModelHostRegistry";
import { ModelDeploymentService } from "./ModelDeploymentService";
import { ModelRecipeCatalog } from "./ModelRecipeCatalog";
import { HuggingFaceModelSize } from "./HuggingFaceModelSize";

const secrets = new SecretService();
const deploymentDao = new ModelDeploymentDAO();

export const modelHostAccounts = new ModelHostAccountService(
  new ModelHostAccountDAO(),
  secrets,
  setupSecretLocation(),
);
export const modelHosts = new ModelHostRegistry([new VerdaContainersHost()]);
export const modelHostConnector = new ModelHostConnector(
  modelHostAccounts,
  modelHosts,
  secrets,
);
export const modelDeployments = new ModelDeploymentService(
  deploymentDao,
  new ModelEndpointDAO(),
  modelHostConnector,
);
export const modelRecipes = new ModelRecipeCatalog();
export const modelSizes = new HuggingFaceModelSize();
