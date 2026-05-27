package com.devconnect.party.controller;

import com.devconnect.party.dto.PartyActionRequest;
import com.devconnect.party.service.PartyRoomService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.Map;

/**
 * WebSocket (STOMP) Controller for the multiplayer party game platform.
 *
 * Complete game flow over WebSocket:
 *   1. /app/party/join/{roomId}    — join the room (2-10 players)
 *   2. /app/party/start/{roomId}   — host starts the game
 *   3. Server sends ROUND_START with question/options/instructions
 *   4. /app/party/action           — submit your answer/guess/vote for the round
 *   5. When all players submit (or timer expires) -> server evaluates -> ROUND_RESULT
 *   6. Some games have 2 phases per round (e.g., choose then predict)
 *   7. After all rounds -> GAME_OVER with final scoreboard
 *   8. /app/party/rematch/{roomId} — all vote for rematch -> room resets
 *   9. /app/party/chat             — in-game chat anytime
 *   10. /app/party/leave/{roomId}  — leave the room
 *
 * Subscribe to:
 *   /topic/party/{roomId}   — room events (all players see these)
 *   /user/queue/party       — private events (per-player data in Bluff/SecretHint, errors)
 */
@Slf4j
@Controller
@RequiredArgsConstructor
public class PartyWebSocketController {

    private final PartyRoomService partyRoomService;

    @MessageMapping("/party/join/{roomId}")
    public void joinRoom(@DestinationVariable String roomId, Principal principal) {
        partyRoomService.joinRoom(roomId, getUsername(principal));
    }

    @MessageMapping("/party/leave/{roomId}")
    public void leaveRoom(@DestinationVariable String roomId, Principal principal) {
        partyRoomService.leaveRoom(roomId, getUsername(principal));
    }

    @MessageMapping("/party/start/{roomId}")
    public void startGame(@DestinationVariable String roomId, Principal principal) {
        partyRoomService.startGame(roomId, getUsername(principal));
    }

    @MessageMapping("/party/action")
    public void submitAction(@Payload PartyActionRequest request, Principal principal) {
        partyRoomService.handleAction(request.getRoomId(), getUsername(principal), request.getData());
    }

    @MessageMapping("/party/chat")
    public void sendChat(@Payload Map<String, String> request, Principal principal) {
        partyRoomService.sendChat(request.get("roomId"), getUsername(principal), request.get("message"));
    }

    @MessageMapping("/party/rematch/{roomId}")
    public void requestRematch(@DestinationVariable String roomId, Principal principal) {
        partyRoomService.requestRematch(roomId, getUsername(principal));
    }

    private String getUsername(Principal principal) {
        if (principal instanceof UsernamePasswordAuthenticationToken auth) {
            return (String) auth.getPrincipal();
        }
        throw new IllegalStateException("Invalid user principal");
    }
}
