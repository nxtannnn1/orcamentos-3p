package br.com.trespenergia.orcamentos.integration.graph;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record GraphDriveItemsResponse(List<GraphDriveItem> value) {

    public GraphDriveItemsResponse {
        value = value == null ? List.of() : List.copyOf(value);
    }
}