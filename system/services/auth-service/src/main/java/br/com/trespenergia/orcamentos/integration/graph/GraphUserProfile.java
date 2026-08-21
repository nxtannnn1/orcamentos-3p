package br.com.trespenergia.orcamentos.integration.graph;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record GraphUserProfile(String id, String displayName, String mail, String userPrincipalName) {
}
