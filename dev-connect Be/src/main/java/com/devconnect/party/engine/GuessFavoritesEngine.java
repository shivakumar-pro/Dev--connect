package com.devconnect.party.engine;

import com.devconnect.party.model.PartyRoom;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * GUESS FAVORITES:
 * Phase 1: One "target" player answers a question about themselves.
 * Phase 2: Others guess what the target answered.
 * Scoring: Exact match = +2, target gets +1 per correct guesser.
 */
@Component
public class GuessFavoritesEngine implements GameEngine {

    private static final List<String> QUESTIONS = List.of(
            "What is your favorite food?",
            "What is your favorite movie?",
            "What is your favorite place to visit?",
            "What is your favorite color?",
            "What is your favorite song?",
            "What is your dream job?",
            "What is your favorite hobby?",
            "What is your favorite animal?",
            "What is your favorite sport?",
            "What is your go-to comfort food?"
    );

    @Override
    public Map<String, Object> onRoundStart(PartyRoom room) {
        List<String> players = room.getPlayerUsernames();
        int round = room.getCurrentRound();
        String target = players.get((round - 1) % players.size());
        int qIdx = ThreadLocalRandom.current().nextInt(QUESTIONS.size());

        room.getGameData().put("targetPlayer", target);
        room.getGameData().put("question", QUESTIONS.get(qIdx));
        room.getGameData().put("phase", 1);

        return Map.of(
                "phase", 1,
                "targetPlayer", target,
                "question", QUESTIONS.get(qIdx),
                "instruction", target + " must answer the question. Others wait."
        );
    }

    @Override
    public String validateAction(PartyRoom room, String username, Map<String, Object> action) {
        int phase = (int) room.getGameData().getOrDefault("phase", 1);
        String target = (String) room.getGameData().get("targetPlayer");

        if (phase == 1) {
            if (!username.equals(target)) return "Only " + target + " can answer in phase 1";
            if (action.get("answer") == null) return "Missing 'answer'";
            return null;
        } else {
            if (username.equals(target)) return "Target player cannot guess";
            if (action.get("guess") == null) return "Missing 'guess'";
            return null;
        }
    }

    @Override
    public boolean hasSecondPhase(PartyRoom room) {
        int phase = (int) room.getGameData().getOrDefault("phase", 1);
        return phase == 1;
    }

    @Override
    public Map<String, Object> onPhase2Start(PartyRoom room) {
        Map<String, Object> phase1Actions = new LinkedHashMap<>(room.getPlayerActions());
        room.getGameData().put("phase1Actions", phase1Actions);
        room.getGameData().put("phase", 2);
        room.getPlayerActions().clear();

        String target = (String) room.getGameData().get("targetPlayer");
        String question = (String) room.getGameData().get("question");

        return Map.of(
                "phase", 2,
                "targetPlayer", target,
                "question", question,
                "instruction", "Guess what " + target + " answered!"
        );
    }

    @Override
    public String validatePhase2Action(PartyRoom room, String username, Map<String, Object> action) {
        return validateAction(room, username, action);
    }

    @Override
    public Map<String, Object> evaluateRound(PartyRoom room) {
        String target = (String) room.getGameData().get("targetPlayer");
        @SuppressWarnings("unchecked")
        Map<String, Object> phase1Actions = (Map<String, Object>) room.getGameData().get("phase1Actions");
        @SuppressWarnings("unchecked")
        Map<String, Object> targetAction = (Map<String, Object>) phase1Actions.get(target);
        String correctAnswer = targetAction != null ? ((String) targetAction.get("answer")).toLowerCase().trim() : "";

        Map<String, Object> phase2Actions = room.getPlayerActions();
        Map<String, Object> playerResults = new LinkedHashMap<>();
        int correctGuessers = 0;

        for (Map.Entry<String, Object> entry : phase2Actions.entrySet()) {
            String player = entry.getKey();
            @SuppressWarnings("unchecked")
            Map<String, Object> act = (Map<String, Object>) entry.getValue();
            String guess = ((String) act.get("guess")).toLowerCase().trim();
            boolean correct = guess.equals(correctAnswer);
            int points = correct ? 2 : 0;
            if (correct) correctGuessers++;

            room.getPlayer(player).addScore(points);
            playerResults.put(player, Map.of("guess", act.get("guess"), "correct", correct, "points", points));
        }

        // Target gets +1 per correct guesser
        room.getPlayer(target).addScore(correctGuessers);
        playerResults.put(target, Map.of("wasTarget", true, "points", correctGuessers));

        return Map.of(
                "targetPlayer", target,
                "correctAnswer", targetAction != null ? targetAction.get("answer") : "",
                "playerResults", playerResults
        );
    }

    @Override
    public int minPlayers() {
        return 3;
    }
}
