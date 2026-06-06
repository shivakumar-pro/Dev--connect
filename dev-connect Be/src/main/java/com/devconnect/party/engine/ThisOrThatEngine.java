package com.devconnect.party.engine;

import com.devconnect.party.model.PartyRoom;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * THIS OR THAT:
 * Phase 1: Question with 2 options. All players choose one.
 * Phase 2: Players predict what the majority chose.
 * Scoring: Same as majority = +1, correct prediction = +2.
 */
@Component
public class ThisOrThatEngine implements GameEngine {

    private static final List<Map<String, Object>> QUESTIONS = List.of(
            // ── classics
            Map.of("q", "Coffee or Tea?", "options", List.of("Coffee", "Tea")),
            Map.of("q", "Mountains or Beach?", "options", List.of("Mountains", "Beach")),
            Map.of("q", "Dogs or Cats?", "options", List.of("Dogs", "Cats")),
            Map.of("q", "Morning or Night?", "options", List.of("Morning", "Night")),
            Map.of("q", "Pizza or Burger?", "options", List.of("Pizza", "Burger")),
            Map.of("q", "Marvel or DC?", "options", List.of("Marvel", "DC")),
            Map.of("q", "Summer or Winter?", "options", List.of("Summer", "Winter")),
            Map.of("q", "Books or Movies?", "options", List.of("Books", "Movies")),
            Map.of("q", "Android or iPhone?", "options", List.of("Android", "iPhone")),
            Map.of("q", "Chocolate or Vanilla?", "options", List.of("Chocolate", "Vanilla")),
            Map.of("q", "Music or Podcasts?", "options", List.of("Music", "Podcasts")),
            Map.of("q", "Travel or Stay Home?", "options", List.of("Travel", "Stay Home")),
            Map.of("q", "Sweet or Salty?", "options", List.of("Sweet", "Salty")),
            Map.of("q", "Early Bird or Night Owl?", "options", List.of("Early Bird", "Night Owl")),
            Map.of("q", "City or Countryside?", "options", List.of("City", "Countryside")),

            // ── superpowers & hypotheticals
            Map.of("q", "Read minds or Be invisible?", "options", List.of("Read minds", "Be invisible")),
            Map.of("q", "Teleport anywhere or Time travel?", "options", List.of("Teleport", "Time travel")),
            Map.of("q", "Fly or Breathe underwater?", "options", List.of("Fly", "Breathe underwater")),
            Map.of("q", "Live forever or Be unbelievably rich?", "options", List.of("Live forever", "Unbelievably rich")),
            Map.of("q", "Speak every language or Play every instrument?", "options", List.of("Every language", "Every instrument")),
            Map.of("q", "Know how you die or Know when you die?", "options", List.of("How", "When")),
            Map.of("q", "Be famous or Be powerful?", "options", List.of("Famous", "Powerful")),
            Map.of("q", "Always lucky or Always loved?", "options", List.of("Always lucky", "Always loved")),

            // ── modern life dilemmas
            Map.of("q", "Lose your phone or Lose your wallet?", "options", List.of("Phone", "Wallet")),
            Map.of("q", "Wi-Fi or Air conditioning?", "options", List.of("Wi-Fi", "AC")),
            Map.of("q", "No social media for a year or No music for a month?", "options", List.of("No social media", "No music")),
            Map.of("q", "Work from home forever or Office every day?", "options", List.of("WFH forever", "Office daily")),
            Map.of("q", "Inbox zero or Notifications zero?", "options", List.of("Inbox zero", "Notifications zero")),
            Map.of("q", "Dark mode or Light mode?", "options", List.of("Dark mode", "Light mode")),
            Map.of("q", "Tabs or Spaces?", "options", List.of("Tabs", "Spaces")),
            Map.of("q", "Voice note or Long text?", "options", List.of("Voice note", "Long text")),
            Map.of("q", "Group chats muted or Read every message?", "options", List.of("Muted", "Read all")),
            Map.of("q", "ChatGPT or Google?", "options", List.of("ChatGPT", "Google")),

            // ── food fights
            Map.of("q", "Pineapple on pizza — yes or no?", "options", List.of("Yes", "No")),
            Map.of("q", "Ketchup or Mayo?", "options", List.of("Ketchup", "Mayo")),
            Map.of("q", "Veg biryani or Chicken biryani?", "options", List.of("Veg biryani", "Chicken biryani")),
            Map.of("q", "Dosa or Idli?", "options", List.of("Dosa", "Idli")),
            Map.of("q", "Filter coffee or Espresso?", "options", List.of("Filter coffee", "Espresso")),
            Map.of("q", "Ice cream in winter or Hot chai in summer?", "options", List.of("Ice cream", "Hot chai")),
            Map.of("q", "Crispy or Chewy cookies?", "options", List.of("Crispy", "Chewy")),
            Map.of("q", "Cook at home or Order in?", "options", List.of("Cook at home", "Order in")),

            // ── personality probes
            Map.of("q", "Plan everything or Go with the flow?", "options", List.of("Plan everything", "Go with the flow")),
            Map.of("q", "Lead the team or Be the wildcard?", "options", List.of("Lead", "Wildcard")),
            Map.of("q", "Talk it out or Write it down?", "options", List.of("Talk", "Write")),
            Map.of("q", "Save first or Spend now?", "options", List.of("Save first", "Spend now")),
            Map.of("q", "Loud party or Quiet dinner?", "options", List.of("Loud party", "Quiet dinner")),
            Map.of("q", "Surprise gift or Cash?", "options", List.of("Surprise gift", "Cash")),
            Map.of("q", "Compliment or Honest feedback?", "options", List.of("Compliment", "Honest feedback")),
            Map.of("q", "Risk it or Play safe?", "options", List.of("Risk it", "Play safe")),

            // ── pop culture & lifestyle
            Map.of("q", "Cricket or Football?", "options", List.of("Cricket", "Football")),
            Map.of("q", "Netflix or YouTube?", "options", List.of("Netflix", "YouTube")),
            Map.of("q", "Anime or K-Drama?", "options", List.of("Anime", "K-Drama")),
            Map.of("q", "Spotify or YouTube Music?", "options", List.of("Spotify", "YouTube Music")),
            Map.of("q", "Reels or Shorts?", "options", List.of("Reels", "Shorts")),
            Map.of("q", "Open-world or Story-driven games?", "options", List.of("Open-world", "Story-driven")),
            Map.of("q", "Stand-up comedy or A live concert?", "options", List.of("Stand-up", "Concert")),
            Map.of("q", "Road trip or Flight?", "options", List.of("Road trip", "Flight")),

            // ── awkward little forks
            Map.of("q", "Always 10 mins early or Always 10 mins late?", "options", List.of("10 mins early", "10 mins late")),
            Map.of("q", "Reply instantly or Reply after hours?", "options", List.of("Instantly", "After hours")),
            Map.of("q", "Take the window seat or The aisle?", "options", List.of("Window", "Aisle")),
            Map.of("q", "Toilet paper — over or under?", "options", List.of("Over", "Under")),
            Map.of("q", "Shower in morning or Shower at night?", "options", List.of("Morning", "Night")),
            Map.of("q", "Watch the movie or Read the book first?", "options", List.of("Movie first", "Book first")),
            Map.of("q", "Spoilers OK or Strictly no spoilers?", "options", List.of("Spoilers OK", "No spoilers")),
            Map.of("q", "Talk on the call or Text only?", "options", List.of("Call", "Text only")),

            // ── playful would-you-rathers
            Map.of("q", "No internet for a week or No AC for a month?", "options", List.of("No internet", "No AC")),
            Map.of("q", "Win a small lottery or Get a dream job?", "options", List.of("Small lottery", "Dream job")),
            Map.of("q", "Be 10 years younger or Be 10 years older?", "options", List.of("10 yrs younger", "10 yrs older")),
            Map.of("q", "Live on Mars or Deep under the ocean?", "options", List.of("Mars", "Under the ocean")),
            Map.of("q", "Skip breakfast or Skip dinner?", "options", List.of("Skip breakfast", "Skip dinner")),
            Map.of("q", "Be funny or Be smart?", "options", List.of("Funny", "Smart"))
    );

    @Override
    public Map<String, Object> onRoundStart(PartyRoom room) {
        int idx = ThreadLocalRandom.current().nextInt(QUESTIONS.size());
        Map<String, Object> question = QUESTIONS.get(idx);
        room.getGameData().put("question", question);
        room.getGameData().put("phase", 1);

        return Map.of(
                "phase", 1,
                "instruction", "Choose one!",
                "question", question.get("q"),
                "options", question.get("options")
        );
    }

    @Override
    public String validateAction(PartyRoom room, String username, Map<String, Object> action) {
        int phase = (int) room.getGameData().getOrDefault("phase", 1);
        if (phase == 1) {
            String choice = (String) action.get("choice");
            if (choice == null) return "Missing 'choice'";
            @SuppressWarnings("unchecked")
            Map<String, Object> question = (Map<String, Object>) room.getGameData().get("question");
            @SuppressWarnings("unchecked")
            List<String> options = (List<String>) question.get("options");
            if (!options.contains(choice)) return "Invalid choice";
            return null;
        } else {
            String prediction = (String) action.get("prediction");
            if (prediction == null) return "Missing 'prediction'";
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

        @SuppressWarnings("unchecked")
        Map<String, Object> question = (Map<String, Object>) room.getGameData().get("question");

        return Map.of(
                "phase", 2,
                "instruction", "Predict what the MAJORITY chose!",
                "question", question.get("q"),
                "options", question.get("options")
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

        // Count choices
        Map<String, Integer> choiceCounts = new HashMap<>();
        for (Object act : phase1Actions.values()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> a = (Map<String, Object>) act;
            String choice = (String) a.get("choice");
            choiceCounts.merge(choice, 1, Integer::sum);
        }

        // Find majority
        String majority = choiceCounts.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse("");

        Map<String, Object> playerResults = new LinkedHashMap<>();

        for (String player : room.getPlayerUsernames()) {
            int points = 0;

            // +1 if chose same as majority
            @SuppressWarnings("unchecked")
            Map<String, Object> p1 = phase1Actions.get(player) != null ? (Map<String, Object>) phase1Actions.get(player) : Map.of();
            String playerChoice = (String) p1.getOrDefault("choice", "");
            if (playerChoice.equals(majority)) {
                points += 1;
            }

            // +2 if predicted majority correctly
            @SuppressWarnings("unchecked")
            Map<String, Object> p2 = phase2Actions.get(player) != null ? (Map<String, Object>) phase2Actions.get(player) : Map.of();
            String prediction = (String) p2.getOrDefault("prediction", "");
            if (prediction.equals(majority)) {
                points += 2;
            }

            room.getPlayer(player).addScore(points);
            playerResults.put(player, Map.of(
                    "choice", playerChoice,
                    "prediction", prediction,
                    "points", points
            ));
        }

        return Map.of(
                "majority", majority,
                "choiceCounts", choiceCounts,
                "playerResults", playerResults
        );
    }
}
