package br.com.trespenergia.orcamentos.integration.graph;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.core.OAuth2AccessToken;

class MicrosoftGraphControllerTests {

	@Test
	void passesTokenOnlyToServerSideClientAndReturnsProfile() {
		MicrosoftGraphClient graphClient = mock(MicrosoftGraphClient.class);
		OAuth2AuthorizedClient authorizedClient = mock(OAuth2AuthorizedClient.class);
		OAuth2AccessToken token = new OAuth2AccessToken(
			OAuth2AccessToken.TokenType.BEARER,
			"test-token-not-real",
			Instant.now(),
			Instant.now().plusSeconds(60));
		GraphUserProfile expected = new GraphUserProfile(
			"id-123", "Pessoa Teste", null, "pessoa@example.invalid");

		when(authorizedClient.getAccessToken()).thenReturn(token);
		when(graphClient.currentUser("test-token-not-real")).thenReturn(expected);

		GraphUserProfile response = new MicrosoftGraphController(graphClient).currentUser(authorizedClient);

		assertThat(response).isEqualTo(expected);
		verify(graphClient).currentUser("test-token-not-real");
	}
}
