package com.devconnect.service;

import com.devconnect.model.GameResult;
import com.devconnect.repository.GameResultRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Records finished games and serves leaderboards + per-user stats by aggregating
 * the {@link GameResult} table. Supports per-game and all-game (gameKey "ALL")
 * boards over WEEKLY (current ISO week) and ALL_TIME periods.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LeaderboardService {

    private final GameResultRepository repo;
    private static final LocalDateTime EPOCH = LocalDateTime.of(1970, 1, 1, 0, 0);

    /** Record one finished game for one player. Ignores blank/bot usernames. */
    public void record(String gameKey, String username, boolean won, int score) {
        if (gameKey == null || username == null || username.isBlank()) return;
        if (username.startsWith("🤖")) return; // skip "🤖 Bot N"
        repo.save(new GameResult(gameKey, username, won, score));
    }

    private LocalDateTime since(String period) {
        if ("ALL_TIME".equalsIgnoreCase(period)) return EPOCH;
        // WEEKLY (default): start of the current ISO week (Monday 00:00).
        return LocalDate.now().with(DayOfWeek.MONDAY).atStartOfDay();
    }

    /** Ranked leaderboard. gameKey "ALL" = combined across every game. */
    public List<Map<String, Object>> leaderboard(String gameKey, String period, int limit) {
        String key = (gameKey == null || gameKey.isBlank()) ? "ALL" : gameKey.toUpperCase();
        List<GameResultRepository.LeaderboardRow> rows =
                repo.leaderboard(key, since(period), PageRequest.of(0, Math.max(1, Math.min(limit, 100))));

        List<Map<String, Object>> out = new ArrayList<>();
        int rank = 1;
        for (GameResultRepository.LeaderboardRow r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("rank", rank++);
            m.put("username", r.getUsername());
            m.put("wins", r.getWins());
            m.put("played", r.getPlayed());
            m.put("winRate", r.getPlayed() == 0 ? 0 : Math.round(100.0 * r.getWins() / r.getPlayed()));
            out.add(m);
        }
        return out;
    }

    /** Top {@code limit} game keys by total plays across all users. */
    public List<Map<String, Object>> popularGames(int limit) {
        int cap = Math.max(1, Math.min(limit, 20));
        List<GameResultRepository.PopularRow> rows = repo.popularGames(PageRequest.of(0, cap));
        List<Map<String, Object>> out = new ArrayList<>();
        for (GameResultRepository.PopularRow r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("gameKey", r.getGameKey());
            m.put("played", r.getPlayed());
            out.add(m);
        }
        return out;
    }

    /** Per-user stats: per-game rollup, overall totals, and current win streak. */
    public Map<String, Object> userStats(String username) {
        List<GameResultRepository.StatRow> rows = repo.statsByUser(username);

        List<Map<String, Object>> perGame = new ArrayList<>();
        long totalPlayed = 0, totalWins = 0;
        for (GameResultRepository.StatRow r : rows) {
            Map<String, Object> g = new LinkedHashMap<>();
            g.put("gameKey", r.getGameKey());
            g.put("played", r.getPlayed());
            g.put("wins", r.getWins());
            g.put("winRate", r.getPlayed() == 0 ? 0 : Math.round(100.0 * r.getWins() / r.getPlayed()));
            perGame.add(g);
            totalPlayed += r.getPlayed();
            totalWins += r.getWins();
        }

        // Current win streak from most-recent results.
        int streak = 0;
        for (GameResult gr : repo.findTop20ByUsernameOrderByPlayedAtDesc(username)) {
            if (gr.isWon()) streak++; else break;
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("username", username);
        out.put("totalPlayed", totalPlayed);
        out.put("totalWins", totalWins);
        out.put("winRate", totalPlayed == 0 ? 0 : Math.round(100.0 * totalWins / totalPlayed));
        out.put("currentStreak", streak);
        out.put("games", perGame);
        return out;
    }
}
