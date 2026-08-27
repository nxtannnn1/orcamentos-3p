package br.com.trespenergia.orcamentos;

import java.time.Duration;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@SpringBootApplication
public class OrcamentosAuthServiceApplication {

	@Bean
	RestClient.Builder restClientBuilder() {
		SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
		requestFactory.setConnectTimeout(Duration.ofSeconds(5));
		requestFactory.setReadTimeout(Duration.ofSeconds(10));
		return RestClient.builder().requestFactory(requestFactory);
	}

	public static void main(String[] args) {
		SpringApplication.run(OrcamentosAuthServiceApplication.class, args);
	}

}

