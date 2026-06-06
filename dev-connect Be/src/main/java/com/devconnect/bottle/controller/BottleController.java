package com.devconnect.bottle.controller;

import com.devconnect.bottle.dto.BottleAttemptRequest;
import com.devconnect.bottle.dto.BottleChatRequest;
import com.devconnect.bottle.dto.CreateBottleRoomRequest;
import com.devconnect.bottle.dto.JoinBottleRoomRequest;
import com.devconnect.bottle.dto.RemoveBotRequest;
import com.devconnect.bottle.model.BottleRoom;
import com.devconnect.bottle.service.BottleGameService;
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
 * REST API for multiplayer "Bottle Shuffle Match".
 *
 *   POST   /api/bottle/rooms                  -> create room (host joins)
 *   POST   /api/bottle/rooms/{id}/join        -> join via room code
 *   POST   /api/bottle/rooms/{id}/leave       -> leave
 *   POST   /api/bottle/rooms/{id}/start       -> host starts the round
 *   POST   /api/bottle/rooms/{id}/submit      -> submit an arrangement attempt
 *   POST   /api/bottle/rooms/{id}/rematch     -> reset to lobby for a new round
 *   GET    /api/bottle/rooms/{id}             -> poll room state (player-aware)
 *
 * Exposed as permitAll (see SecurityConfig); username travels in the body/query.
 */
@Slf4j
@RestController
@RequestMapping("/api/bottle")
@RequiredArgsConstructor
public class BottleController {

    private final BottleGameService service;

    @GetMapping("/rooms")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listRooms() {
        return ResponseEntity.ok(ApiResponse.success("Rooms", service.listRooms()));
    }

    @PostMapping("/rooms")
    public ResponseEntity<ApiResponse<Map<String, Object>>> create(@RequestBody CreateBottleRoomRequest req) {
        BottleRoom r = service.createRoom(req.getHostUsername(), req.getMaxPlayers(), req.getBottleCount());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Room created", service.view(r.getRoomId(), req.getHostUsername())));
    }

    @PostMapping("/rooms/{roomId}/join")
    public ResponseEntity<ApiResponse<Map<String, Object>>> join(
            @PathVariable String roomId, @RequestBody JoinBottleRoomRequest req) {
        service.joinRoom(roomId, req.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Joined", service.view(roomId, req.getUsername())));
    }

    @PostMapping("/rooms/{roomId}/leave")
    public ResponseEntity<ApiResponse<Map<String, Object>>> leave(
            @PathVariable String roomId, @RequestBody JoinBottleRoomRequest req) {
        service.leaveRoom(roomId, req.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Left", Map.of("username", req.getUsername())));
    }

    @PostMapping("/rooms/{roomId}/add-bot")
    public ResponseEntity<ApiResponse<Map<String, Object>>> addBot(
            @PathVariable String roomId, @RequestBody JoinBottleRoomRequest req) {
        service.addBot(roomId, req.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Bot added", service.view(roomId, req.getUsername())));
    }

    @PostMapping("/rooms/{roomId}/remove-bot")
    public ResponseEntity<ApiResponse<Map<String, Object>>> removeBot(
            @PathVariable String roomId, @RequestBody RemoveBotRequest req) {
        service.removeBot(roomId, req.getUsername(), req.getBotName());
        return ResponseEntity.ok(ApiResponse.success("Bot removed", service.view(roomId, req.getUsername())));
    }

    @PostMapping("/rooms/{roomId}/start")
    public ResponseEntity<ApiResponse<Map<String, Object>>> start(
            @PathVariable String roomId, @RequestBody JoinBottleRoomRequest req) {
        service.startGame(roomId, req.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Game started", service.view(roomId, req.getUsername())));
    }

    @PostMapping("/rooms/{roomId}/submit")
    public ResponseEntity<ApiResponse<Map<String, Object>>> submit(
            @PathVariable String roomId, @RequestBody BottleAttemptRequest req) {
        Map<String, Object> result = service.submit(roomId, req);
        Map<String, Object> view = service.view(roomId, req.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Attempt recorded",
                Map.of("result", result, "state", view)));
    }

    @PostMapping("/rooms/{roomId}/chat")
    public ResponseEntity<ApiResponse<Map<String, Object>>> chat(
            @PathVariable String roomId, @RequestBody BottleChatRequest req) {
        service.chat(roomId, req.getUsername(), req.getMessage());
        return ResponseEntity.ok(ApiResponse.success("Sent", service.view(roomId, req.getUsername())));
    }

    @PostMapping("/rooms/{roomId}/rematch")
    public ResponseEntity<ApiResponse<Map<String, Object>>> rematch(
            @PathVariable String roomId, @RequestBody JoinBottleRoomRequest req) {
        service.rematch(roomId, req.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Rematch ready", service.view(roomId, req.getUsername())));
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
