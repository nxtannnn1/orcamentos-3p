package br.com.trespenergia.orcamentos.integration.graph;

import jakarta.validation.constraints.Positive;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@Validated
@RestController
@RequestMapping("/api")
public class TechnicalGraphController {

	private final TechnicalGraphService graphService;

	public TechnicalGraphController(TechnicalGraphService graphService) {
		this.graphService = graphService;
	}

	@GetMapping("/network-catalog/{id}")
	MaterialListItem networkCatalogItem(
			@PathVariable @Positive(message = "id deve ser positivo") long id) {

		return graphService.networkCatalogItem(id);
	}

	@GetMapping("/health/graph")
	GraphHealth graphHealth() {
		return graphService.health();
	}

	@GetMapping("/materials/{id}")
	MaterialListItem material(@PathVariable @Positive(message = "id deve ser positivo") long id) {

		return graphService.material(id);
	}

	@GetMapping("/network-catalog/by-import-key")
	MaterialListItemsResponse networkCatalogByImportKey(
			@RequestParam String key) {

		return graphService.networkCatalogByImportKey(key);
	}
}

