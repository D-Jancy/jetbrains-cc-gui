package com.github.claudecodegui.provider.grok;

import com.github.claudecodegui.provider.CustomModelContextWindowProvider;
import com.google.gson.JsonObject;
import org.junit.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.concurrent.CompletableFuture;

import static org.junit.Assert.*;

/**
 * Comprehensive tests for Grok provider components after persistent ACP + rebase.
 */
public class GrokSDKBridgeTest {

    @Test
    public void testBuildStdinPayloadIncludesGrokFields() {
        GrokSDKBridge bridge = new GrokSDKBridge();
        bridge.setApiKey("test-key");

        JsonObject payload = bridge.buildStdinPayloadForDaemon(
                "hello grok",
                "sess-123",
                "epoch-xyz",
                "/tmp",
                Collections.emptyList(),
                "default",
                "grok-2",
                null,
                "",
                true,
                false,
                null
        );

        assertEquals("hello grok", payload.get("message").getAsString());
        assertEquals("grok-2", payload.get("model").getAsString());
        assertEquals("test-key", payload.get("apiKey").getAsString());
        assertEquals("sess-123", payload.get("sessionId").getAsString());
    }

    @Test
    public void testSetPermissionModeLiveSkipsWhenNoDaemon() {
        GrokSDKBridge bridge = new GrokSDKBridge();

        // No daemon running: best-effort skip (must not throw / hang).
        JsonObject result = bridge.setPermissionModeLive("sess", "ep", "bypassPermissions").join();
        assertNotNull(result);
        assertTrue(result.get("success").getAsBoolean());
        assertFalse(result.get("applied").getAsBoolean());
        assertEquals("no-daemon", result.get("reason").getAsString());
    }

    @Test
    public void getContextUsageSynthesizesFromLastUsageWithoutDaemon() {
        GrokSDKBridge bridge = new GrokSDKBridge();
        bridge.setLastUsedTokensForTest(12_000);

        JsonObject result = bridge.getContextUsage("sess", "/tmp", "grok-2").join();
        assertTrue(result.get("success").getAsBoolean());
        assertEquals(12_000, result.get("totalTokens").getAsInt());
        assertEquals(128_000, result.get("maxTokens").getAsInt()); // grok-2 limit
        assertEquals("grok-2", result.get("model").getAsString());
        assertEquals("grok-synthesized", result.get("source").getAsString());
    }

    @Test
    public void getContextUsageUsesCustomGrokContextWindow() throws Exception {
        Path config = Files.createTempFile("grok-sdk-context", ".json");
        Files.writeString(config, """
                {"customModelContextWindows":{"grok":{"grok-4.7":500000}}}
                """);
        CustomModelContextWindowProvider.setInstanceForTests(
                CustomModelContextWindowProvider.createForTests(config));
        try {
            GrokSDKBridge bridge = new GrokSDKBridge();
            bridge.setLastUsedTokensForTest(50_000);

            JsonObject result = bridge.getContextUsage("sess", "/tmp", "grok-4.7").join();

            assertEquals(50_000, result.get("totalTokens").getAsInt());
            assertEquals(500_000, result.get("maxTokens").getAsInt());
            assertEquals(10.0, result.get("percentage").getAsDouble(), 0.001);
        } finally {
            CustomModelContextWindowProvider.setInstanceForTests(null);
            Files.deleteIfExists(config);
        }
    }

    @Test
    public void getUsageReturnsStructuredUnavailableWithoutHangingWhenNoDaemon() {
        GrokSDKBridge bridge = new GrokSDKBridge();
        JsonObject result = bridge.getUsage("/tmp").join();
        assertTrue(result.get("success").getAsBoolean());
        assertTrue(result.has("data"));
        assertTrue(result.getAsJsonObject("data").get("unavailable").getAsBoolean());
        assertTrue(result.getAsJsonObject("data").get("message").getAsString().length() > 0);
    }

    @Test
    public void buildUsageUnavailableHasUiShape() {
        JsonObject result = GrokSDKBridge.buildUsageUnavailable("test msg");
        assertTrue(result.get("success").getAsBoolean());
        assertEquals("test msg", result.getAsJsonObject("data").get("message").getAsString());
        assertEquals("plugin-fallback", result.getAsJsonObject("data").get("source").getAsString());
    }

    @Test
    public void testSetPermissionModeLiveAcceptsDefaultAndBypassModesWithoutThrowing() {
        GrokSDKBridge bridge = new GrokSDKBridge();

        JsonObject defaultResult = bridge.setPermissionModeLive("s", "e", "default").join();
        assertTrue(defaultResult.get("success").getAsBoolean());
        assertEquals("no-daemon", defaultResult.get("reason").getAsString());

        JsonObject autoResult = bridge.setPermissionModeLive("s", "e", "bypassPermissions").join();
        assertTrue(autoResult.get("success").getAsBoolean());
        assertFalse(autoResult.get("applied").getAsBoolean());
    }

    @Test
    public void testResetAndPrewarmMethodsDoNotThrow() {
        GrokSDKBridge bridge = new GrokSDKBridge();

        // These should be no-op or safe when no daemon
        try {
            bridge.resetPersistentRuntime("some-epoch");
            bridge.prewarmDaemonAsync("/tmp", "ep-1");
            bridge.prewarmDaemonAsync("/tmp", "ep-2", "sess-xyz");
        } catch (Exception e) {
            throw new AssertionError("Should not throw", e);
        }
    }

    @Test
    public void grokMessageHandlerUsageUsesRealContextLimit() {
        // The fix ensures GrokMessageHandler calls getModelContextLimit instead of hardcoding 0.
        // We verify the model limit helper works for Grok names.
        int limit = com.github.claudecodegui.handler.provider.ModelProviderHandler.getModelContextLimit("grok-2");
        assertTrue(limit > 0);
        assertEquals(128000, limit);
    }

    @Test
    public void testGrokModelsHaveExpectedContextLimits() {
        assertEquals(500000, com.github.claudecodegui.handler.provider.ModelProviderHandler.getModelContextLimit("grok"));
        assertEquals(128000, com.github.claudecodegui.handler.provider.ModelProviderHandler.getModelContextLimit("grok-2"));
        assertEquals(500000, com.github.claudecodegui.handler.provider.ModelProviderHandler.getModelContextLimit("grok-4.6"));
        assertEquals(500000, com.github.claudecodegui.handler.provider.ModelProviderHandler.getModelContextLimit("grok-build"));
    }
}
