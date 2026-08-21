package br.com.trespenergia.orcamentos.integration.graph;

import java.net.URI;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.microsoft-graph")
public record MicrosoftGraphProperties(URI baseUrl, String siteId, String materialsListId) {
}
