package com.devconnect.chowka.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * A player in a Chowka Bara room. Owns 4 pieces and a fixed seat colour.
 * Bots are driven by the service; humans act over WebSocket.
 */
@Data
public class ChowkaPlayer {
    public static final int PIECES = 4;

    private String username;
    private String color;        // RED | GREEN | BLUE | YELLOW (seat colour)
    private int seat;            // 0..3 — determines path rotation
    private boolean bot;
    private boolean connected = true;
    private List<Piece> pieces = new ArrayList<>();

    public ChowkaPlayer(String username, int seat, String color) {
        this.username = username;
        this.seat = seat;
        this.color = color;
        for (int i = 0; i < PIECES; i++) pieces.add(new Piece(i));
    }

    public Piece piece(int id) {
        return pieces.stream().filter(p -> p.getId() == id).findFirst().orElse(null);
    }

    public long finishedCount(int centerIndex) {
        return pieces.stream().filter(p -> p.getPathIndex() == centerIndex).count();
    }
}
