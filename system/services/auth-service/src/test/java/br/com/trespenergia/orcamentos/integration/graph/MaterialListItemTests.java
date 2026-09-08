package br.com.trespenergia.orcamentos.integration.graph;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;

class MaterialListItemTests {

	@Test
	void filtersOutNonHomologatedFieldsAndRetainsAllowlistedFields() {
		Map<String, Object> input = Map.of(
			"Title", "Cabo de Cobre 50mm",
			"Material", "Cabo 50mm Isolado",
			"Codigo_Neoenergia", "NEO-1234",
			"Status", "ATIVO",
			"@odata.etag", "secret-etag-123",
			"AuthorLookupId", 99,
			"_UIVersionString", "1.0",
			"InternalSharePointMetadata", "sensitive-value"
		);

		MaterialListItem item = new MaterialListItem("101", input);

		assertThat(item.id()).isEqualTo("101");
		assertThat(item.fields()).containsOnlyKeys("Title", "Material", "Codigo_Neoenergia", "Status");
		assertThat(item.fields().get("Title")).isEqualTo("Cabo de Cobre 50mm");
		assertThat(item.fields()).doesNotContainKeys(
			"@odata.etag",
			"AuthorLookupId",
			"_UIVersionString",
			"InternalSharePointMetadata"
		);
	}

	@Test
	void handlesNullFieldsGracefully() {
		MaterialListItem item = new MaterialListItem("102", null);

		assertThat(item.id()).isEqualTo("102");
		assertThat(item.fields()).isNotNull().isEmpty();
	}
}
