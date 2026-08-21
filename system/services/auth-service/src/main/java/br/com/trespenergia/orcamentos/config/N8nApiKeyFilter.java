package br.com.trespenergia.orcamentos.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@EnableConfigurationProperties(InternalApiProperties.class)
public class N8nApiKeyFilter extends OncePerRequestFilter {

	static final String API_KEY_HEADER = "X-API-Key";

	private final byte[] expectedApiKey;

	public N8nApiKeyFilter(InternalApiProperties properties) {
		String apiKey = properties.apiKey();
		if (apiKey == null || apiKey.isBlank()) {
			throw new IllegalStateException("N8N_API_KEY deve ser configurada em runtime");
		}
		this.expectedApiKey = apiKey.getBytes(StandardCharsets.UTF_8);
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		String path = request.getRequestURI();
		return !(path.equals("/api/health/graph") || path.startsWith("/api/materials/"));
	}

	@Override
	protected void doFilterInternal(
		HttpServletRequest request,
		HttpServletResponse response,
		FilterChain filterChain) throws ServletException, IOException {

		String suppliedApiKey = request.getHeader(API_KEY_HEADER);
		if (!matches(suppliedApiKey)) {
			response.setStatus(HttpStatus.UNAUTHORIZED.value());
			response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
			return;
		}

		var authentication = new UsernamePasswordAuthenticationToken(
			"n8n",
			null,
			List.of(new SimpleGrantedAuthority("ROLE_N8N")));
		SecurityContextHolder.getContext().setAuthentication(authentication);

		try {
			filterChain.doFilter(request, response);
		} finally {
			SecurityContextHolder.clearContext();
		}
	}

	private boolean matches(String suppliedApiKey) {
		byte[] supplied = suppliedApiKey == null
			? new byte[0]
			: suppliedApiKey.getBytes(StandardCharsets.UTF_8);
		return MessageDigest.isEqual(expectedApiKey, supplied);
	}
}
