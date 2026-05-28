package com.devconnect.phase10.controller;

import com.devconnect.dto.response.ApiResponse;
import com.devconnect.phase10.dto.CreatePhase10RoomRequest;
import com.devconnect.phase10.model.Phase10Room;
import com.devconnect.phase10.model.Phase10Stats;
import com.devconnect.phase10.model.PhaseDefinition;
import com.devconnect.phase10.service.Phase10Service;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * REST endpoints for Phase 10. All gameplay happens over WebSocket
 * (see {@link Phase10WebSocketController}); these cover lobby + stats.
 *
 *   POST /api/phase10/create-room      — create a room (host)
 *   GET  /api/phase10/rooms            — list open rooms (PUBLIC)
 *   GET  /api/phase10/room/{roomId}    — public state snapshot
 *   GET  /api/phase10/phases           — the 10 phase definitions (PUBLIC)
 *   GET  /api/phase10/leaderboard      — top players (PUBLIC)
 *   GET  /api/phase10/stats/{username} — a player's stats
 */
@Slf4j
@RestController
@RequestMapping("/api/phase10")
@RequiredArgsConstructor
public class Phase10Controller {

    private final Phase10Service service;

    @PostMapping("/create-room")
    public ResponseEntity<ApiResponse<Map<String, Object>>> createRoom(
            @AuthenticationPrincipal String currentUsername,
            @RequestBody(required = false) CreatePhase10RoomRequest request) {
        if (request == null) request = new CreatePhase10RoomRequest();
        Phase10Room room = service.createRoom(currentUsername,
                request.getMaxPlayers(), request.getTurnTimerSeconds(), request.getBotsEnabled());
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("roomId", room.getRoomId());
        data.put("hostUsername", room.getHostUsername());
        data.put("maxPlayers", room.getMaxPlayers());
        data.put("minPlayers", room.getMinPlayers());
        data.put("turnTimerSeconds", room.getTurnTimerSeconds());
        data.put("botsEnabled", room.isBotsEnabled());
        return ResponseEntity.ok(ApiResponse.success("Room created", data));
    }

    @GetMapping("/rooms")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listRooms() {
        return ResponseEntity.ok(ApiResponse.success("Open rooms", service.listRooms()));
    }

    @GetMapping("/room/{roomId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getRoom(@PathVariable String roomId) {
        Map<String, Object> state = service.getPublicState(roomId);
        if (state == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(ApiResponse.success("Room state", state));
    }

    @GetMapping("/phases")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listPhases() {
        List<Map<String, Object>> phases = new ArrayList<>();
        for (int i = 1; i <= PhaseDefinition.MAX_PHASE; i++) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("phase", i);
            m.put("description", PhaseDefinition.description(i));
            phases.add(m);
        }
        return ResponseEntity.ok(ApiResponse.success("Phases", phases));
    }

    @GetMapping("/leaderboard")
    public ResponseEntity<ApiResponse<List<Phase10Stats>>> leaderboard() {
        return ResponseEntity.ok(ApiResponse.success("Leaderboard", service.getLeaderboard()));
    }

    @GetMapping("/stats/{username}")
    public ResponseEntity<ApiResponse<Phase10Stats>> stats(@PathVariable String username) {
        return ResponseEntity.ok(ApiResponse.success("Stats", service.getStats(username)));
    }
}
