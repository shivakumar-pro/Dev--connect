package com.devconnect.dice.controller;

import com.devconnect.dice.dto.CreateDiceRoomRequest;
import com.devconnect.dice.dto.DiceActionRequest;
import com.devconnect.dice.dto.JoinDiceRoomRequest;
import com.devconnect.dice.model.DiceRoom;
import com.devconnect.dice.service.DiceGameService;
import com.devconnect.dto.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * REST API for the four dice games (Pig, Farkle, Liar's Dice, Ship/Captain/Crew).
 *
 * Flow:
 *   1. POST   /api/dice/rooms                  -> create room (host joins automatically)
 *   2. POST   /api/dice/rooms/{id}/join        -> other players join
 *   3. POST   /api/dice/rooms/{id}/start       -> host starts the game
 *   4. POST   /api/dice/rooms/{id}/action      -> current player submits an action
 *   5. GET    /api/dice/rooms/{id}             -> poll room state (player-aware view)
 *   6. POST   /api/dice/rooms/{id}/leave       -> leave room
 *
 * Auth: this module is exposed as permitAll (see SecurityConfig). The frontend
 * passes `username` in the request body so we don't need a JWT for testing.
 */
@Slf4j
@RestController
@RequestMapping("/api/dice")
@RequiredArgsConstructor
public class DiceController {

    private final DiceGameService service;

    @GetMapping("/rooms")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listRooms() {
        return ResponseEntity.ok(ApiResponse.success("Rooms", service.listRooms()));
    }

    @PostMapping("/rooms")
    public ResponseEntity<ApiResponse<Map<String, Object>>> create(@RequestBody CreateDiceRoomRequest req) {
        DiceRoom r = service.createRoom(req.getGameType(), req.getHostUsername(),
                req.getTargetScore(), req.getMaxPlayers());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Room created", service.view(r.getRoomId(), req.getHostUsername())));
    }

    @PostMapping("/rooms/{roomId}/join")
    public ResponseEntity<ApiResponse<Map<String, Object>>> join(
            @PathVariable String roomId, @RequestBody JoinDiceRoomRequest req) {
        service.joinRoom(roomId, req.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Joined", service.view(roomId, req.getUsername())));
    }

    @PostMapping("/rooms/{roomId}/leave")
    public ResponseEntity<ApiResponse<Map<String, Object>>> leave(
            @PathVariable String roomId, @RequestBody JoinDiceRoomRequest req) {
        service.leaveRoom(roomId, req.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Left", Map.of("username", req.getUsername())));
    }

    @PostMapping("/rooms/{roomId}/start")
    public ResponseEntity<ApiResponse<Map<String, Object>>> start(
            @PathVariable String roomId, @RequestBody JoinDiceRoomRequest req) {
        service.startGame(roomId, req.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Game started", service.view(roomId, req.getUsername())));
    }

    @PostMapping("/rooms/{roomId}/action")
    public ResponseEntity<ApiResponse<Map<String, Object>>> action(
            @PathVariable String roomId, @RequestBody DiceActionRequest req) {
        Map<String, Object> result = service.handleAction(roomId, req);
        Map<String, Object> view = service.view(roomId, req.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Action processed",
                Map.of("result", result, "state", view)));
    }

    @GetMapping("/rooms/{roomId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> view(
            @PathVariable String roomId,
            @RequestParam(required = false) String username) {
        return ResponseEntity.ok(ApiResponse.success("Room state", service.view(roomId, username)));
    }

    // ==================== ERROR HANDLING ====================

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<ApiResponse<Void>> notFound(NoSuchElementException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(e.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Void>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(ApiResponse.error(e.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ApiResponse<Void>> conflict(IllegalStateException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiResponse.error(e.getMessage()));
    }
}
