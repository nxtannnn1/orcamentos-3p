package br.com.trespenergia.orcamentos.config;

import static org.springframework.security.config.Customizer.withDefaults;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(SecurityProperties.class)
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, N8nApiKeyFilter n8nApiKeyFilter) throws Exception {
        http
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(
                                "/swagger-ui.html",
                                "/swagger-ui/**",
                                "/v3/api-docs",
                                "/v3/api-docs/**"
                        ).permitAll()

                        .requestMatchers(
                                "/actuator/health",
                                "/actuator/health/**",
                                "/actuator/info",
                                "/error"
                        ).permitAll()

                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/health/graph",
                                "/api/materials/**",
                                "/api/network-catalog/**",
                                "/api/catalog-libraries",
                                "/api/catalog-files"
                        ).hasRole("N8N")

                        .requestMatchers(
                                HttpMethod.POST,
                                "/api/network-catalog"
                        ).hasRole("N8N")

                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/auth/me",
                                "/api/integrations/microsoft-graph/me"
                        ).authenticated()

                        .anyRequest().denyAll());

        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(SecurityProperties properties) {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(properties.allowedOrigins());
        configuration.setAllowedMethods(java.util.List.of("GET", "POST", "OPTIONS"));
        configuration.setAllowedHeaders(java.util.List.of("Content-Type", "X-XSRF-TOKEN"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }
}
