package br.com.trespenergia.orcamentos.integration.graph;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class MicrosoftGraphPropertiesTests {

    private MicrosoftGraphProperties properties(String baseUrl) {
        return new MicrosoftGraphProperties(baseUrl, "site", "materials", "network", "library");
    }

    @Test
    void acceptsGraphOriginAndVersionedPath() {
        assertThat(properties("https://graph.microsoft.com").baseUrl())
                .isEqualTo("https://graph.microsoft.com");
        assertThat(properties("https://graph.microsoft.com/v1.0").baseUrl())
                .isEqualTo("https://graph.microsoft.com/v1.0");
    }

    @Test
    void rejectsHttpAndLookalikeHosts() {
        for (String url : new String[] {
                "http://graph.microsoft.com",
                "https://graph.microsoft.com.evil.example",
                "https://evil.example",
                "https://user:pass@graph.microsoft.com" }) {
            assertThatThrownBy(() -> properties(url))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void rejectsMalformedUrl() {
        assertThatThrownBy(() -> properties("https://[malformed"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
