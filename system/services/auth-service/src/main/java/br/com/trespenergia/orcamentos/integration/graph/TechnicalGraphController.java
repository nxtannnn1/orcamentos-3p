package br.com.trespenergia.orcamentos.integration.graph;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

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
			@RequestParam
			@NotBlank(message = "key não deve estar vazia")
			@Size(max = 255, message = "key deve ter no máximo 255 caracteres")
			String key) {

		return graphService.networkCatalogByImportKey(key);
	}

	@PostMapping("/network-catalog")
	@ResponseStatus(HttpStatus.CREATED)
	MaterialListItem createNetworkCatalogItem(@RequestBody Map<String, Object> fields) {
		return graphService.createNetworkCatalogItem(fields);
	}

	@GetMapping("/catalog-libraries")
	GraphDrivesResponse catalogLibraries() {
		return graphService.siteDrives();
	}

	@GetMapping("/catalog-files")
	GraphDriveItemsResponse catalogFiles(@RequestParam String path) {
		return graphService.catalogFolderChildren(path);
	}

}
