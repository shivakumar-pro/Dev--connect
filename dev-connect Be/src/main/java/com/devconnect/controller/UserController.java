package com.devconnect.controller;

import com.devconnect.dto.request.UpdateProfileRequest;
import com.devconnect.dto.response.ApiResponse;
import com.devconnect.dto.response.UserResponse;
import com.devconnect.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * User Controller — profile management, search, and availability checks.
 *
 * Endpoints (auth required unless noted):
 *   GET    /api/users/me             — get current user's profile
 *   PUT    /api/users/me             — update profile (username, email, avatar)
 *   GET    /api/users/avatars        — list available avatar emojis (PUBLIC)
 *   GET    /api/users/check-username — check if username is taken (PUBLIC)
 *   GET    /api/users/check-email    — check if email is taken (PUBLIC)
 *   GET    /api/users                — search users by username
 *   GET    /api/users/recent-chats   — users you've chatted with
 *   GET    /api/users/{userId}       — get user by ID
 */
@Slf4j
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class UserController {

    private final UserService userService;

    /** Get the currently authenticated user's profile. */
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserResponse>> getCurrentUser(
            @AuthenticationPrincipal String currentUsername) {
        return ResponseEntity.ok(ApiResponse.success(
                "Current user fetched",
                userService.getCurrentUserByUsername(currentUsername)
        ));
    }

    /** Update profile — any field is optional (username, email, profileAvatar). */
    @PutMapping("/me")
    public ResponseEntity<ApiResponse<UserResponse>> updateProfile(
            @AuthenticationPrincipal String currentUsername,
            @Valid @RequestBody UpdateProfileRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                "Profile updated",
                userService.updateProfile(currentUsername, request)
        ));
    }

    /** List all 20 predefined emoji avatars. Users pick one — no file upload needed. */
    @GetMapping("/avatars")
    public ResponseEntity<ApiResponse<List<Map<String, String>>>> getAvatars() {
        return ResponseEntity.ok(ApiResponse.success(
                "Available avatars",
                userService.getAvatarCatalog()
        ));
    }

    /** Check if a username is already taken. Used during registration for real-time validation. */
    @GetMapping("/check-username")
    public ResponseEntity<ApiResponse<Map<String, Boolean>>> checkUsername(
            @RequestParam String username) {
        boolean taken = userService.isUsernameTaken(username);
        return ResponseEntity.ok(ApiResponse.success(
                taken ? "Username is taken" : "Username is available",
                Map.of("taken", taken)
        ));
    }

    /** Check if an email is already taken. Used during registration for real-time validation. */
    @GetMapping("/check-email")
    public ResponseEntity<ApiResponse<Map<String, Boolean>>> checkEmail(
            @RequestParam String email) {
        boolean taken = userService.isEmailTaken(email);
        return ResponseEntity.ok(ApiResponse.success(
                taken ? "Email is taken" : "Email is available",
                Map.of("taken", taken)
        ));
    }

    /** Search users by username. Excludes the current user from results. Optional ?search= query param. */
    @GetMapping
    public ResponseEntity<ApiResponse<List<UserResponse>>> searchUsers(
            @AuthenticationPrincipal String currentUsername,
            @RequestParam(required = false) String search) {
        return ResponseEntity.ok(ApiResponse.success(
                "Users fetched",
                userService.searchUsersExcludingCurrent(currentUsername, search)
        ));
    }

    /** Get users the current user has had private conversations with. */
    @GetMapping("/recent-chats")
    public ResponseEntity<ApiResponse<List<UserResponse>>> getRecentChats(
            @AuthenticationPrincipal String currentUsername) {
        return ResponseEntity.ok(ApiResponse.success(
                "Recent chat connections fetched",
                userService.getRecentChatUsers(currentUsername)
        ));
    }

    /** Get any user's public profile by their numeric ID. */
    @GetMapping("/{userId:\\d+}")
    public ResponseEntity<ApiResponse<UserResponse>> getUserById(
            @PathVariable Long userId) {
        return ResponseEntity.ok(ApiResponse.success(
                "User fetched",
                userService.getCurrentUser(userId)
        ));
    }
}
