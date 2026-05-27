package com.devconnect.interview.service;

import com.devconnect.interview.model.InterviewLevel;
import com.devconnect.interview.model.InterviewType;
import com.devconnect.interview.model.Question;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * In-memory question bank for mock interviews.
 *
 * Seeded with curated samples per InterviewType. Interviewers can also push
 * custom questions via WebSocket without registering them here.
 *
 * Lookup helpers:
 *   - listAll() / listByType / listByLevel — filtered browse
 *   - random(type, level) — quick "give me one" for the bank tab
 */
@Service
public class QuestionBankService {

    private final Map<String, Question> bank = new ConcurrentHashMap<>();

    @PostConstruct
    public void seed() {
        addQ(InterviewType.DSA, InterviewLevel.JUNIOR,
                "Two Sum",
                "Given an array of integers and a target, return indices of the two numbers that add up to the target.",
                List.of("Input: [2,7,11,15], target=9 -> Output: [0,1]"),
                List.of("Brute force is O(n^2). Can you do better with extra space?",
                        "Try a hash map keyed by value -> index."),
                List.of("array", "hashmap"),
                "function twoSum(nums, target) {\n  // your code\n}", "javascript", 20);

        addQ(InterviewType.DSA, InterviewLevel.MID,
                "Longest Substring Without Repeating Characters",
                "Given a string s, find the length of the longest substring without repeating characters.",
                List.of("Input: \"abcabcbb\" -> Output: 3 (\"abc\")"),
                List.of("Sliding window.", "Track last seen index of each char."),
                List.of("string", "sliding-window"),
                "function lengthOfLongestSubstring(s) {\n  // your code\n}", "javascript", 25);

        addQ(InterviewType.DSA, InterviewLevel.SENIOR,
                "Word Ladder",
                "Given two words and a dictionary, find the shortest transformation sequence from beginWord to endWord.",
                List.of("beginWord=\"hit\", endWord=\"cog\", wordList=[\"hot\",\"dot\",\"dog\",\"lot\",\"log\",\"cog\"] -> 5"),
                List.of("Model as graph. BFS from beginWord.",
                        "Bidirectional BFS for speedup."),
                List.of("graph", "bfs"),
                "function ladderLength(beginWord, endWord, wordList) {\n  // your code\n}", "javascript", 35);

        addQ(InterviewType.CODING, InterviewLevel.MID,
                "LRU Cache",
                "Design and implement an LRU (Least Recently Used) cache with O(1) get/put.",
                List.of("capacity=2; put(1,1) put(2,2) get(1)=1 put(3,3) get(2)=-1"),
                List.of("HashMap + Doubly Linked List."),
                List.of("design", "hashmap", "linked-list"),
                "class LRUCache {\n  constructor(capacity) {}\n  get(key) {}\n  put(key, value) {}\n}", "javascript", 30);

        addQ(InterviewType.SYSTEM_DESIGN, InterviewLevel.SENIOR,
                "Design URL Shortener (TinyURL)",
                "Design a URL shortening service. Discuss API, storage, hashing, scaling, analytics, and rate limiting.",
                List.of(),
                List.of("Estimate QPS and storage first.",
                        "Consider counter vs hash-based key generation.",
                        "Read-heavy: cache hot URLs."),
                List.of("system-design", "scalability"),
                "", "markdown", 45);

        addQ(InterviewType.SYSTEM_DESIGN, InterviewLevel.SENIOR,
                "Design WhatsApp",
                "Design a real-time messaging service supporting 1:1, groups, presence, and media. Cover protocols, storage, fan-out, and offline delivery.",
                List.of(),
                List.of("Long-lived connections vs polling.",
                        "Per-conversation sharding.",
                        "Discuss end-to-end encryption tradeoffs."),
                List.of("system-design", "messaging"),
                "", "markdown", 50);

        addQ(InterviewType.LOW_LEVEL_DESIGN, InterviewLevel.MID,
                "Design a Parking Lot",
                "Provide class diagram and key methods for a parking lot with multiple vehicle types and floors.",
                List.of(),
                List.of("Identify entities first.",
                        "Strategy for spot allocation."),
                List.of("oop", "design"),
                "", "java", 40);

        addQ(InterviewType.BEHAVIORAL, InterviewLevel.MID,
                "Tell me about a time you handled a conflict in a team",
                "Use STAR (Situation, Task, Action, Result). Be specific and quantitative.",
                List.of(),
                List.of("Pick a real, recent example.",
                        "Focus on what YOU did, not the team."),
                List.of("behavioral", "leadership"),
                "", "markdown", 8);

        addQ(InterviewType.BEHAVIORAL, InterviewLevel.SENIOR,
                "Describe a time you disagreed with your manager",
                "Walk through how you raised the disagreement, the resolution, and what you learned.",
                List.of(),
                List.of("Show maturity — disagree and commit.",
                        "End with a measurable outcome."),
                List.of("behavioral", "communication"),
                "", "markdown", 10);

        addQ(InterviewType.HR, InterviewLevel.JUNIOR,
                "Why do you want to work here?",
                "Connect your career goals to the company's mission, recent products, or engineering culture.",
                List.of(),
                List.of("Reference a specific team / product.",
                        "Avoid generic answers."),
                List.of("hr"),
                "", "markdown", 5);

        addQ(InterviewType.FRONTEND, InterviewLevel.MID,
                "Build a debounced search input",
                "Implement a search input that debounces user typing and fetches suggestions, handling race conditions.",
                List.of(),
                List.of("Cancel previous in-flight request.",
                        "AbortController is your friend."),
                List.of("frontend", "react", "javascript"),
                "function SearchBox() {\n  // your code\n}", "javascript", 25);

        addQ(InterviewType.FRONTEND, InterviewLevel.SENIOR,
                "Design a virtualized list (windowing)",
                "Render a list of 100k items smoothly. Discuss layout, scroll handling, recycling.",
                List.of(),
                List.of("Compute visible range from scrollTop and itemHeight.",
                        "Variable height? IntersectionObserver helps."),
                List.of("frontend", "performance"),
                "", "javascript", 35);

        addQ(InterviewType.BACKEND, InterviewLevel.MID,
                "Design REST endpoints for a blog",
                "Cover CRUD for posts and comments, pagination, auth, and validation.",
                List.of(),
                List.of("Resource naming.",
                        "Cursor vs offset pagination."),
                List.of("backend", "rest"),
                "", "java", 25);

        addQ(InterviewType.BACKEND, InterviewLevel.SENIOR,
                "Implement a rate limiter",
                "Token bucket vs leaky bucket vs fixed window — implement one and discuss tradeoffs.",
                List.of(),
                List.of("Distributed? Use Redis with Lua.",
                        "Beware clock skew."),
                List.of("backend", "concurrency"),
                "class RateLimiter {\n  // your code\n}", "java", 35);

        addQ(InterviewType.DEVOPS, InterviewLevel.MID,
                "Zero-downtime deploy strategy",
                "Compare blue/green, canary, and rolling deploys. Pick one for a 50-pod service.",
                List.of(),
                List.of("Health checks matter.",
                        "Database migrations should be backwards compatible."),
                List.of("devops", "kubernetes"),
                "", "markdown", 25);

        addQ(InterviewType.DATABASE, InterviewLevel.MID,
                "SQL: Top N per group",
                "Given orders(user_id, amount, created_at), return each user's 3 largest orders.",
                List.of(),
                List.of("ROW_NUMBER() OVER PARTITION BY user_id ORDER BY amount DESC."),
                List.of("sql", "window-functions"),
                "-- your query", "sql", 15);

        addQ(InterviewType.MACHINE_LEARNING, InterviewLevel.MID,
                "Bias-variance tradeoff",
                "Explain bias vs variance. How would you diagnose each and what would you do about it?",
                List.of(),
                List.of("Plot learning curves.",
                        "Regularization, more data, model complexity."),
                List.of("ml", "theory"),
                "", "markdown", 15);

        addQ(InterviewType.PRODUCT_MANAGEMENT, InterviewLevel.MID,
                "Estimate the number of pianos in your city",
                "Walk me through a Fermi estimation. Show your assumptions clearly.",
                List.of(),
                List.of("Population -> households -> piano-owning households.",
                        "Sanity-check at the end."),
                List.of("pm", "estimation"),
                "", "markdown", 15);
    }

    private void addQ(InterviewType type, InterviewLevel level, String title, String desc,
                      List<String> examples, List<String> hints, List<String> tags,
                      String starter, String lang, int minutes) {
        Question q = Question.builder()
                .id(UUID.randomUUID().toString().substring(0, 8))
                .type(type)
                .level(level)
                .title(title)
                .description(desc)
                .examples(examples == null ? List.of() : examples)
                .hints(hints == null ? List.of() : hints)
                .tags(tags == null ? List.of() : tags)
                .starterCode(starter == null ? "" : starter)
                .language(lang == null ? "javascript" : lang)
                .recommendedTimeMinutes(minutes)
                .build();
        bank.put(q.getId(), q);
    }

    public Question get(String id) {
        return bank.get(id);
    }

    public List<Question> listAll() {
        return new ArrayList<>(bank.values());
    }

    public List<Question> list(InterviewType type, InterviewLevel level, String tag) {
        return bank.values().stream()
                .filter(q -> type == null || q.getType() == type)
                .filter(q -> level == null || q.getLevel() == level)
                .filter(q -> tag == null || (q.getTags() != null && q.getTags().contains(tag)))
                .collect(Collectors.toList());
    }

    public Question random(InterviewType type, InterviewLevel level) {
        List<Question> filtered = list(type, level, null);
        if (filtered.isEmpty()) return null;
        return filtered.get(new Random().nextInt(filtered.size()));
    }
}
