
package br.com.trespenergia.orcamentos.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.oidc.authentication.OidcIdTokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;

class MicrosoftOidcIssuerTests {

    private static final String TENANT_A =
            "11111111-1111-1111-1111-111111111111";

    private static final String TENANT_B =
            "22222222-2222-2222-2222-222222222222";

    private static final String ISSUER_A =
            "https://login.microsoftonline.com/" + TENANT_A + "/v2.0";

    private ClientRegistration registration() {
        return ClientRegistration.withRegistrationId("microsoft")
                .clientId("test-client")
                .clientSecret("test-secret")
                .authorizationGrantType(
                        org.springframework.security.oauth2.core.AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
                .authorizationUri(ISSUER_A + "/authorize")
                .tokenUri(ISSUER_A + "/token")
                .jwkSetUri(ISSUER_A + "/keys")
                .issuerUri(ISSUER_A)
                .build();
    }

    private Jwt token(String issuer) {
        Instant now = Instant.now();

        return Jwt.withTokenValue("synthetic-token")
                .header("alg", "RS256")
                .issuer(issuer)
                .subject("user-123")
                .audience(List.of("test-client"))
                .issuedAt(now)
                .expiresAt(now.plusSeconds(300))
                .build();
    }


    @Test
    void rejectsTokenFromAnotherTenant() {
        var validator = new OidcIdTokenValidator(registration());

        var result = validator.validate(
                token("https://login.microsoftonline.com/" + TENANT_B + "/v2.0")
        );

        assertThat(result.hasErrors()).isTrue();
        assertThat(result.getErrors())
                .extracting(OAuth2Error::getErrorCode)
                .contains("invalid_id_token");
    }

    @Test
    void acceptsTokenFromExpectedIssuer() {
        var validator = new OidcIdTokenValidator(registration());

        var result = validator.validate(token(ISSUER_A));

        assertThat(result.hasErrors()).isFalse();
    }

}
