package com.devconnect.controller;

import com.devconnect.dto.response.ApiResponse;
import com.devconnect.service.LeaderboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Unified leaderboards + per-user stats across all games.
 *
 *   GET /api/leaderboard?game={KEY|ALL}&period={WEEKLY|ALL_TIME}&limit=50
 *   GET /api/stats/{username}
 *
 * Exposed read-only (permitAll); results are written by each game's service via
 * {@link LeaderboardService#record}.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class LeaderboardController {

    private final LeaderboardService service;

    @GetMapping("/leaderboard")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> leaderboard(
            @RequestParam(defaultValue = "ALL") String game,
            @RequestParam(defaultValue = "WEEKLY") String period,
            @RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(ApiResponse.success("Leaderboard", service.leaderboard(game, period, limit)));
    }

    @GetMapping("/stats/{username}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> stats(@PathVariable String username) {
        return ResponseEntity.ok(ApiResponse.success("Stats", service.userStats(username)));
    }

    /** Top games by total play count — powers the Home page "Most Played" tiles. */
    @GetMapping("/leaderboard/popular")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> popular(
            @RequestParam(defaultValue = "3") int limit) {
        return ResponseEntity.ok(ApiResponse.success("Popular games", service.popularGames(limit)));
    }
}
