package com.github.claudecodegui.provider;

import org.junit.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

public class CustomModelContextWindowProviderTest {

    @Test
    public void shouldResolveOnlyWholeKContextWindowsByProviderAndExactModelId() throws Exception {
        Path config = Files.createTempFile("custom-model-context", ".json");
        Files.writeString(config, """
                {
                  "customModelContextWindows": {
                    "claude": {
                      "shared-model": 500000,
                      "invalid-model": -1
                    },
                    "codex": {
                      "shared-model": 1000000,
                      "partial-k-model": 500500,
                      "sub-k-model": 500,
                      "fractional-model": 12.5
                    },
                    "grok": {
                      "shared-model": 500000,
                      "partial-k-model": 500500,
                      "sub-k-model": 500,
                      "fractional-model": 12.5
                    }
                  }
                }
                """);

        CustomModelContextWindowProvider provider = CustomModelContextWindowProvider.createForTests(config);

        assertFalse(provider.getContextWindow("claude", "shared-model").isPresent());
        assertEquals(1_000_000, provider.getContextWindow("codex", "shared-model").orElseThrow());
        assertFalse(provider.getContextWindow("codex", "shared-model[1m]").isPresent());
        assertFalse(provider.getContextWindow("claude", "invalid-model").isPresent());
        assertFalse(provider.getContextWindow("codex", "partial-k-model").isPresent());
        assertFalse(provider.getContextWindow("codex", "sub-k-model").isPresent());
        assertFalse(provider.getContextWindow("codex", "fractional-model").isPresent());
        assertFalse(provider.getContextWindow("codex", "missing-model").isPresent());
        assertEquals(500_000, provider.getContextWindow("grok", "shared-model").orElseThrow());
        assertEquals(500_000, provider.getContextWindow(" GROK ", " shared-model ").orElseThrow());
        assertFalse(provider.getContextWindow("grok", "shared-model[1m]").isPresent());
        assertFalse(provider.getContextWindow("grok", "partial-k-model").isPresent());
        assertFalse(provider.getContextWindow("grok", "sub-k-model").isPresent());
        assertFalse(provider.getContextWindow("grok", "fractional-model").isPresent());
        assertFalse(provider.getContextWindow("grok", "missing-model").isPresent());
    }
}
