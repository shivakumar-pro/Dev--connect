package com.devconnect.phase10.repository;

import com.devconnect.phase10.model.Phase10Stats;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface Phase10StatsRepository extends JpaRepository<Phase10Stats, Long> {

    Optional<Phase10Stats> findByUsername(String username);

    List<Phase10Stats> findTop10ByOrderByGamesWonDescTotalPhasesClearedDesc();
}
