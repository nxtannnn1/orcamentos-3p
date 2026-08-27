package br.com.trespenergia.orcamentos.integration.graph;

import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.function.Supplier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Component
@EnableConfigurationProperties(MicrosoftGraphProperties.class)
public class MicrosoftGraphClient {

	private static final Logger log = LoggerFactory.getLogger(MicrosoftGraphClient.class);

	static final int MAX_ATTEMPTS = 3;
	static final long BASE_RETRY_DELAY_MS = 200L;
	static final long MAX_RETRY_DELAY_MS = 5000L;

	private final RestClient restClient;
	private final Sleeper sleeper;

	@Autowired
	public MicrosoftGraphClient(RestClient.Builder builder, MicrosoftGraphProperties properties) {
		this(builder.baseUrl(properties.baseUrl().toString()).build(), Thread::sleep);
	}


	MicrosoftGraphClient(RestClient restClient, Sleeper sleeper) {
		this.restClient = restClient;
		this.sleeper = sleeper;
	}

	public GraphUserProfile currentUser(String accessToken) {
		return executeWithRetry(() -> restClient.get()
			.uri("/me?$select=id,displayName,mail,userPrincipalName")
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
			.retrieve()
			.body(GraphUserProfile.class));
	}

	public GraphSite site(String accessToken, String siteId) {
		return executeWithRetry(() -> restClient.get()
			.uri(uri -> uri.pathSegment("sites", siteId).queryParam("$select", "id").build())
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
			.retrieve()
			.body(GraphSite.class));
	}

	public MaterialListItem material(String accessToken, String siteId, String listId, long itemId) {
		return executeWithRetry(() -> restClient.get()
			.uri(uri -> uri
				.pathSegment("sites", siteId, "lists", listId, "items", Long.toString(itemId))
				.queryParam("$expand", "fields")
				.build())
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
			.retrieve()
			.body(MaterialListItem.class));
	}

	<T> T executeWithRetry(Supplier<T> requestSupplier) {
		int attempt = 0;
		while (true) {
			attempt++;
			try {
				return requestSupplier.get();
			} catch (RestClientResponseException ex) {
				int statusCode = ex.getStatusCode().value();
				if (!isTransientStatus(statusCode) || attempt >= MAX_ATTEMPTS) {
					throw ex;
				}
				long delayMs = resolveBackoffDelay(ex.getResponseHeaders(), attempt);
				log.warn("Falha transitória na chamada ao Microsoft Graph (status={}, tentativa {}/{}). Aguardando {}ms...",
					statusCode, attempt, MAX_ATTEMPTS, delayMs);
				sleep(delayMs);
			} catch (ResourceAccessException ex) {
				if (attempt >= MAX_ATTEMPTS) {
					throw ex;
				}
				long delayMs = calculateDefaultBackoff(attempt);
				log.warn("Falha transitória de rede/timeout ao Microsoft Graph (tentativa {}/{}). Aguardando {}ms...",
					attempt, MAX_ATTEMPTS, delayMs);
				sleep(delayMs);
			}
		}
	}

	private boolean isTransientStatus(int statusCode) {
		return statusCode == 429
			|| statusCode == 500
			|| statusCode == 502
			|| statusCode == 503
			|| statusCode == 504;
	}

	private long resolveBackoffDelay(HttpHeaders headers, int attempt) {
		if (headers != null) {
			String retryAfter = headers.getFirst(HttpHeaders.RETRY_AFTER);
			if (retryAfter != null && !retryAfter.isBlank()) {
				try {
					long seconds = Long.parseLong(retryAfter.trim());
					long millis = seconds * 1000L;
					return Math.min(Math.max(millis, 100L), MAX_RETRY_DELAY_MS);
				} catch (NumberFormatException ignored) {
					try {
						ZonedDateTime retryDate = ZonedDateTime.parse(retryAfter.trim(), DateTimeFormatter.RFC_1123_DATE_TIME);
						long millis = Duration.between(Instant.now(), retryDate.toInstant()).toMillis();
						return Math.min(Math.max(millis, 100L), MAX_RETRY_DELAY_MS);
					} catch (Exception ignoredDate) {
						// Formato não reconhecido, fallback para backoff padrão
					}
				}
			}
		}
		return calculateDefaultBackoff(attempt);
	}

	private long calculateDefaultBackoff(int attempt) {
		long delay = BASE_RETRY_DELAY_MS * (1L << (attempt - 1));
		return Math.min(delay, MAX_RETRY_DELAY_MS);
	}

	private void sleep(long millis) {
		try {
			sleeper.sleep(millis);
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("Operação interrompida durante espera de retry", e);
		}
	}
}

