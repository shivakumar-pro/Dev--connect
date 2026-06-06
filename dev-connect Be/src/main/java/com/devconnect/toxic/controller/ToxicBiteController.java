package com.devconnect.toxic.controller;

import com.devconnect.dto.response.ApiResponse;
import com.devconnect.toxic.dto.CreateToxicBiteRoomRequest;
import com.devconnect.toxic.dto.JoinToxicBiteRoomRequest;
import com.devconnect.toxic.dto.ToxicBiteActionRequest;
import com.devconnect.toxic.model.ToxicBiteRoom;
import com.devconnect.toxic.service.ToxicBiteService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * REST API for the Toxic Bite multiplayer game.
 *
 * Mirrors the dice / bottle modules: REST-only, in-memory state, the frontend
 * polls /rooms/{id} every couple of seconds. Auth is permitAll (see SecurityConfig).
 */
@Slf4j
@RestController
@RequestMapping("/api/toxic")
@RequiredArgsConstructor
public class ToxicBiteController {

    private final ToxicBiteService service;

    @GetMapping("/rooms")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listRooms() {
        return ResponseEntity.ok(ApiResponse.success("Rooms", service.listRooms()));
    }

    @PostMapping("/rooms")
    public ResponseEntity<ApiResponse<Map<String, Object>>> create(@RequestBody CreateToxicBiteRoomRequest req) {
        ToxicBiteRoom r = service.createRoom(req.getHostUsername(), req.getRounds(), req.getMaxPlayers());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Room created", service.view(r.getRoomId(), req.getHostUsername())));
    }

    @PostMapping("/rooms/{roomId}/join")
    public ResponseEntity<ApiResponse<Map<String, Object>>> join(
            @PathVariable String roomId, @RequestBody JoinToxicBiteRoomRequest req) {
        service.joinRoom(roomId, req.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Joined", service.view(roomId, req.getUsername())));
    }

    @PostMapping("/rooms/{roomId}/leave")
    public ResponseEntity<ApiResponse<Map<String, Object>>> leave(
            @PathVariable String roomId, @RequestBody JoinToxicBiteRoomRequest req) {
        service.leaveRoom(roomId, req.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Left", Map.of("username", req.getUsername())));
    }

    @PostMapping("/rooms/{roomId}/start")
    public ResponseEntity<ApiResponse<Map<String, Object>>> start(
            @PathVariable String roomId, @RequestBody JoinToxicBiteRoomRequest req) {
        service.startGame(roomId, req.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Game started", service.view(roomId, req.getUsername())));
    }

    @PostMapping("/rooms/{roomId}/action")
    public ResponseEntity<ApiResponse<Map<String, Object>>> action(
            @PathVariable String roomId, @RequestBody ToxicBiteActionRequest req) {
        service.handleAction(roomId, req);
        return ResponseEntity.ok(ApiResponse.success("Action processed", service.view(roomId, req.getUsername())));
    }

    @PostMapping("/rooms/{roomId}/next-round")
    public ResponseEntity<ApiResponse<Map<String, Object>>> nextRound(
            @PathVariable String roomId, @RequestBody JoinToxicBiteRoomRequest req) {
        service.advanceRound(roomId, req.getUsername());
        return ResponseEntity.ok(ApiResponse.success("Round advanced", service.view(roomId, req.getUsername())));
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
