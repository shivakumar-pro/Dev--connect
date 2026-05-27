package com.devconnect.controller;

import com.devconnect.dto.request.GameCreateRoomRequest;
import com.devconnect.dto.response.ApiResponse;
import com.devconnect.model.GameLeaderboard;
import com.devconnect.model.GameRoom;
import com.devconnect.service.GameService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Game Controller — REST endpoints for the 2-player "Guess the Number" game.
 *
 * This is the ORIGINAL 1v1 game (separate from the Party platform).
 * Game state is stored in-memory (ConcurrentHashMap), not in DB.
 *
 * REST endpoints:
 *   POST /api/game/create-room          — create a room with difficulty (EASY/MEDIUM/HARD)
 *   GET  /api/game/room/{roomId}        — get room status
 *   GET  /api/game/leaderboard          — top 10 players by wins
 *   GET  /api/game/leaderboard/{username} — single player stats
 *
 * WebSocket flow (see GameWebSocketController):
 *   /app/game/join/{roomId}      — join a room
 *   /app/game/select-number      — pick secret number
 *   /app/game/guess              — make a guess
 *   /app/game/chat               — in-game chat
 *   /app/game/rematch            — request rematch
 *
 * Subscribe: /topic/game/{roomId} (room events) + /user/queue/game (private events)
 */
@Slf4j
@RestController
@RequestMapping("/api/game")
@RequiredArgsConstructor
public class GameController {

    private final GameService gameService;

    @PostMapping("/create-room")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createRoom(
            @RequestBody(required = false) GameCreateRoomRequest request) {
        GameRoom.Difficulty difficulty = GameRoom.Difficulty.MEDIUM;
        if (request != null && request.getDifficulty() != null) {
            try {
                difficulty = GameRoom.Difficulty.valueOf(request.getDifficulty().toUpperCase());
            } catch (IllegalArgumentException ignored) {
                // default to MEDIUM
            }
        }

        GameRoom room = gameService.createRoom(difficulty);
        return ResponseEntity.ok(ApiResponse.success("Room created", Map.of(
                "roomId", room.getRoomId(),
                "difficulty", room.getDifficulty().name(),
                "minRange", room.getMinRange(),
                "maxRange", room.getMaxRange()
        )));
    }

    @GetMapping("/room/{roomId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getRoomStatus(@PathVariable String roomId) {
        GameRoom room = gameService.getRoom(roomId);
        if (room == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(ApiResponse.success("Room status", Map.of(
                "roomId", room.getRoomId(),
                "players", room.getPlayers(),
                "status", room.getStatus().name(),
                "difficulty", room.getDifficulty().name(),
                "minRange", room.getMinRange(),
                "maxRange", room.getMaxRange(),
                "currentTurnPlayer", room.getCurrentTurnPlayer() != null ? room.getCurrentTurnPlayer() : "",
                "player1Attempts", room.getAttemptCount(!room.getPlayers().isEmpty() ? room.getPlayers().get(0) : ""),
                "player2Attempts", room.getAttemptCount(room.getPlayers().size() > 1 ? room.getPlayers().get(1) : ""),
                "winner", room.getWinner() != null ? room.getWinner() : ""
        )));
    }

    @GetMapping("/leaderboard")
    public ResponseEntity<ApiResponse<List<GameLeaderboard>>> getLeaderboard() {
        return ResponseEntity.ok(ApiResponse.success("Leaderboard", gameService.getLeaderboard()));
    }

    @GetMapping("/leaderboard/{username}")
    public ResponseEntity<ApiResponse<GameLeaderboard>> getPlayerStats(@PathVariable String username) {
        GameLeaderboard stats = gameService.getPlayerStats(username);
        if (stats == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(ApiResponse.success("Player stats", stats));
    }
}
