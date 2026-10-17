package br.com.trespenergia.orcamentos.poc;

import java.util.List;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name = "app.poc.keycloak.enabled", havingValue = "true")
public class KeycloakPocController {
    @GetMapping("/api/poc/keycloak/me")
    Identity me(@AuthenticationPrincipal Jwt jwt) {
        Map<String, Object> realm = jwt.getClaimAsMap("realm_access");
        Object raw = realm == null ? null : realm.get("roles");
        List<String> roles = raw instanceof List<?> list
            ? list.stream().filter(String.class::isInstance).map(String.class::cast).sorted().toList()
            : List.of();
        return new Identity(jwt.getIssuer().toString(), jwt.getSubject(),
            jwt.getClaimAsString("preferred_username"), roles);
    }
    record Identity(String issuer, String subject, String username, List<String> roles) {}
}
