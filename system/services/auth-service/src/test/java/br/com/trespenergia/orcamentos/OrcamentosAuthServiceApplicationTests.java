package br.com.trespenergia.orcamentos;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import br.com.trespenergia.orcamentos.integration.graph.GraphHealth;
import br.com.trespenergia.orcamentos.integration.graph.TechnicalGraphService;

@SpringBootTest(properties = {
	"MICROSOFT_TENANT_ID=test-tenant",
	"MICROSOFT_CLIENT_ID=test-client",
	"MICROSOFT_CLIENT_SECRET=test-secret-not-real",
	"MICROSOFT_SERVICE_CLIENT_ID=test-service-client",
	"MICROSOFT_SERVICE_CLIENT_SECRET=test-service-secret-not-real",
	"N8N_API_KEY=test-n8n-key-not-real",
	"SHAREPOINT_SITE_ID=test.example.invalid,collection-id,web-id",
	"SHAREPOINT_MATERIALS_LIST_ID=materials-list-id",
	"APP_CORS_ALLOWED_ORIGINS=http://localhost:3000",
	"SESSION_COOKIE_SECURE=false"
})
@AutoConfigureMockMvc
class OrcamentosAuthServiceApplicationTests {

	@Autowired
	MockMvc mockMvc;

	@Autowired
	ClientRegistrationRepository registrations;

	@MockitoBean
	TechnicalGraphService graphService;

	@Test
	void contextLoads() {
	}

	@Test
	void technicalRegistrationUsesClientCredentialsAndGraphDefaultScope() {
		var registration = registrations.findByRegistrationId("microsoft-service");

		assertThat(registration.getAuthorizationGrantType()).isEqualTo(AuthorizationGrantType.CLIENT_CREDENTIALS);
		assertThat(registration.getScopes()).containsExactly("https://graph.microsoft.com/.default");
	}

	@Test
	void technicalEndpointRejectsMissingApiKeyWithoutInteractiveSession() throws Exception {
		mockMvc.perform(get("/api/health/graph"))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void technicalEndpointAcceptsApiKeyWithoutInteractiveSession() throws Exception {
		when(graphService.health()).thenReturn(new GraphHealth("UP"));

		mockMvc.perform(get("/api/health/graph").header("X-API-Key", "test-n8n-key-not-real"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("UP"));
	}

	@Test
	void technicalEndpointRejectsWrongApiKey() throws Exception {
		mockMvc.perform(get("/api/health/graph").header("X-API-Key", "wrong-key"))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void materialsEndpointRejectsMissingApiKey() throws Exception {
		mockMvc.perform(get("/api/materials/42"))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void materialsEndpointAcceptsApiKeyAndReturnsMaterial() throws Exception {
		var material = new br.com.trespenergia.orcamentos.integration.graph.MaterialListItem(
			"42", java.util.Map.of("Title", "Cabo 10mm"));
		when(graphService.material(42L)).thenReturn(material);

		mockMvc.perform(get("/api/materials/42").header("X-API-Key", "test-n8n-key-not-real"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.id").value("42"))
			.andExpect(jsonPath("$.fields.Title").value("Cabo 10mm"));
	}

	@Test
	void actuatorHealthPermitAllWithoutAuthentication() throws Exception {
		mockMvc.perform(get("/actuator/health"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("UP"));
	}

	@Test
	void authMeEndpointRejectsUnauthenticated() throws Exception {
		mockMvc.perform(get("/api/auth/me"))
			.andExpect(status().isUnauthorized());
	}
}

