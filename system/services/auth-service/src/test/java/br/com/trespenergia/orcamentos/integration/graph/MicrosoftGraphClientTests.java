package br.com.trespenergia.orcamentos.integration.graph;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

class MicrosoftGraphClientTests {

	private final Sleeper sleeper = mock(Sleeper.class);
	private final List<Long> sleepDelays = new ArrayList<>();
	private final Sleeper recordingSleeper = sleepDelays::add;

	@BeforeEach
	void setup() {
		sleepDelays.clear();
	}

	@Test
	void executeWithRetryReturnsResultOnFirstAttempt() {
		MicrosoftGraphClient client = new MicrosoftGraphClient((RestClient) null, sleeper);
		String result = client.executeWithRetry(() -> "success");

		assertThat(result).isEqualTo("success");
		verifyNoInteractions(sleeper);
	}

	@Test
	void executeWithRetryRetriesOn429WithRetryAfterHeader() throws Exception {
		MicrosoftGraphClient client = new MicrosoftGraphClient((RestClient) null, recordingSleeper);
		AtomicInteger attempts = new AtomicInteger(0);

		HttpHeaders headers = new HttpHeaders();
		headers.set(HttpHeaders.RETRY_AFTER, "2");

		String result = client.executeWithRetry(() -> {
			int current = attempts.incrementAndGet();
			if (current == 1) {
				throw HttpClientErrorException.create(
					HttpStatus.TOO_MANY_REQUESTS,
					"Too Many Requests",
					headers,
					new byte[0],
					StandardCharsets.UTF_8);
			}
			return "recovered";
		});

		assertThat(result).isEqualTo("recovered");
		assertThat(attempts.get()).isEqualTo(2);
		assertThat(sleepDelays).containsExactly(2000L);
	}

	@Test
	void executeWithRetryRetriesOn503AndSucceeds() {
		MicrosoftGraphClient client = new MicrosoftGraphClient((RestClient) null, recordingSleeper);
		AtomicInteger attempts = new AtomicInteger(0);

		String result = client.executeWithRetry(() -> {
			int current = attempts.incrementAndGet();
			if (current == 1) {
				throw HttpServerErrorException.create(
					HttpStatus.SERVICE_UNAVAILABLE,
					"Service Unavailable",
					HttpHeaders.EMPTY,
					new byte[0],
					StandardCharsets.UTF_8);
			}
			return "recovered-from-503";
		});

		assertThat(result).isEqualTo("recovered-from-503");
		assertThat(attempts.get()).isEqualTo(2);
		assertThat(sleepDelays).containsExactly(200L);
	}

	@Test
	void executeWithRetryRetriesOnResourceAccessExceptionAndSucceeds() {
		MicrosoftGraphClient client = new MicrosoftGraphClient((RestClient) null, recordingSleeper);
		AtomicInteger attempts = new AtomicInteger(0);

		String result = client.executeWithRetry(() -> {
			int current = attempts.incrementAndGet();
			if (current == 1) {
				throw new ResourceAccessException("Connection timed out");
			}
			return "recovered-from-timeout";
		});

		assertThat(result).isEqualTo("recovered-from-timeout");
		assertThat(attempts.get()).isEqualTo(2);
		assertThat(sleepDelays).containsExactly(200L);
	}

	@Test
	void executeWithRetryStopsAfterMaxAttempts() {
		MicrosoftGraphClient client = new MicrosoftGraphClient((RestClient) null, recordingSleeper);
		AtomicInteger attempts = new AtomicInteger(0);

		assertThatThrownBy(() -> client.executeWithRetry(() -> {
			attempts.incrementAndGet();
			throw new ResourceAccessException("Persistent network failure");
		}))
		.isInstanceOf(ResourceAccessException.class)
		.hasMessageContaining("Persistent network failure");

		assertThat(attempts.get()).isEqualTo(3);
		assertThat(sleepDelays).hasSize(2);
	}

	@Test
	void executeWithRetryDoesNotRetryOn400BadRequest() {
		MicrosoftGraphClient client = new MicrosoftGraphClient((RestClient) null, sleeper);
		AtomicInteger attempts = new AtomicInteger(0);

		assertThatThrownBy(() -> client.executeWithRetry(() -> {
			attempts.incrementAndGet();
			throw HttpClientErrorException.create(
				HttpStatus.BAD_REQUEST,
				"Bad Request",
				HttpHeaders.EMPTY,
				new byte[0],
				StandardCharsets.UTF_8);
		}))
		.isInstanceOf(HttpClientErrorException.class);

		assertThat(attempts.get()).isEqualTo(1);
		verifyNoInteractions(sleeper);
	}

	@Test
	void executeWithRetryDoesNotRetryOn401Unauthorized() {
		MicrosoftGraphClient client = new MicrosoftGraphClient((RestClient) null, sleeper);
		AtomicInteger attempts = new AtomicInteger(0);

		assertThatThrownBy(() -> client.executeWithRetry(() -> {
			attempts.incrementAndGet();
			throw HttpClientErrorException.create(
				HttpStatus.UNAUTHORIZED,
				"Unauthorized",
				HttpHeaders.EMPTY,
				new byte[0],
				StandardCharsets.UTF_8);
		}))
		.isInstanceOf(HttpClientErrorException.class);

		assertThat(attempts.get()).isEqualTo(1);
		verifyNoInteractions(sleeper);
	}

	@Test
	void executeWithRetryDoesNotRetryOn403Forbidden() {
		MicrosoftGraphClient client = new MicrosoftGraphClient((RestClient) null, sleeper);
		AtomicInteger attempts = new AtomicInteger(0);

		assertThatThrownBy(() -> client.executeWithRetry(() -> {
			attempts.incrementAndGet();
			throw HttpClientErrorException.create(
				HttpStatus.FORBIDDEN,
				"Forbidden",
				HttpHeaders.EMPTY,
				new byte[0],
				StandardCharsets.UTF_8);
		}))
		.isInstanceOf(HttpClientErrorException.class);

		assertThat(attempts.get()).isEqualTo(1);
		verifyNoInteractions(sleeper);
	}

	@Test
	void executeWithRetryDoesNotRetryOn404NotFound() {
		MicrosoftGraphClient client = new MicrosoftGraphClient((RestClient) null, sleeper);
		AtomicInteger attempts = new AtomicInteger(0);

		assertThatThrownBy(() -> client.executeWithRetry(() -> {
			attempts.incrementAndGet();
			throw HttpClientErrorException.create(
				HttpStatus.NOT_FOUND,
				"Not Found",
				HttpHeaders.EMPTY,
				new byte[0],
				StandardCharsets.UTF_8);
		}))
		.isInstanceOf(HttpClientErrorException.class);

		assertThat(attempts.get()).isEqualTo(1);
		verifyNoInteractions(sleeper);
	}
}
