package com.devconnect.chowka.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ScheduledFuture;

/**
 * A Chowka Bara match room (5×5 board).
 *
 * Flow: host opens a lobby (WAITING), players/bots join, host starts
 * (IN_PROGRESS). Players take turns rolling the cowries and moving a piece
 * until one player brings all 4 pieces to the centre (FINISHED).
 */
@Data
public class ChowkaRoom {

    public enum Status { WAITING, IN_PROGRESS, FINISHED }

    private String roomId;
    private String hostUsername;
    private Map<String, ChowkaPlayer> players = new LinkedHashMap<>();
    private Status status = Status.WAITING;

    private int maxPlayers = 4;
    private int minPlayers = 2;

    /** Rules. openStart = all pieces begin on the board; otherwise pieces must
     *  be brought out of base with an entry roll (1, 4 or 8). */
    private boolean openStart = false;

    private List<String> turnOrder = new ArrayList<>();
    private int turnPointer;          // index into turnOrder

    /** Per-turn dice state. lastRoll = 0 means "no roll yet this turn". */
    private int lastRoll;
    private boolean awaitingMove;     // a roll happened and a move is required
    private List<Integer> legalPieceIds = new ArrayList<>();

    private String winner;            // set when finished

    /** In-game chat: {id, sender, message, ts}. */
    private List<Map<String, Object>> chat = new ArrayList<>();
    private long chatSeq;

    /** Bot move scheduling (not serialised). */
    private transient ScheduledFuture<?> botTask;

    public ChowkaRoom(String roomId, String hostUsername) {
        this.roomId = roomId;
        this.hostUsername = hostUsername;
    }

    public String currentPlayerName() {
        if (turnOrder.isEmpty()) return null;
        return turnOrder.get(turnPointer % turnOrder.size());
    }

    public ChowkaPlayer currentPlayer() {
        String n = currentPlayerName();
        return n == null ? null : players.get(n);
    }

    public void cancelBotTask() {
        if (botTask != null) { botTask.cancel(false); botTask = null; }
    }
}
