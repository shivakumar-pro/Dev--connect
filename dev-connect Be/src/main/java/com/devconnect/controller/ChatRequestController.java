package com.devconnect.controller;

import com.devconnect.dto.response.ApiResponse;
import com.devconnect.model.ChatRequest;
import com.devconnect.service.ChatRequestService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Chat Request Controller — Instagram-style DM request system.
 *
 * Before two users can exchange private messages, a chat request must be sent and accepted.
 * This prevents unwanted messages from strangers.
 *
 * Flow:
 *   1. User A sends request:  POST /api/chat-requests/send/bob
 *   2. User B sees it:        GET  /api/chat-requests/pending
 *   3. User B accepts:        POST /api/chat-requests/{id}/accept
 *   4. Now both can message freely via WebSocket
 *
 * Status values returned by GET /api/chat-requests/status/{username}:
 *   NONE            — no request exists, show "Send Request" button
 *   PENDING_SENT    — you sent, waiting for their response
 *   PENDING_RECEIVED — they sent to you, show "Accept/Reject" buttons
 *   ACCEPTED        — chat is open, show normal chat input
 *   REJECTED        — was rejected, can re-send
 *   BLOCKED         — one of you blocked the other
 *
 * WebSocket events:
 *   CHAT_REQUEST_RECEIVED — sent to receiver in real-time when a request arrives
 *   CHAT_REQUEST_ACCEPTED — sent to sender when their request is accepted
 */
@Slf4j
@RestController
@RequestMapping("/api/chat-requests")
@RequiredArgsConstructor
public class ChatRequestController {

    private final ChatRequestService chatRequestService;

    @PostMapping("/send/{receiverUsername}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> sendRequest(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable String receiverUsername,
            @RequestBody(required = false) Map<String, String> body) {
        String firstMessage = body != null ? body.get("message") : null;
        ChatRequest cr = chatRequestService.sendChatRequest(currentUsername, receiverUsername, firstMessage);
        return ResponseEntity.ok(ApiResponse.success("Chat request sent", Map.of(
                "requestId", cr.getId(),
                "status", cr.getStatus().name()
        )));
    }

    @PostMapping("/{requestId}/accept")
    public ResponseEntity<ApiResponse<Void>> acceptRequest(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable Long requestId) {
        chatRequestService.acceptRequest(currentUsername, requestId);
        return ResponseEntity.ok(ApiResponse.success("Chat request accepted", null));
    }

    @PostMapping("/{requestId}/reject")
    public ResponseEntity<ApiResponse<Void>> rejectRequest(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable Long requestId) {
        chatRequestService.rejectRequest(currentUsername, requestId);
        return ResponseEntity.ok(ApiResponse.success("Chat request rejected", null));
    }

    @GetMapping("/pending")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getPendingRequests(
            @AuthenticationPrincipal String currentUsername) {
        List<Map<String, Object>> requests = chatRequestService.getPendingRequests(currentUsername)
                .stream()
                .map(this::mapRequest)
                .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success("Pending chat requests", requests));
    }

    @GetMapping("/sent")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getSentRequests(
            @AuthenticationPrincipal String currentUsername) {
        List<Map<String, Object>> requests = chatRequestService.getSentRequests(currentUsername)
                .stream()
                .map(this::mapRequest)
                .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success("Sent chat requests", requests));
    }

    @GetMapping("/status/{username}")
    public ResponseEntity<ApiResponse<Map<String, String>>> getChatStatus(
            @AuthenticationPrincipal String currentUsername,
            @PathVariable String username) {
        String status = chatRequestService.getChatStatus(currentUsername, username);
        return ResponseEntity.ok(ApiResponse.success("Chat status", Map.of("status", status)));
    }

    private Map<String, Object> mapRequest(ChatRequest cr) {
        return Map.of(
                "requestId", cr.getId(),
                "senderUsername", cr.getSender().getUsername(),
                "senderAvatar", cr.getSender().getProfileAvatar() != null ? cr.getSender().getProfileAvatar() : "avatar_default",
                "receiverUsername", cr.getReceiver().getUsername(),
                "firstMessage", cr.getFirstMessage() != null ? cr.getFirstMessage() : "",
                "status", cr.getStatus().name(),
                "createdAt", cr.getCreatedAt().toString()
        );
    }
}
