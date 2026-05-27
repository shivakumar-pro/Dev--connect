package com.devconnect.controller;

import com.devconnect.dto.response.ApiResponse;
import com.devconnect.dto.response.UserResponse;
import com.devconnect.service.BlockService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Block Controller — block/unblock users by username.
 *
 * When a user is blocked:
 *   - Neither user can send messages to the other (enforced in MessageService)
 *   - Neither user can send chat requests to the other
 *   - Block is directional but message restriction is bidirectional
 *
 * Endpoints:
 *   POST   /api/users/block/{username}       — block a user
 *   DELETE /api/users/block/{username}       — unblock a user
 *   GET    /api/users/block                  — list all users you've blocked
 *   GET    /api/users/block/check/{username} — check block status (iBlocked + blockedMe)
 */
@Slf4j
@RestController
@RequestMapping("/api/users/block")
@RequiredArgsConstructor
public class BlockController {

    private final BlockService blockService;

    /** Block a user. Prevents messaging in both directions. */
    @PostMapping("/{username}")
    public ResponseEntity<ApiResponse<Void>> blockUser(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable String username) {
        blockService.blockUser(currentUsername, username);
        return ResponseEntity.ok(ApiResponse.success("User blocked", null));
    }

    /** Unblock a previously blocked user. */
    @DeleteMapping("/{username}")
    public ResponseEntity<ApiResponse<Void>> unblockUser(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable String username) {
        blockService.unblockUser(currentUsername, username);
        return ResponseEntity.ok(ApiResponse.success("User unblocked", null));
    }

    /** List all users the current user has blocked. */
    @GetMapping
    public ResponseEntity<ApiResponse<List<UserResponse>>> getBlockedUsers(
            @AuthenticationPrincipal String currentUsername) {
        return ResponseEntity.ok(ApiResponse.success(
                "Blocked users",
                blockService.getBlockedUsers(currentUsername)
        ));
    }

    /** Check if I blocked them (iBlocked) and if they blocked me (blockedMe). Use to determine UI state. */
    @GetMapping("/check/{username}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> checkBlockStatus(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable String username) {
        boolean iBlocked = blockService.didIBlock(currentUsername, username);
        boolean blockedMe = blockService.hasBlockedMe(currentUsername, username);
        return ResponseEntity.ok(ApiResponse.success("Block status", Map.of(
                "iBlocked", iBlocked,
                "blockedMe", blockedMe
        )));
    }
}
