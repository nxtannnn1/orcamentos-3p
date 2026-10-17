package br.com.trespenergia.poc;

import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import br.com.trespenergia.orcamentos.poc.KeycloakPocConfig;
import br.com.trespenergia.orcamentos.poc.KeycloakPocController;

/** Explicit local launcher: no component scan, business database, Graph or Microsoft configuration. */
@Configuration(proxyBeanMethods = false)
@EnableAutoConfiguration(excludeName = {
    "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration",
    "org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration",
    "org.springframework.boot.security.oauth2.client.autoconfigure.OAuth2ClientAutoConfiguration"
})
@Import({KeycloakPocConfig.class, KeycloakPocController.class})
public class KeycloakPocApplication {
    @org.springframework.context.annotation.Bean
    @org.springframework.core.annotation.Order(100)
    org.springframework.security.web.SecurityFilterChain denyOtherEndpoints(
            org.springframework.security.config.annotation.web.builders.HttpSecurity http) throws Exception {
        return http.authorizeHttpRequests(a -> a.anyRequest().denyAll()).build();
    }
    public static void main(String[] args) {
        var app = new SpringApplication(KeycloakPocApplication.class);
        app.setDefaultProperties(Map.of(
            "spring.config.name", "keycloak-poc",
            "server.address", "127.0.0.1",
            "server.port", "18081",
            "app.poc.keycloak.enabled", "true",
            "app.poc.keycloak.issuer", "http://localhost:18080/realms/3p-poc",
            "app.poc.keycloak.jwk-set-uri", "http://localhost:18080/realms/3p-poc/protocol/openid-connect/certs",
            "app.poc.keycloak.audience", "3p-poc-api"));
        app.run(args);
    }
}
