package com.devconnect.repository;

import com.devconnect.model.ChatRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ChatRequestRepository extends JpaRepository<ChatRequest, Long> {

    // By username
    @Query("SELECT cr FROM ChatRequest cr WHERE " +
            "(cr.sender.username = :username1 AND cr.receiver.username = :username2) OR " +
            "(cr.sender.username = :username2 AND cr.receiver.username = :username1)")
    Optional<ChatRequest> findBetweenUsernames(
            @Param("username1") String username1,
            @Param("username2") String username2);

    @Query("SELECT cr FROM ChatRequest cr WHERE " +
            "((cr.sender.username = :username1 AND cr.receiver.username = :username2) OR " +
            "(cr.sender.username = :username2 AND cr.receiver.username = :username1)) " +
            "AND cr.status = 'ACCEPTED'")
    Optional<ChatRequest> findAcceptedBetweenUsernames(
            @Param("username1") String username1,
            @Param("username2") String username2);

    @Query("SELECT cr FROM ChatRequest cr WHERE cr.receiver.username = :username AND cr.status = :status")
    List<ChatRequest> findByReceiverUsernameAndStatus(
            @Param("username") String username,
            @Param("status") ChatRequest.Status status);

    @Query("SELECT cr FROM ChatRequest cr WHERE cr.sender.username = :username AND cr.status = :status")
    List<ChatRequest> findBySenderUsernameAndStatus(
            @Param("username") String username,
            @Param("status") ChatRequest.Status status);

    // Keep ID-based for internal MessageService use
    @Query("SELECT cr FROM ChatRequest cr WHERE " +
            "((cr.sender.id = :userId1 AND cr.receiver.id = :userId2) OR " +
            "(cr.sender.id = :userId2 AND cr.receiver.id = :userId1)) " +
            "AND cr.status = 'ACCEPTED'")
    Optional<ChatRequest> findAcceptedBetweenUsers(@Param("userId1") Long userId1, @Param("userId2") Long userId2);
}
