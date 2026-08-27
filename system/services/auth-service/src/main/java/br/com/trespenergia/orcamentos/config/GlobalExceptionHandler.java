package br.com.trespenergia.orcamentos.config;

import java.net.URI;
import java.util.stream.Collectors;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
	private static final URI BLANK_TYPE = URI.create("about:blank");

	@Override
	protected ResponseEntity<Object> handleHandlerMethodValidationException(
			HandlerMethodValidationException ex,
			HttpHeaders headers,
			HttpStatusCode status,
			WebRequest request) {
		log.warn("Parâmetro de requisição inválido: {}", ex.getMessage());
		ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Parâmetro de requisição inválido: id deve ser positivo");
		body.setTitle("Requisição inválida");
		body.setType(BLANK_TYPE);
		return handleExceptionInternal(ex, body, headers, status, request);
	}

	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(
			MethodArgumentNotValidException ex,
			HttpHeaders headers,
			HttpStatusCode status,
			WebRequest request) {
		log.warn("Erro de validação de corpo da requisição: {}", ex.getMessage());
		ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Dados de requisição inválidos");
		body.setTitle("Requisição inválida");
		body.setType(BLANK_TYPE);
		return handleExceptionInternal(ex, body, headers, status, request);
	}

	@ExceptionHandler(ConstraintViolationException.class)
	public ProblemDetail handleConstraintViolationException(ConstraintViolationException ex) {
		log.warn("Violação de restrição: {}", ex.getMessage());
		String detail = ex.getConstraintViolations().stream()
			.map(ConstraintViolation::getMessage)
			.filter(msg -> msg != null && !msg.isBlank())
			.collect(Collectors.joining("; "));
		ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
			HttpStatus.BAD_REQUEST,
			detail.isBlank() ? "Parâmetro inválido" : detail);
		problemDetail.setTitle("Requisição inválida");
		problemDetail.setType(BLANK_TYPE);
		return problemDetail;
	}

	@ExceptionHandler(IllegalArgumentException.class)
	public ProblemDetail handleIllegalArgumentException(IllegalArgumentException ex) {
		log.warn("Parâmetro inválido: {}", ex.getMessage());
		ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
		problemDetail.setTitle("Requisição inválida");
		problemDetail.setType(BLANK_TYPE);
		return problemDetail;
	}

	@ExceptionHandler(HttpClientErrorException.NotFound.class)
	public ProblemDetail handleNotFound(HttpClientErrorException.NotFound ex) {
		log.warn("Recurso não encontrado no Microsoft Graph");
		ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Recurso não encontrado");
		problemDetail.setTitle("Não encontrado");
		problemDetail.setType(BLANK_TYPE);
		return problemDetail;
	}

	@ExceptionHandler(HttpClientErrorException.class)
	public ProblemDetail handleHttpClientError(HttpClientErrorException ex) {
		log.error("Erro retornado pelo Microsoft Graph: status={}", ex.getStatusCode().value());
		ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
			HttpStatus.BAD_GATEWAY,
			"Falha na comunicação com serviço externo");
		problemDetail.setTitle("Erro em serviço externo");
		problemDetail.setType(BLANK_TYPE);
		return problemDetail;
	}

	@ExceptionHandler(HttpServerErrorException.class)
	public ProblemDetail handleHttpServerError(HttpServerErrorException ex) {
		log.error("Erro interno no Microsoft Graph: status={}", ex.getStatusCode().value());
		ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
			HttpStatus.BAD_GATEWAY,
			"Serviço externo indisponível ou com erro temporário");
		problemDetail.setTitle("Erro em serviço externo");
		problemDetail.setType(BLANK_TYPE);
		return problemDetail;
	}

	@ExceptionHandler(ResourceAccessException.class)
	public ProblemDetail handleResourceAccessException(ResourceAccessException ex) {
		log.error("Timeout ou falha de conexão com Microsoft Graph: {}", ex.getMessage());
		ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
			HttpStatus.GATEWAY_TIMEOUT,
			"Tempo limite de comunicação com serviço externo excedido");
		problemDetail.setTitle("Gateway Timeout");
		problemDetail.setType(BLANK_TYPE);
		return problemDetail;
	}

	@ExceptionHandler(IllegalStateException.class)
	public ProblemDetail handleIllegalStateException(IllegalStateException ex) {
		log.error("Erro de estado interno: {}", ex.getMessage());
		ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
			HttpStatus.INTERNAL_SERVER_ERROR,
			"Erro no processamento da solicitação");
		problemDetail.setTitle("Erro interno");
		problemDetail.setType(BLANK_TYPE);
		return problemDetail;
	}

	@ExceptionHandler(Exception.class)
	public ProblemDetail handleGenericException(Exception ex) {
		log.error("Erro inesperado não tratado", ex);
		ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(
			HttpStatus.INTERNAL_SERVER_ERROR,
			"Ocorreu um erro interno inesperado");
		problemDetail.setTitle("Erro interno");
		problemDetail.setType(BLANK_TYPE);
		return problemDetail;
	}
}
