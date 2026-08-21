package br.com.trespenergia.orcamentos.integration.graph;

import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.annotation.RegisteredOAuth2AuthorizedClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/integrations/microsoft-graph")
public class MicrosoftGraphController {

	private final MicrosoftGraphClient graphClient;

	public MicrosoftGraphController(MicrosoftGraphClient graphClient) {
		this.graphClient = graphClient;
	}

	@GetMapping("/me")
	GraphUserProfile currentUser(
		@RegisteredOAuth2AuthorizedClient("microsoft") OAuth2AuthorizedClient authorizedClient) {
		return graphClient.currentUser(authorizedClient.getAccessToken().getTokenValue());
	}
}
