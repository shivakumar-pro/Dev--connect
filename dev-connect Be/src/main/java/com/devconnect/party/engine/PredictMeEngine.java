package com.devconnect.party.engine;

import com.devconnect.party.model.PartyRoom;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * PREDICT ME:
 * Phase 1: All players answer a question about themselves.
 * Phase 2: Each player predicts what a specific OTHER player answered.
 * Scoring: Correct prediction = +1. Being predicted correctly = +1.
 */
@Component
public class PredictMeEngine implements GameEngine {

    private static final List<String> QUESTIONS = List.of(
            "What would you do with $1 million?",
            "What is your biggest fear?",
            "If you could have dinner with anyone, who?",
            "What superpower would you choose?",
            "What is your guilty pleasure?",
            "What would your dream vacation be?",
            "Cats or Dogs?",
            "What is your favorite season?",
            "Pizza topping of choice?",
            "Favorite social media app?"
    );

    @Override
    public Map<String, Object> onRoundStart(PartyRoom room) {
        int idx = ThreadLocalRandom.current().nextInt(QUESTIONS.size());
        String question = QUESTIONS.get(idx);
        room.getGameData().put("question", question);
        room.getGameData().put("phase", 1);

        return Map.of(
                "phase", 1,
                "question", question,
                "instruction", "Answer this question about yourself!"
        );
    }

    @Override
    public String validateAction(PartyRoom room, String username, Map<String, Object> action) {
        int phase = (int) room.getGameData().getOrDefault("phase", 1);
        if (phase == 1) {
            if (action.get("answer") == null) return "Missing 'answer'";
            return null;
        } else {
            if (action.get("predictions") == null) return "Missing 'predictions'";
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
        room.getGameData().put("phase1Actions", new LinkedHashMap<>(room.getPlayerActions()));
        room.getGameData().put("phase", 2);
        room.getPlayerActions().clear();

        return Map.of(
                "phase", 2,
                "question", room.getGameData().get("question"),
                "players", room.getPlayerUsernames(),
                "instruction", "Predict what each other player answered! Send {predictions: {username: 'your guess', ...}}"
        );
    }

    @Override
    public String validatePhase2Action(PartyRoom room, String username, Map<String, Object> action) {
        return validateAction(room, username, action);
    }

    @Override
    public Map<String, Object> evaluateRound(PartyRoom room) {
        @SuppressWarnings("unchecked")
        Map<String, Object> phase1Actions = (Map<String, Object>) room.getGameData().get("phase1Actions");
        Map<String, Object> phase2Actions = room.getPlayerActions();

        // Get actual answers
        Map<String, String> actualAnswers = new HashMap<>();
        for (Map.Entry<String, Object> e : phase1Actions.entrySet()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> act = (Map<String, Object>) e.getValue();
            actualAnswers.put(e.getKey(), ((String) act.get("answer")).toLowerCase().trim());
        }

        Map<String, Object> playerResults = new LinkedHashMap<>();

        for (String predictor : room.getPlayerUsernames()) {
            Object p2Obj = phase2Actions.get(predictor);
            if (p2Obj == null) {
                playerResults.put(predictor, Map.of("points", 0));
                continue;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> p2 = (Map<String, Object>) p2Obj;
            @SuppressWarnings("unchecked")
            Map<String, String> predictions = (Map<String, String>) p2.get("predictions");
            if (predictions == null) {
                playerResults.put(predictor, Map.of("points", 0));
                continue;
            }

            int points = 0;
            for (Map.Entry<String, String> pred : predictions.entrySet()) {
                String targetPlayer = pred.getKey();
                if (targetPlayer.equals(predictor)) continue;
                String predicted = pred.getValue().toLowerCase().trim();
                String actual = actualAnswers.getOrDefault(targetPlayer, "");
                if (predicted.equals(actual)) {
                    points += 1;
                    // Target also gets a point for being predicted
                    room.getPlayer(targetPlayer).addScore(1);
                }
            }
            room.getPlayer(predictor).addScore(points);
            playerResults.put(predictor, Map.of("points", points));
        }

        return Map.of(
                "actualAnswers", phase1Actions,
                "playerResults", playerResults
        );
    }

    @Override
    public int minPlayers() {
        return 3;
    }
}
