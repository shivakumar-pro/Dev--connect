package com.devconnect.controller;

import com.devconnect.dto.request.SendMessageRequest;
import com.devconnect.dto.response.MessageResponse;
import com.devconnect.service.MessageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Controller;

import java.security.Principal;

/**
 * WebSocket (STOMP) Controller for real-time chat messaging.
 *
 * This is the PRIMARY way messages are sent (not REST).
 * The frontend connects to /ws via SockJS+STOMP, authenticates with JWT in CONNECT headers,
 * then sends messages to these destinations:
 *
 * Send destinations (client -> server):
 *   /app/global                — send a global message (everyone sees it)
 *   /app/private/{recipientId} — send a private message to a specific user
 *   /app/group/{groupId}       — send a message to a group
 *
 * Subscribe destinations (server -> client):
 *   /topic/global              — receive global messages
 *   /topic/user/{userId}       — receive private messages + notifications
 *   /topic/group/{groupId}     — receive group messages
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class ChatWebSocketController {

    private final MessageService messageService;

    /** Send a message to the global chat room. Everyone subscribed to /topic/global receives it. */
    @MessageMapping("/global")
    public void sendGlobalMessage(@Payload SendMessageRequest message, Principal principal) {
        String username = getUsername(principal);
        messageService.saveAndBroadcastGlobalMessage(username, message);
    }

    /** Send a private message to a specific user by their ID. Requires accepted ChatRequest. */
    @MessageMapping("/private/{recipientId}")
    public void sendPrivateMessage(
            @DestinationVariable Long recipientId,
            @Payload SendMessageRequest message,
            Principal principal) {
        String username = getUsername(principal);
        messageService.saveAndBroadcastPrivateMessage(username, recipientId, message);
    }

    /** Send a message to a group chat. Broadcast to /topic/group/{groupId}. */
    @MessageMapping("/group/{groupId}")
    public void sendGroupMessage(
            @DestinationVariable Long groupId,
            @Payload SendMessageRequest message,
            Principal principal) {
        String username = getUsername(principal);
        messageService.saveAndBroadcastGroupMessage(username, groupId, message);
    }

    private String getUsername(Principal principal) {
        if (principal instanceof UsernamePasswordAuthenticationToken auth) {
            return (String) auth.getPrincipal();
        }
        throw new IllegalStateException("Invalid user principal");
    }
}
