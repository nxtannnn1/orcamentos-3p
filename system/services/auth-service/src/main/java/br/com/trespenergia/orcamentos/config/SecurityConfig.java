package br.com.trespenergia.orcamentos.config;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;
import static org.springframework.security.config.Customizer.withDefaults;

import org.springframework.security.config.web.PathPatternRequestMatcherBuilderFactoryBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(SecurityProperties.class)
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            N8nApiKeyFilter n8nApiKeyFilter) throws Exception {

        http
                .authorizeHttpRequests(authorize -> authorize

                        // Swagger / OpenAPI
                        .requestMatchers(
                                "/swagger-ui.html",
                                "/swagger-ui/**",
                                "/v3/api-docs",
                                "/v3/api-docs/**"
                        ).permitAll()

                        // Actuator
                        .requestMatchers(
                                "/actuator/health",
                                "/actuator/health/**",
                                "/actuator/info",
                                "/error"
                        ).permitAll()

                        // Endpoints técnicos protegidos pela API Key do n8n
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

                        // Endpoints do usuário autenticado via Microsoft
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/auth/me",
                                "/api/integrations/microsoft-graph/me"
                        ).authenticated()

                        .anyRequest().denyAll()
                )

                // Autenticação técnica do n8n
                .addFilterBefore(
                        n8nApiKeyFilter,
                        UsernamePasswordAuthenticationFilter.class
                )

                // Login Microsoft OAuth2
                .oauth2Login(withDefaults())

                .logout(logout -> logout
                        .logoutUrl("/api/auth/logout")
                        .deleteCookies("JSESSIONID")
                        .invalidateHttpSession(true)
                        .clearAuthentication(true)
                )

                // APIs retornam 401 em vez de redirecionar para login
                .exceptionHandling(exceptions -> exceptions
                        .defaultAuthenticationEntryPointFor(
                                new HttpStatusEntryPoint(UNAUTHORIZED),
                                request -> request
                                        .getRequestURI()
                                        .startsWith("/api/")
                        )
                )

                .cors(withDefaults())

                .csrf(csrf -> csrf
                        .csrfTokenRepository(
                                CookieCsrfTokenRepository.withHttpOnlyFalse()
                        )
                        .ignoringRequestMatchers(
                                PathPatternRequestMatcher.pathPattern(
                                        HttpMethod.POST,
                                        "/api/network-catalog"
                                )
                        )
                );

        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(
            SecurityProperties properties) {

        CorsConfiguration configuration = new CorsConfiguration();

        configuration.setAllowedOrigins(
                properties.allowedOrigins()
        );

        configuration.setAllowedMethods(
                java.util.List.of(
                        "GET",
                        "POST",
                        "OPTIONS"
                )
        );

        configuration.setAllowedHeaders(
                java.util.List.of(
                        "Content-Type",
                        "X-XSRF-TOKEN"
                )
        );

        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source =
                new UrlBasedCorsConfigurationSource();

        source.registerCorsConfiguration(
                "/api/**",
                configuration
        );

        return source;
    }

    @Bean
    PathPatternRequestMatcherBuilderFactoryBean requestMatcherBuilder() {
        return new PathPatternRequestMatcherBuilderFactoryBean();
    }
}