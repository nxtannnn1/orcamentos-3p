package br.com.trespenergia.orcamentos;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

import org.junit.jupiter.api.Test;

class SpringdocProfileConfigurationTests {

    private Properties load(String resource) throws IOException {
        Properties properties = new Properties();
        try (InputStream stream = getClass().getResourceAsStream(resource)) {
            if (stream == null) {
                throw new IOException("Missing test configuration resource");
            }
            properties.load(stream);
        }
        return properties;
    }

    @Test
    void swaggerIsDisabledByDefaultAndEnabledOnlyByLocalProfile() throws IOException {
        Properties defaults = load("/application.properties");
        Properties local = load("/application-local.properties");

        assertThat(defaults.getProperty("springdoc.api-docs.enabled")).isEqualTo("false");
        assertThat(defaults.getProperty("springdoc.swagger-ui.enabled")).isEqualTo("false");
        assertThat(local.getProperty("springdoc.api-docs.enabled")).isEqualTo("true");
        assertThat(local.getProperty("springdoc.swagger-ui.enabled")).isEqualTo("true");
    }
}
