package com.devconnect.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "game_leaderboard")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class GameLeaderboard {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false, length = 50)
    private String username;

    @Column(nullable = false)
    private int wins = 0;

    @Column(nullable = false)
    private int losses = 0;

    @Column(nullable = false)
    private int draws = 0;

    @Column(nullable = false)
    private int totalGames = 0;

    public GameLeaderboard(String username) {
        this.username = username;
    }

    public void recordWin() {
        wins++;
        totalGames++;
    }

    public void recordLoss() {
        losses++;
        totalGames++;
    }

    public void recordDraw() {
        draws++;
        totalGames++;
    }
}
