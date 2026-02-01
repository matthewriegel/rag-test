/**
 * Azure Application Insights Telemetry
 * Provides instrumentation for monitoring and telemetry
 */

import * as azureMonitor from '@azure/monitor-opentelemetry';
import { azureConfig } from '../../config/azure.js';
import { logger } from '../logger.js';

let telemetryInitialized = false;

/**
 * Initialize Application Insights telemetry
 * Should be called early in application startup
 */
export function initializeTelemetry(): void {
  if (telemetryInitialized) {
    logger.info('Telemetry already initialized');
    return;
  }

  if (!azureConfig.appInsights.connectionString && !azureConfig.appInsights.instrumentationKey) {
    logger.info('Application Insights not configured, skipping telemetry initialization');
    return;
  }

  try {
    // Configure Azure Monitor OpenTelemetry
    const options: {
      azureMonitorExporterOptions?: {
        connectionString?: string;
      };
    } = {};

    if (azureConfig.appInsights.connectionString) {
      options.azureMonitorExporterOptions = {
        connectionString: azureConfig.appInsights.connectionString,
      };
    }

    // Start Application Insights
    azureMonitor.useAzureMonitor(options);

    telemetryInitialized = true;
    logger.info('Application Insights telemetry initialized');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Application Insights');
    // Don't throw - allow app to continue without telemetry
  }
}

/**
 * Track a custom event
 */
export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  if (!telemetryInitialized) {
    return;
  }

  try {
    // Custom events can be tracked via OpenTelemetry spans
    logger.info({ event: name, properties }, 'Custom event tracked');
  } catch (error) {
    logger.error({ error, event: name }, 'Failed to track event');
  }
}

/**
 * Track a custom metric
 */
export function trackMetric(
  name: string,
  value: number,
  properties?: Record<string, string>
): void {
  if (!telemetryInitialized) {
    return;
  }

  try {
    logger.info({ metric: name, value, properties }, 'Custom metric tracked');
  } catch (error) {
    logger.error({ error, metric: name }, 'Failed to track metric');
  }
}

/**
 * Track a dependency call (e.g., database, external API)
 */
export function trackDependency(
  name: string,
  type: string,
  duration: number,
  success: boolean,
  properties?: Record<string, string>
): void {
  if (!telemetryInitialized) {
    return;
  }

  try {
    logger.info(
      { dependency: name, type, duration, success, properties },
      'Dependency tracked'
    );
  } catch (error) {
    logger.error({ error, dependency: name }, 'Failed to track dependency');
  }
}

/**
 * Helper to measure and track operation duration
 */
export async function trackOperation<T>(
  operationName: string,
  operation: () => Promise<T>,
  properties?: Record<string, string>
): Promise<T> {
  const startTime = Date.now();
  let success = true;
  let error: Error | undefined;

  try {
    const result = await operation();
    return result;
  } catch (err) {
    success = false;
    error = err as Error;
    throw err;
  } finally {
    const duration = Date.now() - startTime;
    
    trackDependency(operationName, 'operation', duration, success, {
      ...properties,
      ...(error && { error: error.message }),
    });
  }
}
