package br.com.trespenergia.orcamentos.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;

class AuthControllerTests {

	private final AuthController controller = new AuthController();

	@Test
	void returnsOnlySafeIdentityFieldsAndRoles() {
		OidcUser user = mock(OidcUser.class);
		when(user.getSubject()).thenReturn("subject-123");
		when(user.getFullName()).thenReturn("Pessoa Teste");
		when(user.getPreferredUsername()).thenReturn("pessoa@example.invalid");
		doReturn(List.<GrantedAuthority>of(
			new SimpleGrantedAuthority("OIDC_USER"),
			new SimpleGrantedAuthority("ROLE_USER"))).when(user).getAuthorities();

		AuthenticatedUser response = controller.currentUser(user);

		assertThat(response.subject()).isEqualTo("subject-123");
		assertThat(response.authorities()).containsExactly("ROLE_USER");
	}
}
