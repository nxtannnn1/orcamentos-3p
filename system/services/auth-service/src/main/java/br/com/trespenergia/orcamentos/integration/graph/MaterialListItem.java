package br.com.trespenergia.orcamentos.integration.graph;

import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record MaterialListItem(String id, Map<String, Object> fields) {

	public static final Set<String> ALLOWED_FIELDS = Set.of(
		"Title",
		"Material",
		"Nome_Normalizado",
		"Chave_Normalizada",
		"Categoria",
		"Familia",
		"Subfamilia",
		"Unidade_Padrao",
		"Marca_Ref",
		"Modelo_Ref",
		"Especificacao_Tecnica",
		"Atributos_Essenciais",
		"Sinonimos",
		"Status",
		"Tipo_Registro",
		"Codigo_Neoenergia",
		"Codigo_Elektro",
		"Codigo_Brasilia",
		"Origem_Catalogo",
		"Descricao_Neoenergia",
		"Revisao_Obrigatoria",
		"Data_Atualizacao",
		"Modified",
		"Created"
	);

	public MaterialListItem {
		fields = fields == null
			? Map.of()
			: fields.entrySet().stream()
				.filter(entry -> ALLOWED_FIELDS.contains(entry.getKey()))
				.collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
	}
}
