package com.devconnect.phase10.controller;

import com.devconnect.phase10.dto.Phase10ActionRequest;
import com.devconnect.phase10.service.Phase10Service;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Controller;

import java.security.Principal;

/**
 * WebSocket (STOMP) controller for Phase 10 gameplay.
 *
 * Client subscribes to:
 *   /topic/phase10/{roomId}  — public room events (state, draws, lays, hits, results)
 *   /user/queue/phase10      — private events (your hand, errors)
 *
 * Client sends to /app/phase10/*:
 *   join/{roomId}, leave/{roomId}, start/{roomId}, add-bot/{roomId}, rematch/{roomId},
 *   remove-bot, draw, lay, hit, discard, chat   (payload = Phase10ActionRequest)
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class Phase10WebSocketController {

    private final Phase10Service service;

    @MessageMapping("/phase10/join/{roomId}")
    public void join(@DestinationVariable String roomId, Principal principal) {
        service.joinRoom(roomId, username(principal));
    }

    @MessageMapping("/phase10/leave/{roomId}")
    public void leave(@DestinationVariable String roomId, Principal principal) {
        service.leaveRoom(roomId, username(principal));
    }

    @MessageMapping("/phase10/start/{roomId}")
    public void start(@DestinationVariable String roomId, Principal principal) {
        service.startGame(roomId, username(principal));
    }

    @MessageMapping("/phase10/add-bot/{roomId}")
    public void addBot(@DestinationVariable String roomId, Principal principal) {
        service.addBot(roomId, username(principal));
    }

    @MessageMapping("/phase10/remove-bot")
    public void removeBot(@Payload Phase10ActionRequest req, Principal principal) {
        service.removeBot(req.getRoomId(), username(principal), req.getBotName());
    }

    @MessageMapping("/phase10/rematch/{roomId}")
    public void rematch(@DestinationVariable String roomId, Principal principal) {
        service.requestRematch(roomId, username(principal));
    }

    @MessageMapping("/phase10/draw")
    public void draw(@Payload Phase10ActionRequest req, Principal principal) {
        service.draw(req.getRoomId(), username(principal), Boolean.TRUE.equals(req.getFromDiscard()));
    }

    @MessageMapping("/phase10/lay")
    public void lay(@Payload Phase10ActionRequest req, Principal principal) {
        service.layPhase(req.getRoomId(), username(principal), req.getGroups());
    }

    @MessageMapping("/phase10/hit")
    public void hit(@Payload Phase10ActionRequest req, Principal principal) {
        service.hit(req.getRoomId(), username(principal), req.getMeldId(), req.getCardId(), req.getRunEnd());
    }

    @MessageMapping("/phase10/discard")
    public void discard(@Payload Phase10ActionRequest req, Principal principal) {
        service.discard(req.getRoomId(), username(principal), req.getDiscardCardId(), req.getSkipTarget());
    }

    @MessageMapping("/phase10/chat")
    public void chat(@Payload Phase10ActionRequest req, Principal principal) {
        service.sendChat(req.getRoomId(), username(principal), req.getMessage());
    }

    private String username(Principal principal) {
        if (principal instanceof UsernamePasswordAuthenticationToken auth) {
            return (String) auth.getPrincipal();
        }
        throw new IllegalStateException("Invalid user principal");
    }
}
