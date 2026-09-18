package br.com.trespenergia.orcamentos.integration.graph;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.net.URI;
import java.util.Map;

import org.junit.jupiter.api.Test;

class TechnicalGraphServiceTests {

	private final TechnicalAccessTokenProvider tokenProvider = mock(TechnicalAccessTokenProvider.class);
	private final MicrosoftGraphClient graphClient = mock(MicrosoftGraphClient.class);
	private final MicrosoftGraphProperties properties = new MicrosoftGraphProperties(
			URI.create("https://graph.microsoft.com/v1.0"),
			"site-id",
			"materials-list-id",
			"network-catalog-list-id",
			"catalog-library-id");
	private final TechnicalGraphService service = new TechnicalGraphService(tokenProvider, graphClient, properties);

	@Test
	void healthValidatesConfiguredSiteInsteadOfCallingMe() {
		when(tokenProvider.getTokenValue()).thenReturn("technical-token-not-real");
		when(graphClient.site("technical-token-not-real", "site-id")).thenReturn(new GraphSite("site-id"));

		assertThat(service.health().status()).isEqualTo("UP");
		verify(graphClient).site("technical-token-not-real", "site-id");
	}

	@Test
	void materialUsesTechnicalTokenAndConfiguredMaterialsList() {
		var expected = new MaterialListItem("42", Map.of("Title", "Material de teste"));
		when(tokenProvider.getTokenValue()).thenReturn("technical-token-not-real");
		when(graphClient.material("technical-token-not-real", "site-id", "materials-list-id", 42L))
			.thenReturn(expected);

		assertThat(service.material(42L)).isEqualTo(expected);
	}

	@Test
	void networkCatalogItemUsesTechnicalTokenAndConfiguredNetworkCatalogList() {
		var expected = new MaterialListItem("24", Map.of("Title", "Item de teste"));

		when(tokenProvider.getTokenValue()).thenReturn("technical-token-not-real");

		when(graphClient.material(
				"technical-token-not-real",
				"site-id",
				"network-catalog-list-id",
				24L))
				.thenReturn(expected);

		assertThat(service.networkCatalogItem(24L)).isEqualTo(expected);

		verify(graphClient).material(
				"technical-token-not-real",
				"site-id",
				"network-catalog-list-id",
				24L);
	}

	@Test
	void networkCatalogByImportKeyUsesTechnicalTokenAndConfiguredNetworkCatalogList() {
		var expected = new MaterialListItemsResponse(List.of(
				new MaterialListItem(
						"24",
						Map.of("Chave_Importacao", "CHAVE-TESTE"))));

		when(tokenProvider.getTokenValue()).thenReturn("technical-token-not-real");

		when(graphClient.networkCatalogByImportKey(
				"technical-token-not-real",
				"site-id",
				"network-catalog-list-id",
				"CHAVE-TESTE"))
				.thenReturn(expected);

		assertThat(service.networkCatalogByImportKey("CHAVE-TESTE"))
				.isEqualTo(expected);

		verify(graphClient).networkCatalogByImportKey(
				"technical-token-not-real",
				"site-id",
				"network-catalog-list-id",
				"CHAVE-TESTE");
	}
}
