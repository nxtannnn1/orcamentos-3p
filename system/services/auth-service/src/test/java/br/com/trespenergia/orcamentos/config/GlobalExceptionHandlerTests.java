package br.com.trespenergia.orcamentos.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;

class GlobalExceptionHandlerTests {

	private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

	@Test
	void handlesIllegalArgumentExceptionWith400ProblemDetail() {
		ProblemDetail problem = handler.handleIllegalArgumentException(new IllegalArgumentException("id deve ser positivo"));

		assertThat(problem.getStatus()).isEqualTo(400);
		assertThat(problem.getTitle()).isEqualTo("Requisição inválida");
		assertThat(problem.getDetail()).isEqualTo("id deve ser positivo");
	}

	@Test
	void handlesNotFoundWith404ProblemDetail() {
		HttpClientErrorException.NotFound ex = (HttpClientErrorException.NotFound) HttpClientErrorException.create(
			HttpStatus.NOT_FOUND,
			"Not Found",
			HttpHeaders.EMPTY,
			new byte[0],
			StandardCharsets.UTF_8);

		ProblemDetail problem = handler.handleNotFound(ex);

		assertThat(problem.getStatus()).isEqualTo(404);
		assertThat(problem.getTitle()).isEqualTo("Não encontrado");
		assertThat(problem.getDetail()).isEqualTo("Recurso não encontrado");
	}

	@Test
	void handlesHttpClientErrorWith502ProblemDetail() {
		HttpClientErrorException ex = HttpClientErrorException.create(
			HttpStatus.UNAUTHORIZED,
			"Unauthorized",
			HttpHeaders.EMPTY,
			new byte[0],
			StandardCharsets.UTF_8);

		ProblemDetail problem = handler.handleHttpClientError(ex);

		assertThat(problem.getStatus()).isEqualTo(502);
		assertThat(problem.getTitle()).isEqualTo("Erro em serviço externo");
		assertThat(problem.getDetail()).isEqualTo("Falha na comunicação com serviço externo");
	}

	@Test
	void handlesHttpServerErrorWith502ProblemDetail() {
		HttpServerErrorException ex = HttpServerErrorException.create(
			HttpStatus.INTERNAL_SERVER_ERROR,
			"Internal Server Error",
			HttpHeaders.EMPTY,
			new byte[0],
			StandardCharsets.UTF_8);

		ProblemDetail problem = handler.handleHttpServerError(ex);

		assertThat(problem.getStatus()).isEqualTo(502);
		assertThat(problem.getTitle()).isEqualTo("Erro em serviço externo");
		assertThat(problem.getDetail()).isEqualTo("Serviço externo indisponível ou com erro temporário");
	}

	@Test
	void handlesResourceAccessExceptionWith504ProblemDetail() {
		ResourceAccessException ex = new ResourceAccessException("Connection timed out");

		ProblemDetail problem = handler.handleResourceAccessException(ex);

		assertThat(problem.getStatus()).isEqualTo(504);
		assertThat(problem.getTitle()).isEqualTo("Gateway Timeout");
		assertThat(problem.getDetail()).isEqualTo("Tempo limite de comunicação com serviço externo excedido");
	}

	@Test
	void handlesIllegalStateExceptionWith500ProblemDetail() {
		IllegalStateException ex = new IllegalStateException("Configuração inválida");

		ProblemDetail problem = handler.handleIllegalStateException(ex);

		assertThat(problem.getStatus()).isEqualTo(500);
		assertThat(problem.getTitle()).isEqualTo("Erro interno");
		assertThat(problem.getDetail()).isEqualTo("Erro no processamento da solicitação");
	}

	@Test
	void handlesGenericExceptionWith500ProblemDetail() {
		Exception ex = new RuntimeException("Erro inesperado");

		ProblemDetail problem = handler.handleGenericException(ex);

		assertThat(problem.getStatus()).isEqualTo(500);
		assertThat(problem.getTitle()).isEqualTo("Erro interno");
		assertThat(problem.getDetail()).isEqualTo("Ocorreu um erro interno inesperado");
	}
}
