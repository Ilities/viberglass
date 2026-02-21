/**
 * Provider registry for dynamic webhook provider loading
 *
 * Manages registration and lookup of webhook providers by name.
 * Routes incoming webhook requests to appropriate provider based on
 * request headers.
 */

import { isObjectRecord } from '@viberglass/types';
import type { WebhookProvider } from './WebhookProvider';

/**
 * Registry for webhook providers
 *
 * Provides simple in-memory storage and lookup for webhook providers.
 * Providers are registered by name and can be retrieved by name or
 * by inspecting request headers for provider-specific indicators.
 */
export class ProviderRegistry {
  /** Map of provider name to provider instance */
  private readonly providers = new Map<string, WebhookProvider>();

  /** Provider-specific header mappings for routing */
  private readonly headerMappings = new Map<string, string>();

  /**
   * Register a webhook provider
   *
   * @param provider - Provider instance to register
   * @throws Error if provider with same name already exists
   */
  register(provider: WebhookProvider): void {
    const name = provider.name;

    if (this.providers.has(name)) {
      throw new Error(`Provider already registered: ${name}`);
    }

    this.providers.set(name, provider);

    // Set up header mappings for routing
    this.setupHeaderMappings(name);
  }

  /**
   * Register a provider, replacing existing if present
   *
   * @param provider - Provider instance to register
   */
  registerOrUpdate(provider: WebhookProvider): void {
    const name = provider.name;
    this.providers.set(name, provider);
    this.setupHeaderMappings(name);
  }

  /**
   * Unregister a provider by name
   *
   * @param name - Provider name to unregister
   * @returns True if provider was removed, false if not found
   */
  unregister(name: string): boolean {
    const removed = this.providers.delete(name);

    // Clean up header mappings
    if (removed) {
      this.removeHeaderMappings(name);
    }

    return removed;
  }

  /**
   * Get a provider by name
   *
   * @param name - Provider name
   * @returns Provider instance or undefined if not found
   */
  get(name: string): WebhookProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Check if a provider is registered
   *
   * @param name - Provider name
   * @returns True if provider is registered
   */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Get all registered provider names
   *
   * @returns Array of provider names
   */
  list(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get all registered providers
   *
   * @returns Array of provider instances
   */
  getAll(): WebhookProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get the number of registered providers
   *
   * @returns Provider count
   */
  get size(): number {
    return this.providers.size;
  }

  /**
   * Clear all registered providers
   */
  clear(): void {
    this.providers.clear();
    this.headerMappings.clear();
  }

  /**
   * Get provider for incoming webhook based on headers
   *
   * Inspects request headers for provider-specific indicators and
   * returns the appropriate provider instance.
   *
   * Header mappings:
   * - GitHub: x-github-event
   * - Jira: x-atlassian-webhook-identifier
   * - Shortcut: x-shortcut-signature or x-shortcut-delivery
   * - Custom: x-webhook-signature-256 or x-webhook-delivery-id
   * - GitLab: x-gitlab-event
   * - Bitbucket: x-event-key
   *
   * @param headers - Request headers
   * @returns Provider instance or undefined if no match
   */
  getProviderForHeaders(headers: Record<string, string>): WebhookProvider | undefined {
    // Check GitHub webhooks
    if (headers['x-github-event'] || headers['x-hub-signature-256'] || headers['x-hub-signature']) {
      return this.get('github');
    }

    // Check Jira webhooks
    if (
      headers['x-atlassian-webhook-identifier'] ||
      headers['x-atlassian-webhook-timestamp'] ||
      headers['x-atlassian-webhook-signature'] ||
      headers['x-hub-signature']
    ) {
      return this.get('jira');
    }

    // Check Shortcut webhooks
    if (headers['x-shortcut-signature'] || headers['x-shortcut-delivery']) {
      return this.get('shortcut');
    }

    // Check Custom webhooks
    if (headers['x-webhook-signature-256'] || headers['x-webhook-delivery-id']) {
      return this.get('custom');
    }

    // Check GitLab webhooks
    if (headers['x-gitlab-event']) {
      return this.get('gitlab');
    }

    // Check Bitbucket webhooks
    if (headers['x-event-key'] && headers['x-hook-uuid']) {
      return this.get('bitbucket');
    }

    // No provider match
    return undefined;
  }

  /**
   * Get provider by inspecting both headers and body
   *
   * Some providers (like Jira) include identifying information in the
   * body rather than headers. This method checks both.
   *
   * @param headers - Request headers
   * @param body - Request body (parsed JSON)
   * @returns Provider instance or undefined if no match
   */
  getProviderForRequest(
    headers: Record<string, string>,
    body: unknown
  ): WebhookProvider | undefined {
    // First try headers only
    const provider = this.getProviderForHeaders(headers);
    if (provider) {
      return provider;
    }

    // Check body for provider-specific indicators
    if (isObjectRecord(body)) {
      // Jira often includes webhookEvent in body
      if ('webhookEvent' in body) {
        return this.get('jira');
      }

      // Some providers have type field
      if ('object_kind' in body) {
        return this.get('gitlab');
      }
    }

    return undefined;
  }

  /**
   * Setup header mappings for a provider
   *
   * @param name - Provider name
   */
  private setupHeaderMappings(name: string): void {
    switch (name) {
      case 'github':
        this.headerMappings.set('x-github-event', name);
        this.headerMappings.set('x-hub-signature-256', name);
        this.headerMappings.set('x-hub-signature', name);
        break;
      case 'jira':
        this.headerMappings.set('x-atlassian-webhook-identifier', name);
        this.headerMappings.set('x-atlassian-webhook-timestamp', name);
        this.headerMappings.set('x-atlassian-webhook-signature', name);
        this.headerMappings.set('x-hub-signature', name);
        break;
      case 'shortcut':
        this.headerMappings.set('x-shortcut-signature', name);
        this.headerMappings.set('x-shortcut-delivery', name);
        break;
      case 'custom':
        this.headerMappings.set('x-webhook-signature-256', name);
        this.headerMappings.set('x-webhook-delivery-id', name);
        break;
      case 'gitlab':
        this.headerMappings.set('x-gitlab-event', name);
        break;
      case 'bitbucket':
        this.headerMappings.set('x-event-key', name);
        break;
    }
  }

  /**
   * Remove header mappings for a provider
   *
   * @param name - Provider name
   */
  private removeHeaderMappings(name: string): void {
    for (const [header, providerName] of this.headerMappings.entries()) {
      if (providerName === name) {
        this.headerMappings.delete(header);
      }
    }
  }
}

/**
 * Global singleton registry instance
 *
 * Provides a shared registry for the application.
 * Can be replaced with a custom instance if needed.
 */
let globalRegistry: ProviderRegistry | undefined;

/**
 * Get or create the global provider registry
 *
 * @returns Global registry instance
 */
export function getGlobalRegistry(): ProviderRegistry {
  if (!globalRegistry) {
    globalRegistry = new ProviderRegistry();
  }
  return globalRegistry;
}

/**
 * Set a custom global registry
 *
 * @param registry - Registry to use as global
 */
export function setGlobalRegistry(registry: ProviderRegistry): void {
  globalRegistry = registry;
}

/**
 * Reset the global registry (useful for testing)
 */
export function resetGlobalRegistry(): void {
  globalRegistry = undefined;
}
