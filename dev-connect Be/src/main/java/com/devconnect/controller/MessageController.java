package com.devconnect.controller;

import com.devconnect.dto.request.SendMessageRequest;
import com.devconnect.dto.response.ApiResponse;
import com.devconnect.dto.response.MessageResponse;
import com.devconnect.service.MessageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Message Controller — REST endpoints for chat messages.
 *
 * Messages are primarily sent via WebSocket (see ChatWebSocketController),
 * but these REST endpoints handle fetching history, read status, and deletion.
 *
 * Endpoints:
 *   GET    /api/messages/all                  — all messages the user can see
 *   GET    /api/messages/global               — global chat messages
 *   GET    /api/messages/private/{userId}     — private chat with specific user
 *   GET    /api/messages/group/{groupId}      — group chat messages
 *   POST   /api/messages/send                 — REST fallback to send a message
 *   POST   /api/messages/mark-read/{roomId}   — mark a chat as read (clears unread badge)
 *   GET    /api/messages/unread-counts        — unread count per room (for badges)
 *   GET    /api/messages/unread-count/{roomId} — unread count for one room
 *   DELETE /api/messages/clear/{roomId}       — clear chat for me
 *   DELETE /api/messages/clear/{roomId}/everyone — clear chat for everyone
 *   DELETE /api/messages/{messageId}          — delete single message for everyone
 *   DELETE /api/messages/{messageId}/for-me   — delete single message for me only
 */
@Slf4j
@RestController
@RequestMapping("/api/messages")
@RequiredArgsConstructor
public class MessageController {

    private final MessageService messageService;

    /** Get all messages across global, private, and group chats for the current user. */
    @GetMapping("/all")
    public ResponseEntity<ApiResponse<List<MessageResponse>>> getAllMessages(
            @AuthenticationPrincipal String currentUsername,
            @RequestParam(defaultValue = "100") int limit) {
        return ResponseEntity.ok(ApiResponse.success(
                "All messages fetched",
                messageService.getAllUserMessages(currentUsername, limit)
        ));
    }

    /** Get global chat messages. Everyone can see these. */
    @GetMapping("/global")
    public ResponseEntity<ApiResponse<List<MessageResponse>>> getGlobalMessages(
            @AuthenticationPrincipal String currentUsername,
            @RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(ApiResponse.success(
                "Global messages fetched",
                messageService.getMessages("global", currentUsername, limit)
        ));
    }

    /** Get private chat messages between current user and another user by their ID. */
    @GetMapping("/private/{userId}")
    public ResponseEntity<ApiResponse<List<MessageResponse>>> getPrivateMessages(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable Long userId,
            @RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(ApiResponse.success(
                "Private messages fetched",
                messageService.getPrivateMessages(currentUsername, userId, limit)
        ));
    }

    /** Get group chat messages by group ID. */
    @GetMapping("/group/{groupId}")
    public ResponseEntity<ApiResponse<List<MessageResponse>>> getGroupMessages(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable Long groupId,
            @RequestParam(defaultValue = "50") int limit) {
        String roomId = "group-" + groupId;
        return ResponseEntity.ok(ApiResponse.success(
                "Group messages fetched",
                messageService.getMessages(roomId, currentUsername, limit)
        ));
    }

    /** REST fallback for sending messages. Prefer WebSocket for real-time. Routes to global/private/group based on roomType. */
    @PostMapping("/send")
    public ResponseEntity<ApiResponse<MessageResponse>> sendFallbackMessage(
            @AuthenticationPrincipal String currentUsername,
            @RequestBody SendMessageRequest request) {
        MessageResponse response;
        if ("GLOBAL".equalsIgnoreCase(request.getRoomType())) {
            response = messageService.saveAndBroadcastGlobalMessage(currentUsername, request);
        } else if ("GROUP".equalsIgnoreCase(request.getRoomType())) {
            Long groupId = Long.parseLong(request.getRoomId().replace("group-", ""));
            response = messageService.saveAndBroadcastGroupMessage(currentUsername, groupId, request);
        } else {
            response = messageService.saveAndBroadcastPrivateMessage(currentUsername, request);
        }
        return ResponseEntity.ok(ApiResponse.success("Message sent", response));
    }

    // ==================== READ STATUS / UNREAD ====================

    /** Mark a chat as read. Call when user opens a chat to clear the unread badge. */
    @PostMapping("/mark-read/{roomId}")
    public ResponseEntity<ApiResponse<Void>> markAsRead(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable String roomId) {
        messageService.markAsRead(currentUsername, roomId);
        return ResponseEntity.ok(ApiResponse.success("Marked as read", null));
    }

    /** Get unread message counts for ALL rooms. Call on login to populate sidebar badges. */
    @GetMapping("/unread-counts")
    public ResponseEntity<ApiResponse<Map<String, Long>>> getUnreadCounts(
            @AuthenticationPrincipal String currentUsername) {
        return ResponseEntity.ok(ApiResponse.success(
                "Unread counts",
                messageService.getUnreadCounts(currentUsername)
        ));
    }

    /** Get unread count for a single room. */
    @GetMapping("/unread-count/{roomId}")
    public ResponseEntity<ApiResponse<Map<String, Long>>> getUnreadCount(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable String roomId) {
        long count = messageService.getUnreadCount(currentUsername, roomId);
        return ResponseEntity.ok(ApiResponse.success("Unread count", Map.of("count", count)));
    }

    // ==================== CLEAR CHAT / DELETE MESSAGE ====================

    /** Clear all messages in a room FOR ME ONLY. Other user still sees them. Hides messages before now. */
    @DeleteMapping("/clear/{roomId}")
    public ResponseEntity<ApiResponse<Void>> clearChatForMe(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable String roomId) {
        messageService.clearChatForMe(currentUsername, roomId);
        return ResponseEntity.ok(ApiResponse.success("Chat cleared for you", null));
    }

    /** Permanently delete ALL messages in a room for BOTH sides. Broadcasts CHAT_CLEARED via WebSocket. */
    @DeleteMapping("/clear/{roomId}/everyone")
    public ResponseEntity<ApiResponse<Void>> clearChatForEveryone(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable String roomId) {
        messageService.clearChatForEveryone(currentUsername, roomId);
        return ResponseEntity.ok(ApiResponse.success("Chat cleared for everyone", null));
    }

    /** Delete a single message for EVERYONE. Only the sender can do this. Shows "This message was deleted". Broadcasts MESSAGE_DELETED via WebSocket. */
    @DeleteMapping("/{messageId}")
    public ResponseEntity<ApiResponse<Void>> deleteMessageForEveryone(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable Long messageId) {
        messageService.deleteMessageForEveryone(currentUsername, messageId);
        return ResponseEntity.ok(ApiResponse.success("Message deleted for everyone", null));
    }

    /** Delete a single message FOR ME ONLY. Other user still sees it. Stored in user_deleted_messages table. */
    @DeleteMapping("/{messageId}/for-me")
    public ResponseEntity<ApiResponse<Void>> deleteMessageForMe(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable Long messageId) {
        messageService.deleteMessageForMe(currentUsername, messageId);
        return ResponseEntity.ok(ApiResponse.success("Message deleted for you", null));
    }
}
