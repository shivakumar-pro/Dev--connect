package com.devconnect.bottle.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A multiplayer "Bottle Shuffle Match" room.
 *
 * Flow: players memorize the secret order during a short window, then race to
 * restore it. Each submission is an attempt; the player who reaches a perfect
 * 5/5 in the FEWEST attempts wins (ties broken by who solved first).
 */
@Data
public class BottleRoom {

    public enum Status { WAITING, IN_PROGRESS, FINISHED }

    private String roomId;
    private String hostUsername;
    private Map<String, BottlePlayer> players = new LinkedHashMap<>();
    private Status status = Status.WAITING;
    private int maxPlayers = 4;
    private int minPlayers = 2;

    /** How many bottles this room plays with (5, 7, or 10). */
    private int bottleCount = 5;

    /** The color set this room uses (subset of the global palette, size = bottleCount). */
    private List<String> colors = new ArrayList<>();

    /** The secret target order players must reconstruct. */
    private List<String> originalOrder = new ArrayList<>();

    private long startedAt;        // epoch millis when the round started
    private long memorizeEndsAt;   // epoch millis when guessing opens (no memorize window — equals startedAt)
    private int memorizeSeconds = 0;

    private int finishSeq;         // increments each time a player solves
    private String winner;         // set when the game finishes

    /** In-game chat / emoji messages: {id, sender, message, ts}. */
    private List<Map<String, Object>> chat = new ArrayList<>();
    private long chatSeq;          // monotonic id for chat messages

    public BottleRoom(String roomId, String hostUsername) {
        this.roomId = roomId;
        this.hostUsername = hostUsername;
    }
}
