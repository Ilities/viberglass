export { IntegrationDAO, type CreateIntegrationInput, type UpdateIntegrationInput } from './IntegrationDAO'
export {
  ProjectIntegrationLinkDAO,
  type CreateProjectIntegrationLinkInput,
  type ProjectIntegrationWithDetails,
} from './ProjectIntegrationLinkDAO'
export { IntegrationUsageDAO, type IntegrationUser } from './IntegrationUsageDAO'
export {
  IntegrationCredentialDAO,
  type CreateIntegrationCredentialInput,
} from './IntegrationCredentialDAO'

// Legacy export - will be removed
export { IntegrationConfigDAO, type StoredIntegrationConfig } from './IntegrationConfigDAO'
