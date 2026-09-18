package br.com.trespenergia.orcamentos.integration.graph;

import java.time.OffsetDateTime;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record GraphDriveItem(
        String id,
        String name,
        Map<String, Object> file,
        Map<String, Object> folder,
        OffsetDateTime lastModifiedDateTime) {
}