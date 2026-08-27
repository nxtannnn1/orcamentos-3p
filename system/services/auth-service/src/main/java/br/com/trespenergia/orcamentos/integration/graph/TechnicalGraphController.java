package br.com.trespenergia.orcamentos.integration.graph;

import jakarta.validation.constraints.Positive;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api")
public class TechnicalGraphController {

	private final TechnicalGraphService graphService;

	public TechnicalGraphController(TechnicalGraphService graphService) {
		this.graphService = graphService;
	}

	@GetMapping("/health/graph")
	GraphHealth graphHealth() {
		return graphService.health();
	}

	@GetMapping("/materials/{id}")
	MaterialListItem material(@PathVariable @Positive(message = "id deve ser positivo") long id) {
		if (id < 1) {
			throw new IllegalArgumentException("id deve ser positivo");
		}
		return graphService.material(id);
	}
}

