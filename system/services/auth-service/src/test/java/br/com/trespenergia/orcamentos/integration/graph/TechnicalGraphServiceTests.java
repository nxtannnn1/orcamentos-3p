package br.com.trespenergia.orcamentos.integration.graph;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.util.Map;

import org.junit.jupiter.api.Test;

class TechnicalGraphServiceTests {

	private final TechnicalAccessTokenProvider tokenProvider = mock(TechnicalAccessTokenProvider.class);
	private final MicrosoftGraphClient graphClient = mock(MicrosoftGraphClient.class);
	private final MicrosoftGraphProperties properties = new MicrosoftGraphProperties(
		URI.create("https://graph.microsoft.com/v1.0"), "site-id", "materials-list-id");
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
}
