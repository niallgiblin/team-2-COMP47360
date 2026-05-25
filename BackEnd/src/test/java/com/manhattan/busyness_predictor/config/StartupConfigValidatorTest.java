package com.manhattan.busyness_predictor.config;

import java.lang.reflect.Field;

import org.junit.jupiter.api.Test;
import org.springframework.boot.ApplicationArguments;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class StartupConfigValidatorTest {

    private StartupConfigValidator buildValidator(
            String jwt, String dsUrl, String dsUser, String dsPass) throws Exception {
        StartupConfigValidator v = new StartupConfigValidator();
        setField(v, "jwtSecret", jwt);
        setField(v, "datasourceUrl", dsUrl);
        setField(v, "datasourceUsername", dsUser);
        setField(v, "datasourcePassword", dsPass);
        return v;
    }

    private void setField(Object target, String name, String value) throws Exception {
        Field f = target.getClass().getDeclaredField(name);
        f.setAccessible(true);
        f.set(target, value);
    }

    @Test
    void run_allVarsPresent_passes() throws Exception {
        StartupConfigValidator v = buildValidator(
            "real-jwt-secret-value", "jdbc:mysql://db:3306/x", "user", "pass");
        assertDoesNotThrow(() -> v.run(mock(ApplicationArguments.class)));
    }

    @Test
    void run_blankJwtSecret_throwsIllegalStateException_namingJwt() throws Exception {
        StartupConfigValidator v = buildValidator("", "jdbc:mysql://db:3306/x", "user", "pass");
        IllegalStateException ex = assertThrows(IllegalStateException.class,
            () -> v.run(mock(ApplicationArguments.class)));
        assertTrue(ex.getMessage().contains("APP_JWT_SECRET"),
            "message must name the missing var: " + ex.getMessage());
    }

    @Test
    void run_allBlank_messageContainsAllFourNames() throws Exception {
        StartupConfigValidator v = buildValidator("", "", "", "");
        IllegalStateException ex = assertThrows(IllegalStateException.class,
            () -> v.run(mock(ApplicationArguments.class)));
        String msg = ex.getMessage();
        assertTrue(msg.contains("APP_JWT_SECRET"));
        assertTrue(msg.contains("SPRING_DATASOURCE_URL"));
        assertTrue(msg.contains("SPRING_DATASOURCE_USERNAME"));
        assertTrue(msg.contains("SPRING_DATASOURCE_PASSWORD"));
    }

    @Test
    void run_messageNeverContainsSecretValues() throws Exception {
        String sentinel = "hunter2-must-not-leak";
        StartupConfigValidator v = buildValidator(sentinel, "", "user", "pass");
        IllegalStateException ex = assertThrows(IllegalStateException.class,
            () -> v.run(mock(ApplicationArguments.class)));
        assertFalse(ex.getMessage().contains(sentinel),
            "D-14: secret values must never appear in error messages: " + ex.getMessage());
    }
}
