package com.devconnect.service;

import com.devconnect.dto.request.LoginRequest;
import com.devconnect.dto.request.RegisterRequest;
import com.devconnect.dto.response.AuthResponse;
import com.devconnect.exception.ValidationException;
import com.devconnect.model.User;
import com.devconnect.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * Authentication Service — core logic for user registration and login.
 *
 * Responsibilities:
 *   - Validate uniqueness of username and email during registration
 *   - Hash passwords with BCrypt before storing
 *   - Verify credentials during login
 *   - Generate JWT tokens via JwtService
 *   - Set user online status on login
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    /**
     * Register a new user account.
     * Checks username/email uniqueness, hashes password, saves to DB, returns JWT.
     */
    public AuthResponse register(RegisterRequest request) {
        // Check if username exists
        if (userRepository.existsByUsername(request.getUsername())) {
            log.warn("Registration failed: username '{}' already exists", request.getUsername());
            throw new ValidationException("Username already exists");
        }

        // Check if email exists
        if (userRepository.existsByEmail(request.getEmail())) {
            log.warn("Registration failed: email '{}' already exists", request.getEmail());
            throw new ValidationException("Email already exists");
        }

        // Create user
        User user = new User();
        user.setUsername(request.getUsername());
        user.setEmail(request.getEmail());
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setStatus(User.UserStatus.OFFLINE);
        
        user = userRepository.save(user);
        log.info("New user created: id={}, username='{}'", user.getId(), user.getUsername());

        // Generate token
        String token = jwtService.generateToken(user.getId(), user.getUsername());

        return new AuthResponse(
            token,
            "Bearer",
            86400L,
            user.getId(),
            user.getUsername(),
            user.getEmail(),
            user.getProfileAvatar(),
            user.getStatus().toString()
        );
    }

    /**
     * Login with email + password.
     * Validates credentials, sets user status to ONLINE, returns JWT.
     */
    public AuthResponse login(LoginRequest request) {
        // Find user by email
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> {
                    log.warn("Login failed: no user with email '{}'", request.getEmail());
                    return new ValidationException("Invalid credentials");
                });

        // Verify password
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            log.warn("Login failed: wrong password for email '{}'", request.getEmail());
            throw new ValidationException("Invalid credentials");
        }
        
        // Mark user as online
        user.setStatus(User.UserStatus.ONLINE);
        userRepository.save(user);
        log.info("User logged in: id={}, username='{}'", user.getId(), user.getUsername());
        
        // Generate token
        String token = jwtService.generateToken(user.getId(), user.getUsername());
        
        return new AuthResponse(
            token,
            "Bearer",
            86400L,
            user.getId(),
            user.getUsername(),
            user.getEmail(),
            user.getProfileAvatar(),
            user.getStatus().toString()
        );
    }
}
