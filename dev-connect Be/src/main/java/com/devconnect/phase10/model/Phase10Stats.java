package com.devconnect.phase10.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Per-user Phase 10 statistics, persisted to the {@code phase10_stats} table.
 * Bots are never recorded.
 */
@Entity
@Table(name = "phase10_stats")
@Data
@NoArgsConstructor
public class Phase10Stats {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false, length = 50)
    private String username;

    @Column(nullable = false)
    private int gamesPlayed = 0;

    @Column(nullable = false)
    private int gamesWon = 0;

    /** Highest phase number ever reached (1-10). */
    @Column(nullable = false)
    private int highestPhaseReached = 0;

    /** Cumulative count of phases completed across all games. */
    @Column(nullable = false)
    private int totalPhasesCleared = 0;

    /** Lowest final score in a game this player WON (null if never won). */
    private Integer bestScore;

    /** Sum of final scores across games played (for average). */
    @Column(nullable = false)
    private int totalScore = 0;

    @Column(nullable = false)
    private int currentWinStreak = 0;

    @Column(nullable = false)
    private int longestWinStreak = 0;

    public Phase10Stats(String username) {
        this.username = username;
    }

    public void recordGame(boolean won, int highestPhase, int phasesClearedThisGame, int finalScore) {
        gamesPlayed++;
        totalPhasesCleared += phasesClearedThisGame;
        totalScore += finalScore;
        highestPhaseReached = Math.max(highestPhaseReached, highestPhase);
        if (won) {
            gamesWon++;
            currentWinStreak++;
            longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
            if (bestScore == null || finalScore < bestScore) bestScore = finalScore;
        } else {
            currentWinStreak = 0;
        }
    }

    @Transient
    public double getWinRate() {
        return gamesPlayed == 0 ? 0.0 : (double) gamesWon / gamesPlayed;
    }

    @Transient
    public double getAvgScore() {
        return gamesPlayed == 0 ? 0.0 : (double) totalScore / gamesPlayed;
    }
}
