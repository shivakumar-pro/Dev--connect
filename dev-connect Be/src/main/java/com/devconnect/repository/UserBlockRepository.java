package com.devconnect.repository;

import com.devconnect.model.UserBlock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserBlockRepository extends JpaRepository<UserBlock, Long> {

    // By username
    @Query("SELECT b FROM UserBlock b WHERE b.blocker.username = :blockerUsername AND b.blocked.username = :blockedUsername")
    Optional<UserBlock> findByBlockerUsernameAndBlockedUsername(
            @Param("blockerUsername") String blockerUsername,
            @Param("blockedUsername") String blockedUsername);

    @Query("SELECT CASE WHEN COUNT(b) > 0 THEN true ELSE false END FROM UserBlock b " +
            "WHERE b.blocker.username = :blockerUsername AND b.blocked.username = :blockedUsername")
    boolean existsByBlockerUsernameAndBlockedUsername(
            @Param("blockerUsername") String blockerUsername,
            @Param("blockedUsername") String blockedUsername);

    @Query("SELECT CASE WHEN COUNT(b) > 0 THEN true ELSE false END FROM UserBlock b " +
            "WHERE (b.blocker.username = :username1 AND b.blocked.username = :username2) " +
            "OR (b.blocker.username = :username2 AND b.blocked.username = :username1)")
    boolean existsBlockBetweenUsernames(
            @Param("username1") String username1,
            @Param("username2") String username2);

    @Query("SELECT b FROM UserBlock b WHERE b.blocker.username = :blockerUsername")
    List<UserBlock> findByBlockerUsername(@Param("blockerUsername") String blockerUsername);

    @Query("DELETE FROM UserBlock b WHERE b.blocker.username = :blockerUsername AND b.blocked.username = :blockedUsername")
    void deleteByBlockerUsernameAndBlockedUsername(
            @Param("blockerUsername") String blockerUsername,
            @Param("blockedUsername") String blockedUsername);

    // Keep ID-based for internal use in MessageService
    boolean existsByBlockerIdAndBlockedId(Long blockerId, Long blockedId);

    @Query("SELECT CASE WHEN COUNT(b) > 0 THEN true ELSE false END FROM UserBlock b " +
            "WHERE (b.blocker.id = :userId1 AND b.blocked.id = :userId2) " +
            "OR (b.blocker.id = :userId2 AND b.blocked.id = :userId1)")
    boolean existsBlockBetween(@Param("userId1") Long userId1, @Param("userId2") Long userId2);
}
