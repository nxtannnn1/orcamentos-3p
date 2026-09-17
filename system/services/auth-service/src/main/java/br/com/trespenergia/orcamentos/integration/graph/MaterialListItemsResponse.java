package br.com.trespenergia.orcamentos.integration.graph;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record MaterialListItemsResponse(List<MaterialListItem> value) {

    public MaterialListItemsResponse {
        value = value == null ? List.of() : List.copyOf(value);
    }
}