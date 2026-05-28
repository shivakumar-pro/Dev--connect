package com.devconnect.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@Configuration
public class CorsConfig {

    /**
     * Always-allowed origins for local development and the Capacitor mobile shell,
     * merged with whatever {@code cors.allowed-origin-patterns} (FRONTEND_URL) provides.
     * Using patterns (with a wildcard port) so any Vite dev port works.
     */
    private static final List<String> DEV_ORIGIN_PATTERNS = List.of(
            "http://localhost:*", "https://localhost:*",
            "http://127.0.0.1:*", "https://127.0.0.1:*",
            "capacitor://localhost", "ionic://localhost"
    );

    @Value("${cors.allowed-origin-patterns:*}")
    private String allowedOriginPatterns;

    @Value("${cors.allowed-methods:GET,POST,PUT,DELETE,OPTIONS,PATCH}")
    private String allowedMethods;

    @Value("${cors.allowed-headers:*}")
    private String allowedHeaders;

    @Value("${cors.allow-credentials:true}")
    private boolean allowCredentials;

    @Value("${cors.max-age:3600}")
    private long maxAge;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        List<String> patterns = new ArrayList<>(split(allowedOriginPatterns));
        for (String dev : DEV_ORIGIN_PATTERNS) {
            if (!patterns.contains(dev)) patterns.add(dev);
        }
        configuration.setAllowedOriginPatterns(patterns);
        configuration.setAllowedMethods(split(allowedMethods));
        configuration.setAllowedHeaders(split(allowedHeaders));
        configuration.setAllowCredentials(allowCredentials);
        configuration.setMaxAge(maxAge);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    private List<String> split(String csv) {
        return Arrays.stream(csv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }
}
