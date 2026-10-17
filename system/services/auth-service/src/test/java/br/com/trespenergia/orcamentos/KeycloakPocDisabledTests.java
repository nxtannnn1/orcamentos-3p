package br.com.trespenergia.orcamentos;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.context.ApplicationContext;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;
@SpringBootTest(properties = {
		"app.poc.keycloak.enabled=false",
        "app.poc.keycloak.audience=3p-poc-api",
        "MICROSOFT_TENANT_ID=test-tenant",
		"MICROSOFT_CLIENT_ID=test-client",
		"MICROSOFT_CLIENT_SECRET=test-secret-not-real",
		"MICROSOFT_SERVICE_CLIENT_ID=test-service-client",
		"MICROSOFT_SERVICE_CLIENT_SECRET=test-service-secret",
		"N8N_API_KEY=test-n8n-key-not-real",
		"SHAREPOINT_SITE_ID=test.example.invalid,collection-id,web-id",
		"SHAREPOINT_MATERIALS_LIST_ID=materials-list-id",
		"APP_CORS_ALLOWED_ORIGINS=http://localhost:3000",
		"SESSION_COOKIE_SECURE=false"
})
@ActiveProfiles("test")
@AutoConfigureMockMvc
@Import(OrcamentosAuthServiceApplicationTests.TestOAuth2Config.class)
class KeycloakPocDisabledTests {
    @Autowired MockMvc mvc;
    @Autowired ApplicationContext context;
    @Test void disabledPocHasNoDecoderOrControllerAndCannotBeAccessed() throws Exception {
        assertThat(context.getBeansOfType(br.com.trespenergia.orcamentos.poc.KeycloakPocController.class)).isEmpty();
        assertThat(context.getBeansOfType(org.springframework.security.oauth2.jwt.JwtDecoder.class)).isEmpty();
        mvc.perform(get("/api/poc/keycloak/me")).andExpect(status().isUnauthorized());
    }
}
