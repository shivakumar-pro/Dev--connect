package com.devconnect.party.controller;

import com.devconnect.dto.response.ApiResponse;
import com.devconnect.party.dto.CreatePartyRoomRequest;
import com.devconnect.party.model.PartyGameType;
import com.devconnect.party.model.PartyRoom;
import com.devconnect.party.service.PartyRoomService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Party Controller — REST endpoints for the multiplayer party game platform.
 *
 * Supports 8 game types (2-10 players):
 *   GUESS_THE_NUMBER, THIS_OR_THAT, GUESS_FAVORITES, BLUFF,
 *   QUICK_QUIZ, PREDICT_ME, MEMORY_GAME, SECRET_HINT
 *
 * REST endpoints:
 *   GET  /api/party/games           — list all available game types (PUBLIC)
 *   POST /api/party/create-room     — create a room (pick game, rounds, timer, max players)
 *   GET  /api/party/rooms           — list open rooms waiting for players (PUBLIC)
 *   GET  /api/party/room/{roomId}   — get room status with scoreboard
 *
 * Gameplay happens entirely over WebSocket (see PartyWebSocketController).
 */
@Slf4j
@RestController
@RequestMapping("/api/party")
@RequiredArgsConstructor
public class PartyController {

    private final PartyRoomService partyRoomService;

    @GetMapping("/games")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listGameTypes() {
        List<Map<String, Object>> games = Arrays.stream(PartyGameType.values())
                .map(g -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("type", g.name());
                    m.put("name", g.name().replace("_", " "));
                    return m;
                })
                .collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success("Available games", games));
    }

    @PostMapping("/create-room")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createRoom(
            @AuthenticationPrincipal String currentUsername,
            @RequestBody CreatePartyRoomRequest request) {
        PartyGameType gameType;
        try {
            gameType = PartyGameType.valueOf(request.getGameType());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(ApiResponse.error("Invalid game type: " + request.getGameType()));
        }

        PartyRoom room = partyRoomService.createRoom(
                gameType, currentUsername,
                request.getMaxRounds(), request.getTimerSeconds(), request.getMaxPlayers());

        return ResponseEntity.ok(ApiResponse.success("Room created", Map.of(
                "roomId", room.getRoomId(),
                "gameType", room.getGameType().name(),
                "hostUsername", room.getHostUsername(),
                "maxRounds", room.getMaxRounds(),
                "timerSeconds", room.getTimerSeconds(),
                "maxPlayers", room.getMaxPlayers(),
                "minPlayers", room.getMinPlayers()
        )));
    }

    @GetMapping("/rooms")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listRooms() {
        return ResponseEntity.ok(ApiResponse.success("Available rooms", partyRoomService.listRooms()));
    }

    @GetMapping("/room/{roomId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getRoomStatus(@PathVariable String roomId) {
        PartyRoom room = partyRoomService.getRoom(roomId);
        if (room == null) {
            return ResponseEntity.notFound().build();
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("roomId", room.getRoomId());
        data.put("gameType", room.getGameType().name());
        data.put("hostUsername", room.getHostUsername());
        data.put("status", room.getStatus().name());
        data.put("players", room.getPlayerUsernames());
        data.put("currentRound", room.getCurrentRound());
        data.put("maxRounds", room.getMaxRounds());
        data.put("timerSeconds", room.getTimerSeconds());
        data.put("scoreboard", room.getScoreboard().stream()
                .map(p -> Map.of("username", (Object) p.getUsername(), "score", (Object) p.getScore()))
                .collect(Collectors.toList()));

        return ResponseEntity.ok(ApiResponse.success("Room status", data));
    }
}
