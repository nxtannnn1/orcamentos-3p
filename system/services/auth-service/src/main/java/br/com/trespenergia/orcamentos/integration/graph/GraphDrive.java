package br.com.trespenergia.orcamentos.integration.graph;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record GraphDrive(
        String id,
        String name) {
}