package com.rotasync.api.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;

/**
 * Local-development JWT decoder (APP_SECURITY_MODE=dev only): accepts HS256
 * tokens signed with a shared secret so the API can be exercised without a
 * Firebase project. Overrides the auto-configured Firebase issuer decoder.
 *
 * Mint a token for testing, e.g. with jwt.io or:
 *   header  {"alg":"HS256","typ":"JWT"}
 *   payload {"sub":"dev-uid-1","email":"dev@example.com","exp":9999999999}
 *
 * NEVER enable in production; the default mode is "firebase".
 */
@Configuration
@ConditionalOnProperty(name = "app.security.mode", havingValue = "dev")
public class DevJwtConfig {

    @Bean
    public JwtDecoder jwtDecoder(@Value("${app.security.dev-secret}") String secret) {
        SecretKeySpec key = new SecretKeySpec(
                secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        return NimbusJwtDecoder.withSecretKey(key).build();
    }
}
