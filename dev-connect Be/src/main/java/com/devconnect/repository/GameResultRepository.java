package com.devconnect.repository;

import com.devconnect.model.GameResult;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface GameResultRepository extends JpaRepository<GameResult, Long> {

    /** One ranked row per player. gameKey "ALL" aggregates across every game. */
    interface LeaderboardRow {
        String getUsername();
        long getWins();
        long getPlayed();
    }

    @Query("SELECT r.username AS username, " +
           "SUM(CASE WHEN r.won = true THEN 1 ELSE 0 END) AS wins, " +
           "COUNT(r) AS played " +
           "FROM GameResult r " +
           "WHERE r.playedAt >= :since AND (:gameKey = 'ALL' OR r.gameKey = :gameKey) " +
           "GROUP BY r.username " +
           "ORDER BY wins DESC, played ASC, r.username ASC")
    List<LeaderboardRow> leaderboard(@Param("gameKey") String gameKey,
                                     @Param("since") LocalDateTime since,
                                     Pageable pageable);

    /** Per-game stat rollup for a single user. */
    interface StatRow {
        String getGameKey();
        long getPlayed();
        long getWins();
    }

    @Query("SELECT r.gameKey AS gameKey, COUNT(r) AS played, " +
           "SUM(CASE WHEN r.won = true THEN 1 ELSE 0 END) AS wins " +
           "FROM GameResult r WHERE r.username = :username " +
           "GROUP BY r.gameKey ORDER BY played DESC")
    List<StatRow> statsByUser(@Param("username") String username);

    /** Recent results for a user (newest first) — used to compute the current win streak. */
    List<GameResult> findTop20ByUsernameOrderByPlayedAtDesc(String username);

    /** {gameKey, totalPlays} sorted by plays desc — the "most played" board. */
    interface PopularRow {
        String getGameKey();
        long getPlayed();
    }

    @Query("SELECT r.gameKey AS gameKey, COUNT(r) AS played " +
           "FROM GameResult r " +
           "GROUP BY r.gameKey " +
           "ORDER BY played DESC")
    List<PopularRow> popularGames(Pageable pageable);
}
