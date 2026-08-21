package br.com.trespenergia.orcamentos;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.client.RestClient;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class OrcamentosAuthServiceApplication {

	@Bean
	RestClient.Builder restClientBuilder() {
		return RestClient.builder();
	}

	public static void main(String[] args) {
		SpringApplication.run(OrcamentosAuthServiceApplication.class, args);
	}

}
