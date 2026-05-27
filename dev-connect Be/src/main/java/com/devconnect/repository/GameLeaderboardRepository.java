package com.devconnect.repository;

import com.devconnect.model.GameLeaderboard;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GameLeaderboardRepository extends JpaRepository<GameLeaderboard, Long> {

    Optional<GameLeaderboard> findByUsername(String username);

    List<GameLeaderboard> findAllByOrderByWinsDesc();

    List<GameLeaderboard> findTop10ByOrderByWinsDesc();
}
