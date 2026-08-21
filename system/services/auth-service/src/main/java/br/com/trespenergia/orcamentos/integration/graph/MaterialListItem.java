package br.com.trespenergia.orcamentos.integration.graph;

import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record MaterialListItem(String id, Map<String, Object> fields) {
}
