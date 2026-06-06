package com.devconnect.chowka.controller;

import com.devconnect.chowka.dto.CreateChowkaRoomRequest;
import com.devconnect.chowka.model.ChowkaRoom;
import com.devconnect.chowka.service.ChowkaGameService;
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
 * REST API for Chowka Bara lobbies. Gameplay itself runs over WebSocket
 * (see {@link ChowkaWebSocketController}); these endpoints just create / list /
 * snapshot rooms.
 *
 *   GET    /api/chowka/rooms          -> list open rooms
 *   POST   /api/chowka/rooms          -> create a room (host joins)
 *   GET    /api/chowka/rooms/{id}     -> poll room state
 */
@Slf4j
@RestController
@RequestMapping("/api/chowka")
@RequiredArgsConstructor
public class ChowkaController {

    private final ChowkaGameService service;

    @GetMapping("/rooms")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listRooms() {
        return ResponseEntity.ok(ApiResponse.success("Rooms", service.listRooms()));
    }

    @PostMapping("/rooms")
    public ResponseEntity<ApiResponse<Map<String, Object>>> create(@RequestBody CreateChowkaRoomRequest req) {
        ChowkaRoom r = service.createRoom(req.getHostUsername(), req.getMaxPlayers(), req.getOpenStart());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Room created", service.view(r.getRoomId())));
    }

    @GetMapping("/rooms/{roomId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> view(@PathVariable String roomId) {
        return ResponseEntity.ok(ApiResponse.success("Room state", service.view(roomId)));
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
