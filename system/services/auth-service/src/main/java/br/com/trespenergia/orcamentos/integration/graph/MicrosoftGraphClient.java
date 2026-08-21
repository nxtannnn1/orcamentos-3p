package br.com.trespenergia.orcamentos.integration.graph;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
@EnableConfigurationProperties(MicrosoftGraphProperties.class)
public class MicrosoftGraphClient {

	private final RestClient restClient;

	public MicrosoftGraphClient(RestClient.Builder builder, MicrosoftGraphProperties properties) {
		this.restClient = builder.baseUrl(properties.baseUrl().toString()).build();
	}

	public GraphUserProfile currentUser(String accessToken) {
		return restClient.get()
			.uri("/me?$select=id,displayName,mail,userPrincipalName")
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
			.retrieve()
			.body(GraphUserProfile.class);
	}

	public GraphSite site(String accessToken, String siteId) {
		return restClient.get()
			.uri(uri -> uri.pathSegment("sites", siteId).queryParam("$select", "id").build())
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
			.retrieve()
			.body(GraphSite.class);
	}

	public MaterialListItem material(String accessToken, String siteId, String listId, long itemId) {
		return restClient.get()
			.uri(uri -> uri
				.pathSegment("sites", siteId, "lists", listId, "items", Long.toString(itemId))
				.queryParam("$expand", "fields")
				.build())
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
			.retrieve()
			.body(MaterialListItem.class);
	}
}
