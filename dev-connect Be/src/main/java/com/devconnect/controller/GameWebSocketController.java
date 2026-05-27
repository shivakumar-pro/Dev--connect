package com.devconnect.controller;

import com.devconnect.dto.request.GameChatRequest;
import com.devconnect.dto.request.GameGuessRequest;
import com.devconnect.dto.request.GameRematchRequest;
import com.devconnect.dto.request.GameSelectNumberRequest;
import com.devconnect.service.GameService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Controller;

import java.security.Principal;

/**
 * WebSocket (STOMP) Controller for the 2-player "Guess the Number" game.
 *
 * Game flow over WebSocket:
 *   1. /app/game/join/{roomId}    — both players join the room
 *   2. /app/game/select-number    — each player picks a secret number (1-100)
 *   3. System does a coin toss and sends START_GAME with who goes first
 *   4. /app/game/guess            — current player guesses opponent's number
 *   5. Hints returned: "Too High", "Too Low", or "Correct"
 *   6. 30-second timer per turn — auto-skips if no guess
 *   7. /app/game/chat             — in-game chat between players
 *   8. /app/game/rematch          — request rematch after game ends
 *
 * Subscribe to:
 *   /topic/game/{roomId}  — room events (join, start, guess results, game over)
 *   /user/queue/game      — private events (errors, number selected confirmation)
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class GameWebSocketController {

    private final GameService gameService;

    @MessageMapping("/game/join/{roomId}")
    public void joinRoom(@DestinationVariable String roomId, Principal principal) {
        String username = getUsername(principal);
        gameService.joinRoom(roomId, username);
    }

    @MessageMapping("/game/select-number")
    public void selectNumber(@Payload GameSelectNumberRequest request, Principal principal) {
        String username = getUsername(principal);
        gameService.selectNumber(request.getRoomId(), username, request.getSecretNumber());
    }

    @MessageMapping("/game/guess")
    public void makeGuess(@Payload GameGuessRequest request, Principal principal) {
        String username = getUsername(principal);
        gameService.makeGuess(request.getRoomId(), username, request.getGuess());
    }

    @MessageMapping("/game/chat")
    public void sendChat(@Payload GameChatRequest request, Principal principal) {
        String username = getUsername(principal);
        gameService.sendChatMessage(request.getRoomId(), username, request.getMessage());
    }

    @MessageMapping("/game/rematch")
    public void requestRematch(@Payload GameRematchRequest request, Principal principal) {
        String username = getUsername(principal);
        gameService.requestRematch(request.getRoomId(), username);
    }

    private String getUsername(Principal principal) {
        if (principal instanceof UsernamePasswordAuthenticationToken auth) {
            return (String) auth.getPrincipal();
        }
        throw new IllegalStateException("Invalid user principal");
    }
}
