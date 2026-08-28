import {
  getOAuthProtectedResourceMetadataUrl,
  oauthMetadataResponse,
  type OAuthMetadata,
} from "@modelcontextprotocol/server";

export interface OAuthMetadataHandlerOptions {
  readonly oauthMetadata: OAuthMetadata;
  readonly resourceServerUrl: URL;
  readonly scopesSupported: readonly string[];
  readonly resourceName?: string;
  readonly serviceDocumentationUrl?: URL;
}

export function resourceMetadataUrl(resourceServerUrl: URL): string {
  return getOAuthProtectedResourceMetadataUrl(resourceServerUrl);
}

export function createOAuthMetadataHandler(
  options: OAuthMetadataHandlerOptions,
): (request: Request) => Response | undefined {
  const sdkOptions = {
    oauthMetadata: options.oauthMetadata,
    resourceServerUrl: options.resourceServerUrl,
    scopesSupported: [...options.scopesSupported],
    ...(options.resourceName === undefined ? {} : { resourceName: options.resourceName }),
    ...(options.serviceDocumentationUrl === undefined
      ? {}
      : { serviceDocumentationUrl: options.serviceDocumentationUrl }),
  };

  return (request: Request): Response | undefined => oauthMetadataResponse(request, sdkOptions);
}
