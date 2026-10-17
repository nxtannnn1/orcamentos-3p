package br.com.trespenergia.orcamentos.poc;

import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "app.poc.keycloak.enabled", havingValue = "true")
public class KeycloakPocConfig {
    @Bean
    JwtDecoder keycloakPocDecoder(
            @Value("${app.poc.keycloak.issuer}") String issuer,
            @Value("${app.poc.keycloak.jwk-set-uri}") String jwks,
            @Value("${app.poc.keycloak.audience}") String audience) {
        if (issuer.isBlank() || jwks.isBlank() || audience.isBlank())
            throw new IllegalArgumentException("PoC issuer, JWKS and audience must be configured");
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwks).build();
        OAuth2TokenValidator<Jwt> required = jwt ->
            jwt.getExpiresAt() != null &&
            jwt.getSubject() != null && !jwt.getSubject().isBlank()
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"));
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
            new JwtTimestampValidator(Duration.ZERO), new JwtIssuerValidator(issuer),
            new JwtClaimValidator<List<String>>("aud", aud -> aud != null && aud.contains(audience)), required));
        return decoder;
    }

    @Bean
    @Order(-10)
    SecurityFilterChain keycloakPocChain(HttpSecurity http, JwtDecoder keycloakPocDecoder) throws Exception {
        return http.securityMatcher("/api/poc/keycloak/**")
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .csrf(c -> c.disable())
            .authorizeHttpRequests(a -> a
                .requestMatchers(HttpMethod.GET, "/api/poc/keycloak/me").authenticated()
                .anyRequest().denyAll())
            .oauth2ResourceServer(o -> o.jwt(j -> j.decoder(keycloakPocDecoder)))
            .build();
    }
}
