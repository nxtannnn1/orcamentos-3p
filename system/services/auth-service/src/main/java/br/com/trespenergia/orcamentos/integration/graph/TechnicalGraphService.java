package br.com.trespenergia.orcamentos.integration.graph;

import org.springframework.stereotype.Service;

@Service
public class TechnicalGraphService {

	private final TechnicalAccessTokenProvider tokenProvider;
	private final MicrosoftGraphClient graphClient;
	private final MicrosoftGraphProperties properties;

	public TechnicalGraphService(
		TechnicalAccessTokenProvider tokenProvider,
		MicrosoftGraphClient graphClient,
		MicrosoftGraphProperties properties) {
		this.tokenProvider = tokenProvider;
		this.graphClient = graphClient;
		this.properties = properties;
	}

	public GraphHealth health() {
		GraphSite site = graphClient.site(tokenProvider.getTokenValue(), properties.siteId());
		if (site == null || site.id() == null || site.id().isBlank()) {
			throw new IllegalStateException("Microsoft Graph não retornou o site configurado");
		}
		return new GraphHealth("UP");
	}

	public MaterialListItem material(long id) {
		return graphClient.material(
			tokenProvider.getTokenValue(),
			properties.siteId(),
			properties.materialsListId(),
			id);
	}
}
