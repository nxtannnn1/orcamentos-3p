package br.com.trespenergia.orcamentos.integration.graph;

import java.net.URI;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.microsoft-graph")
public record MicrosoftGraphProperties(
        String baseUrl,
        String siteId,
        String materialsListId,
        String networkCatalogListId,
        String catalogLibraryId) {

    public MicrosoftGraphProperties {
        baseUrl = validateBaseUrl(baseUrl);
    }

    private static String validateBaseUrl(String value) {
        final URI uri;
        try {
            uri = URI.create(value);
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException(
                    "app.microsoft-graph.base-url must be an absolute HTTPS Microsoft Graph URL");
        }

        if (!uri.isAbsolute()
                || uri.isOpaque()
                || !"https".equalsIgnoreCase(uri.getScheme())
                || !"graph.microsoft.com".equalsIgnoreCase(uri.getHost())
                || uri.getUserInfo() != null
                || uri.getPort() != -1
                || uri.getQuery() != null
                || uri.getFragment() != null) {
            throw new IllegalArgumentException(
                    "app.microsoft-graph.base-url must use https://graph.microsoft.com without credentials, port, query, or fragment");
        }
        return uri.toString();
    }
}
