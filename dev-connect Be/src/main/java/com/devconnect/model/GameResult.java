package com.devconnect.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * One row per finished game per (human) player. This single table powers every
 * leaderboard (per-game, all-game, weekly, all-time) and per-user stats via
 * aggregation queries — no per-game tables needed.
 */
@Entity
@Table(name = "game_results", indexes = {
    @Index(name = "idx_game_played", columnList = "game_key, played_at"),
    @Index(name = "idx_result_username", columnList = "username")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class GameResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** e.g. BOTTLE, GUESS, PHASE10, DICE_PIG, DICE_FARKLE … */
    @Column(name = "game_key", nullable = false, length = 40)
    private String gameKey;

    @Column(nullable = false, length = 50)
    private String username;

    @Column(nullable = false)
    private boolean won;

    /** Optional metric (e.g. attempts for Bottle, points for Dice). 0 if unused. */
    @Column(nullable = false)
    private int score;

    @CreationTimestamp
    @Column(name = "played_at", nullable = false, updatable = false)
    private LocalDateTime playedAt;

    public GameResult(String gameKey, String username, boolean won, int score) {
        this.gameKey = gameKey;
        this.username = username;
        this.won = won;
        this.score = score;
    }
}
