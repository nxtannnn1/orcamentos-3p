package br.com.trespenergia.orcamentos.integration.graph;

import org.springframework.stereotype.Service;

import java.util.Map;

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

	public MaterialListItem networkCatalogItem(long id) {
		return graphClient.material(
				tokenProvider.getTokenValue(),
				properties.siteId(),
				properties.networkCatalogListId(),
				id);
	}

	public MaterialListItemsResponse networkCatalogByImportKey(String importKey) {
		return graphClient.networkCatalogByImportKey(
				tokenProvider.getTokenValue(),
				properties.siteId(),
				properties.networkCatalogListId(),
				importKey);
	}

	public MaterialListItem createNetworkCatalogItem(Map<String, Object> fields) {
		if (fields == null || fields.isEmpty()) {
			throw new IllegalArgumentException("Campos do item são obrigatórios");
		}

		Object importKey = fields.get("Chave_Importacao");
		if (!(importKey instanceof String key) || key.isBlank()) {
			throw new IllegalArgumentException("Chave_Importacao é obrigatória");
		}

		if (key.length() > 255) {
			throw new IllegalArgumentException("Chave_Importacao excede 255 caracteres");
		}

		return graphClient.createNetworkCatalogItem(
				tokenProvider.getTokenValue(),
				properties.siteId(),
				properties.networkCatalogListId(),
				fields
		);
	}

	public GraphDrivesResponse siteDrives() {
		return graphClient.siteDrives(
				tokenProvider.getTokenValue(),
				properties.siteId()
		);
	}

	public GraphDriveItemsResponse catalogFolderChildren(String folderPath) {
		if (folderPath == null || folderPath.isBlank()) {
			throw new IllegalArgumentException("Caminho da pasta é obrigatório");
		}

		return graphClient.driveFolderChildren(
				tokenProvider.getTokenValue(),
				properties.catalogLibraryId(),
				folderPath
		);
	}
}
