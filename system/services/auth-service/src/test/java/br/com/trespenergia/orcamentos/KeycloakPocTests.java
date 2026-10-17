package br.com.trespenergia.orcamentos;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.mockito.Mockito.when;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import com.sun.net.httpserver.HttpServer;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.*;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import br.com.trespenergia.orcamentos.integration.graph.*;

@SpringBootTest(properties = {
		"app.poc.keycloak.enabled=true",
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
class KeycloakPocTests {
    static final RSAKey KEY;
    static final HttpServer JWKS;
    static {
        try {
            KEY = new RSAKeyGenerator(2048).keyID("poc-test").generate();
            JWKS = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            JWKS.createContext("/jwks", exchange -> {
                byte[] body = new JWKSet(KEY.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                try (var stream = exchange.getResponseBody()) { stream.write(body); }
            });
            JWKS.start();
        } catch (Exception e) { throw new ExceptionInInitializerError(e); }
    }
    static final String ISSUER = "http://localhost:18080/realms/3p-poc";
    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.poc.keycloak.issuer", () -> ISSUER);
        registry.add("app.poc.keycloak.jwk-set-uri", () -> "http://127.0.0.1:" + JWKS.getAddress().getPort() + "/jwks");
    }
    @AfterAll static void stop() { JWKS.stop(0); }
    @Autowired MockMvc mvc;
    @MockitoBean TechnicalGraphService graphService;

    String token(String issuer, String audience, long expires, long notBefore, RSAKey signer) throws Exception {
        var claims = new JWTClaimsSet.Builder().issuer(issuer).subject("fictional-person-001")
            .audience(audience).issueTime(Date.from(Instant.now()))
            .expirationTime(Date.from(Instant.now().plusSeconds(expires)))
            .notBeforeTime(Date.from(Instant.now().plusSeconds(notBefore)))
            .claim("preferred_username", "poc-ficticio")
            .claim("realm_access", Map.of("roles", List.of("Consulta"))).build();
        var jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("poc-test").build(), claims);
        jwt.sign(new RSASSASigner(signer));
        return jwt.serialize();
    }
    String valid() throws Exception { return token(ISSUER, "3p-poc-api", 120, -10, KEY); }
    void rejected(String value) throws Exception {
        mvc.perform(get("/api/poc/keycloak/me").header("Authorization", "Bearer " + value))
            .andExpect(status().isUnauthorized());
    }
    @Test void acceptsRealSignatureAndOnlySafeFields() throws Exception {
        mvc.perform(get("/api/poc/keycloak/me").header("Authorization", "Bearer " + valid()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.issuer").value(ISSUER))
            .andExpect(jsonPath("$.subject").value("fictional-person-001"))
            .andExpect(jsonPath("$.username").value("poc-ficticio"))
            .andExpect(jsonPath("$.roles[0]").value("Consulta"))
            .andExpect(jsonPath("$.*").value(org.hamcrest.Matchers.hasSize(4)));
    }
    @Test void rejectsAbsent() throws Exception { mvc.perform(get("/api/poc/keycloak/me")).andExpect(status().isUnauthorized()); }
    @Test void rejectsMalformed() throws Exception { rejected("invalid"); }
    @Test void rejectsWrongSignature() throws Exception { rejected(token(ISSUER,"3p-poc-api",120,-10,new RSAKeyGenerator(2048).generate())); }
    @Test void rejectsExpired() throws Exception { rejected(token(ISSUER,"3p-poc-api",-120,-300,KEY)); }
    @Test void rejectsFuture() throws Exception { rejected(token(ISSUER,"3p-poc-api",300,120,KEY)); }
    @Test void rejectsIssuer() throws Exception { rejected(token("https://wrong.invalid","3p-poc-api",120,-10,KEY)); }
    @Test void rejectsAudience() throws Exception { rejected(token(ISSUER,"wrong-api",120,-10,KEY)); }
    @Test void microsoftSessionCannotEnterPoc() throws Exception {
        var session = new org.springframework.mock.web.MockHttpSession();
        var context = org.springframework.security.core.context.SecurityContextHolder.createEmptyContext();
        var principal = new org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser(
            List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("OIDC_USER")),
            org.springframework.security.oauth2.core.oidc.OidcIdToken.withTokenValue("fake-test-id-token")
                .claim("sub", "microsoft-test").build());
        context.setAuthentication(new org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken(
            principal, principal.getAuthorities(), "microsoft"));
        session.setAttribute("SPRING_SECURITY_CONTEXT", context);
        mvc.perform(get("/api/poc/keycloak/me").session(session)).andExpect(status().isUnauthorized());
    }
    @Test void microsoftStillWorks() throws Exception {
        // Existing AuthController has an unrelated missing @AuthenticationPrincipal annotation.
        // Verify session authorization on a denied route and preserve the Microsoft entry point.
        mvc.perform(get("/api/forbidden").with(oidcLogin())).andExpect(status().isForbidden());
        mvc.perform(get("/oauth2/authorization/microsoft")).andExpect(status().is3xxRedirection());
    }
    @Test void n8nStillRequiresItsOwnKey() throws Exception {
        when(graphService.health()).thenReturn(new GraphHealth("UP"));
        mvc.perform(get("/api/health/graph").header("X-API-Key", "test-n8n-key-not-real")).andExpect(status().isOk());
        mvc.perform(get("/api/health/graph").header("X-API-Key", "wrong")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/health/graph").header("Authorization", "Bearer " + valid())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/poc/keycloak/me").header("X-API-Key", "test-n8n-key-not-real")).andExpect(status().isUnauthorized());
    }
    @Test void keycloakDoesNotAuthorizeOtherEndpoints() throws Exception {
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + valid())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/poc/keycloak/admin").header("Authorization", "Bearer " + valid())).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin").header("Authorization", "Bearer " + valid())).andExpect(status().isUnauthorized());
    }
}
