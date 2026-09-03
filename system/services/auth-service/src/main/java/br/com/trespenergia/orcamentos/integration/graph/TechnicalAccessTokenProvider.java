package br.com.trespenergia.orcamentos.integration.graph;

import org.springframework.security.oauth2.client.OAuth2AuthorizeRequest;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientManager;
import org.springframework.stereotype.Component;

@Component
public class TechnicalAccessTokenProvider {

	static final String REGISTRATION_ID = "microsoft-service";
	private static final String SERVICE_PRINCIPAL = "orcamentos-auth-service";

	private final OAuth2AuthorizedClientManager authorizedClientManager;

	public TechnicalAccessTokenProvider(OAuth2AuthorizedClientManager authorizedClientManager) {
		this.authorizedClientManager = authorizedClientManager;
	}

	public String getTokenValue() {
		var request = OAuth2AuthorizeRequest.withClientRegistrationId(REGISTRATION_ID)
			.principal(SERVICE_PRINCIPAL)
			.build();
		var client = authorizedClientManager.authorize(request);
		if (client == null ) {
			throw new IllegalStateException("Não foi possível obter credencial técnica do Microsoft Graph");
		}
		return client.getAccessToken().getTokenValue();
	}
}
