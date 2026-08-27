package br.com.trespenergia.orcamentos.integration.graph;

@FunctionalInterface
public interface Sleeper {
	void sleep(long millis) throws InterruptedException;
}
