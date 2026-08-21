package br.com.trespenergia.orcamentos.auth;

import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

	@GetMapping("/me")
	AuthenticatedUser currentUser(OidcUser user) {
		Set<String> authorities = user.getAuthorities().stream()
			.map(GrantedAuthority::getAuthority)
			.filter(authority -> authority.startsWith("ROLE_"))
			.collect(Collectors.toUnmodifiableSet());

		return new AuthenticatedUser(
			user.getSubject(),
			user.getFullName(),
			user.getPreferredUsername(),
			authorities);
	}
}
