package br.com.trespenergia.orcamentos.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.client.AuthorizedClientServiceOAuth2AuthorizedClientManager;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientManager;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientProviderBuilder;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;

@Configuration(proxyBeanMethods = false)
public class OAuth2ClientConfig {

	@Bean
	OAuth2AuthorizedClientManager oauth2AuthorizedClientManager(
		ClientRegistrationRepository registrations,
		OAuth2AuthorizedClientService authorizedClients) {

		var provider = OAuth2AuthorizedClientProviderBuilder.builder()
			.clientCredentials()
			.build();
		var manager = new AuthorizedClientServiceOAuth2AuthorizedClientManager(registrations, authorizedClients);
		manager.setAuthorizedClientProvider(provider);
		return manager;
	}
}
