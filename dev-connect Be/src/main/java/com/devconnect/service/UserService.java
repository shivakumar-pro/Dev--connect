package com.devconnect.service;

import com.devconnect.dto.request.UpdateProfileRequest;
import com.devconnect.dto.response.UserResponse;
import com.devconnect.exception.ResourceNotFoundException;
import com.devconnect.exception.ValidationException;
import com.devconnect.model.Message;
import com.devconnect.model.User;
import com.devconnect.repository.MessageRepository;
import com.devconnect.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * User Service — handles profile CRUD, avatar catalog, search, and availability checks.
 *
 * Key features:
 *   - 20 predefined emoji avatars (no file upload — user picks a key like "avatar_ninja")
 *   - Profile update with uniqueness validation for username/email
 *   - Search users, get recent chat partners
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final MessageRepository messageRepository;

    // Predefined avatar catalog — lightweight keys the frontend maps to emojis/icons
    private static final List<Map<String, String>> AVATAR_CATALOG = List.of(
            Map.of("key", "avatar_default", "emoji", "\uD83D\uDE42", "label", "Smile"),
            Map.of("key", "avatar_cool", "emoji", "\uD83D\uDE0E", "label", "Cool"),
            Map.of("key", "avatar_nerd", "emoji", "\uD83E\uDD13", "label", "Nerd"),
            Map.of("key", "avatar_ninja", "emoji", "\uD83E\uDD77", "label", "Ninja"),
            Map.of("key", "avatar_robot", "emoji", "\uD83E\uDD16", "label", "Robot"),
            Map.of("key", "avatar_alien", "emoji", "\uD83D\uDC7D", "label", "Alien"),
            Map.of("key", "avatar_ghost", "emoji", "\uD83D\uDC7B", "label", "Ghost"),
            Map.of("key", "avatar_fire", "emoji", "\uD83D\uDD25", "label", "Fire"),
            Map.of("key", "avatar_star", "emoji", "\u2B50", "label", "Star"),
            Map.of("key", "avatar_heart", "emoji", "\u2764\uFE0F", "label", "Heart"),
            Map.of("key", "avatar_thunder", "emoji", "\u26A1", "label", "Thunder"),
            Map.of("key", "avatar_crown", "emoji", "\uD83D\uDC51", "label", "Crown"),
            Map.of("key", "avatar_unicorn", "emoji", "\uD83E\uDD84", "label", "Unicorn"),
            Map.of("key", "avatar_cat", "emoji", "\uD83D\uDC31", "label", "Cat"),
            Map.of("key", "avatar_dog", "emoji", "\uD83D\uDC36", "label", "Dog"),
            Map.of("key", "avatar_panda", "emoji", "\uD83D\uDC3C", "label", "Panda"),
            Map.of("key", "avatar_fox", "emoji", "\uD83E\uDD8A", "label", "Fox"),
            Map.of("key", "avatar_lion", "emoji", "\uD83E\uDD81", "label", "Lion"),
            Map.of("key", "avatar_astronaut", "emoji", "\uD83D\uDE80", "label", "Rocket"),
            Map.of("key", "avatar_wizard", "emoji", "\uD83E\uDDD9", "label", "Wizard")
    );

    private static final Set<String> VALID_AVATAR_KEYS = AVATAR_CATALOG.stream()
            .map(a -> a.get("key"))
            .collect(Collectors.toSet());

    public List<Map<String, String>> getAvatarCatalog() {
        return AVATAR_CATALOG;
    }

    // ==================== EXISTING METHODS ====================

    public UserResponse getCurrentUser(Long currentUserId) {
        User user = userRepository.findById(currentUserId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        return mapToUserResponse(user);
    }

    public UserResponse getCurrentUserByUsername(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        return mapToUserResponse(user);
    }

    public List<UserResponse> searchUsersExcludingCurrent(String currentUsername, String searchQuery) {
        List<User> matchingUsers;

        if (searchQuery != null && !searchQuery.trim().isEmpty()) {
            matchingUsers = userRepository.findAll().stream()
                    .filter(u -> !u.getUsername().equals(currentUsername))
                    .filter(u -> u.getUsername().toLowerCase().contains(searchQuery.toLowerCase()))
                    .collect(Collectors.toList());
        } else {
            matchingUsers = userRepository.findAll().stream()
                    .filter(u -> !u.getUsername().equals(currentUsername))
                    .collect(Collectors.toList());
        }

        return matchingUsers.stream().map(this::mapToUserResponse).collect(Collectors.toList());
    }

    public List<UserResponse> getRecentChatUsers(String currentUsername) {
        User currentUser = userRepository.findByUsername(currentUsername)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        Long currentUserId = currentUser.getId();
        String userIdStr = String.valueOf(currentUserId);
        List<Message> msgs = messageRepository.findPrivateMessagesByUserId(userIdStr);

        Set<Long> otherUserIds = msgs.stream()
                .map(m -> {
                    String[] ids = m.getRoomId().split("-");
                    return Long.parseLong(ids[0]) == currentUserId ? Long.parseLong(ids[1]) : Long.parseLong(ids[0]);
                })
                .collect(Collectors.toSet());

        return userRepository.findAllById(otherUserIds).stream()
                .map(this::mapToUserResponse)
                .collect(Collectors.toList());
    }

    // ==================== PROFILE UPDATE ====================

    /**
     * Update user profile. All fields are optional — only provided fields are updated.
     * Validates username/email uniqueness and avatar key validity.
     */
    public UserResponse updateProfile(String currentUsername, UpdateProfileRequest request) {
        log.info("Profile update requested by '{}'", currentUsername);
        User user = userRepository.findByUsername(currentUsername)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        if (request.getUsername() != null && !request.getUsername().equals(user.getUsername())) {
            if (userRepository.existsByUsername(request.getUsername())) {
                throw new ValidationException("Username already taken");
            }
            user.setUsername(request.getUsername());
        }

        if (request.getEmail() != null && !request.getEmail().equals(user.getEmail())) {
            if (userRepository.existsByEmail(request.getEmail())) {
                throw new ValidationException("Email already taken");
            }
            user.setEmail(request.getEmail());
        }

        if (request.getProfileAvatar() != null) {
            if (!VALID_AVATAR_KEYS.contains(request.getProfileAvatar())) {
                throw new ValidationException("Invalid avatar. Use GET /api/users/avatars to see available options.");
            }
            user.setProfileAvatar(request.getProfileAvatar());
        }

        user = userRepository.save(user);
        log.info("Profile updated for '{}'", user.getUsername());
        return mapToUserResponse(user);
    }

    // ==================== AVAILABILITY CHECKS ====================

    public boolean isUsernameTaken(String username) {
        return userRepository.existsByUsername(username);
    }

    public boolean isEmailTaken(String email) {
        return userRepository.existsByEmail(email);
    }

    // ==================== MAPPER ====================

    private UserResponse mapToUserResponse(User user) {
        return UserResponse.builder()
                .id(user.getId())
                .username(user.getUsername())
                .email(user.getEmail())
                .profileAvatar(user.getProfileAvatar())
                .status(user.getStatus().name())
                .lastSeen(user.getLastSeen())
                .build();
    }
}
