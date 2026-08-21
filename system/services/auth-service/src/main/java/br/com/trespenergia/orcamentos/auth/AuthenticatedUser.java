package br.com.trespenergia.orcamentos.auth;

import java.util.Set;

public record AuthenticatedUser(
	String subject,
	String name,
	String username,
	Set<String> authorities) {
}
