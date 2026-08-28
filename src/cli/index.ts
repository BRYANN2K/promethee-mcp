export { CLI_VERSION, DEFAULT_SYNTHETIC_PORT, runCli, SYNTHETIC_HOST } from './run.js';
export {
  createSupabaseCliConfiguration,
  PROMETHEE_SUPABASE_URL,
  SupabaseCliConfigurationError,
  type SupabaseCliConfiguration,
} from './supabase-config.js';
export {
  createClientInstallPlan,
  genericMcpConfiguration,
  runInteractiveOnboarding,
  type ClientInstallPlan,
  type InteractiveOnboardingOptions,
  type SupportedMcpClient,
} from './onboarding.js';
