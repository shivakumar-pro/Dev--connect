package com.devconnect.chowka.controller;

import com.devconnect.chowka.dto.ChowkaActionRequest;
import com.devconnect.chowka.service.ChowkaGameService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Controller;

import java.security.Principal;

/**
 * WebSocket (STOMP) controller for Chowka Bara gameplay.
 *
 * Client subscribes to:
 *   /topic/chowka/{roomId}  — public room events (state, dice, moves, captures, results)
 *   /user/queue/chowka      — private errors
 *
 * Client sends to /app/chowka/*:
 *   join/{roomId}, leave/{roomId}, start/{roomId}, add-bot/{roomId},
 *   rematch/{roomId}, roll/{roomId}, remove-bot, move, chat
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class ChowkaWebSocketController {

    private final ChowkaGameService service;

    @MessageMapping("/chowka/join/{roomId}")
    public void join(@DestinationVariable String roomId, Principal principal) {
        run(principal, name -> service.joinRoom(roomId, name));
    }

    @MessageMapping("/chowka/leave/{roomId}")
    public void leave(@DestinationVariable String roomId, Principal principal) {
        run(principal, name -> service.leaveRoom(roomId, name));
    }

    @MessageMapping("/chowka/start/{roomId}")
    public void start(@DestinationVariable String roomId, Principal principal) {
        run(principal, name -> service.startGame(roomId, name));
    }

    @MessageMapping("/chowka/add-bot/{roomId}")
    public void addBot(@DestinationVariable String roomId, Principal principal) {
        run(principal, name -> service.addBot(roomId, name));
    }

    @MessageMapping("/chowka/rematch/{roomId}")
    public void rematch(@DestinationVariable String roomId, Principal principal) {
        run(principal, name -> service.rematch(roomId, name));
    }

    @MessageMapping("/chowka/roll/{roomId}")
    public void roll(@DestinationVariable String roomId, Principal principal) {
        run(principal, name -> service.roll(roomId, name));
    }

    @MessageMapping("/chowka/remove-bot")
    public void removeBot(@Payload ChowkaActionRequest req, Principal principal) {
        run(principal, name -> service.removeBot(req.getRoomId(), name, req.getBotName()));
    }

    @MessageMapping("/chowka/move")
    public void move(@Payload ChowkaActionRequest req, Principal principal) {
        run(principal, name -> service.move(req.getRoomId(), name, req.getPieceId()));
    }

    @MessageMapping("/chowka/chat")
    public void chat(@Payload ChowkaActionRequest req, Principal principal) {
        run(principal, name -> service.chat(req.getRoomId(), name, req.getMessage()));
    }

    /** Runs an action, surfacing any rule violation back to the actor privately. */
    private void run(Principal principal, java.util.function.Consumer<String> action) {
        String name = username(principal);
        try {
            action.accept(name);
        } catch (IllegalArgumentException | IllegalStateException | java.util.NoSuchElementException e) {
            service.sendError(name, e.getMessage());
        } catch (Exception e) {
            log.warn("Chowka action failed for {}", name, e);
            service.sendError(name, "Something went wrong");
        }
    }

    private String username(Principal principal) {
        if (principal instanceof UsernamePasswordAuthenticationToken auth) {
            return (String) auth.getPrincipal();
        }
        throw new IllegalStateException("Invalid user principal");
    }
}
