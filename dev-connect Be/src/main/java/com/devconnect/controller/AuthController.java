package com.devconnect.controller;

import com.devconnect.dto.request.LoginRequest;
import com.devconnect.dto.request.RegisterRequest;
import com.devconnect.dto.response.ApiResponse;
import com.devconnect.dto.response.AuthResponse;
import com.devconnect.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * REST controller for authentication operations.
 *
 * <p>Handles user registration, login, and logout.
 * All endpoints are publicly accessible (no JWT required).</p>
 *
 * <h3>Endpoints:</h3>
 * <ul>
 *   <li>{@code POST /api/auth/register} — Register a new user account</li>
 *   <li>{@code POST /api/auth/login} — Login with email + password, returns JWT token</li>
 *   <li>{@code POST /api/auth/logout} — Logout (stateless — frontend removes token)</li>
 * </ul>
 *
 * <h3>How authentication works:</h3>
 * <ol>
 *   <li>Client calls {@code /register} or {@code /login}</li>
 *   <li>Server returns a JWT access token in the response body</li>
 *   <li>Client stores the token and sends it in the {@code Authorization: Bearer <token>} header for all subsequent requests</li>
 *   <li>For WebSocket (STOMP), the token is sent in the STOMP CONNECT headers</li>
 * </ol>
 */
@Slf4j
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class AuthController {

    private final AuthService authService;

    /**
     * Register a new user account.
     *
     * @param request contains username, email, and password
     * @return JWT token + user details on success
     */
    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse>> register(
            @Valid @RequestBody RegisterRequest request) {
        log.info("Registration attempt for username='{}', email='{}'", request.getUsername(), request.getEmail());

        AuthResponse response = authService.register(request);

        log.info("Registration successful for username='{}', userId={}", request.getUsername(), response.getUserId());
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.success("User registered successfully", response));
    }

    /**
     * Login with existing credentials.
     *
     * @param request contains email and password
     * @return JWT token + user details on success
     */
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(
            @Valid @RequestBody LoginRequest request) {
        log.info("Login attempt for email='{}'", request.getEmail());

        AuthResponse response = authService.login(request);

        log.info("Login successful for username='{}', userId={}", response.getUsername(), response.getUserId());
        return ResponseEntity.ok(ApiResponse.success("Login successful", response));
    }

    /**
     * Logout the current user.
     *
     * <p>Since we use stateless JWT, logout is handled on the frontend
     * by removing the stored token. This endpoint exists for API completeness.</p>
     */
    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout() {
        log.info("Logout endpoint called");
        return ResponseEntity.ok(ApiResponse.success("Logged out successfully", null));
    }
}
