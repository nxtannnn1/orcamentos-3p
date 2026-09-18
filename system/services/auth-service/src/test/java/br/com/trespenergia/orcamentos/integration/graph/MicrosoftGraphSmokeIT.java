package br.com.trespenergia.orcamentos.integration.graph;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
@Tag("graph-smoke")
class MicrosoftGraphSmokeIT {

    @Autowired
    TechnicalGraphService graphService;

    @Test
    void technicalCredentialsCanReachConfiguredSharePointSite() {
        var health = graphService.health();

        assertThat(health.status()).isEqualTo("UP");
    }
}
