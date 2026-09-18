package br.com.trespenergia.orcamentos.integration.graph;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record GraphDrivesResponse(List<GraphDrive> value) {

    public GraphDrivesResponse {
        value = value == null ? List.of() : List.copyOf(value);
    }
}