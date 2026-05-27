package com.devconnect.party.engine;

import com.devconnect.party.model.PartyRoom;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

/**
 * QUICK QUIZ:
 * A question with 4 options. Fastest correct answer wins most points.
 * 1st correct = +3, 2nd = +2, 3rd = +1, wrong = 0.
 */
@Component
public class QuickQuizEngine implements GameEngine {

    private static final List<Map<String, Object>> QUESTIONS = List.of(
            Map.of("q", "What is 12 × 12?", "options", List.of("124", "144", "132", "156"), "answer", "144"),
            Map.of("q", "Which planet is known as the Red Planet?", "options", List.of("Venus", "Mars", "Jupiter", "Saturn"), "answer", "Mars"),
            Map.of("q", "What is the chemical symbol for Gold?", "options", List.of("Go", "Gd", "Au", "Ag"), "answer", "Au"),
            Map.of("q", "In which year did World War II end?", "options", List.of("1943", "1944", "1945", "1946"), "answer", "1945"),
            Map.of("q", "What is the largest mammal?", "options", List.of("Elephant", "Blue Whale", "Giraffe", "Hippo"), "answer", "Blue Whale"),
            Map.of("q", "Who wrote 'Romeo and Juliet'?", "options", List.of("Dickens", "Shakespeare", "Austen", "Twain"), "answer", "Shakespeare"),
            Map.of("q", "What is the square root of 256?", "options", List.of("14", "15", "16", "18"), "answer", "16"),
            Map.of("q", "Which country has the most population?", "options", List.of("USA", "India", "China", "Indonesia"), "answer", "India"),
            Map.of("q", "What does HTTP stand for?", "options", List.of("HyperText Transfer Protocol", "High Tech Transfer Protocol", "HyperText Transmission Program", "High Transfer Text Protocol"), "answer", "HyperText Transfer Protocol"),
            Map.of("q", "How many continents are there?", "options", List.of("5", "6", "7", "8"), "answer", "7")
    );

    @Override
    public Map<String, Object> onRoundStart(PartyRoom room) {
        int idx = ThreadLocalRandom.current().nextInt(QUESTIONS.size());
        Map<String, Object> question = QUESTIONS.get(idx);
        room.getGameData().put("question", question);
        room.getGameData().put("answerOrder", Collections.synchronizedList(new ArrayList<String>()));

        return Map.of(
                "instruction", "Answer as fast as you can!",
                "question", question.get("q"),
                "options", question.get("options")
        );
    }

    @Override
    public String validateAction(PartyRoom room, String username, Map<String, Object> action) {
        String answer = (String) action.get("answer");
        if (answer == null) return "Missing 'answer'";

        // Track answer order for speed bonus
        @SuppressWarnings("unchecked")
        List<String> answerOrder = (List<String>) room.getGameData().get("answerOrder");
        if (!answerOrder.contains(username)) {
            answerOrder.add(username);
        }
        return null;
    }

    @Override
    public Map<String, Object> evaluateRound(PartyRoom room) {
        @SuppressWarnings("unchecked")
        Map<String, Object> question = (Map<String, Object>) room.getGameData().get("question");
        String correctAnswer = (String) question.get("answer");
        @SuppressWarnings("unchecked")
        List<String> answerOrder = (List<String>) room.getGameData().get("answerOrder");

        Map<String, Object> playerResults = new LinkedHashMap<>();
        int rank = 0;

        // Award points by answer order (fastest first)
        for (String player : answerOrder) {
            Object actionObj = room.getPlayerActions().get(player);
            if (actionObj == null) continue;
            @SuppressWarnings("unchecked")
            Map<String, Object> act = (Map<String, Object>) actionObj;
            String answer = (String) act.get("answer");
            boolean correct = correctAnswer.equals(answer);

            int points = 0;
            if (correct) {
                rank++;
                if (rank == 1) points = 3;
                else if (rank == 2) points = 2;
                else if (rank == 3) points = 1;
            }

            room.getPlayer(player).addScore(points);
            playerResults.put(player, Map.of(
                    "answer", answer,
                    "correct", correct,
                    "rank", correct ? rank : 0,
                    "points", points
            ));
        }

        return Map.of(
                "correctAnswer", correctAnswer,
                "playerResults", playerResults
        );
    }
}
