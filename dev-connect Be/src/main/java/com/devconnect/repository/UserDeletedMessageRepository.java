package com.devconnect.repository;

import com.devconnect.model.UserDeletedMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Set;

@Repository
public interface UserDeletedMessageRepository extends JpaRepository<UserDeletedMessage, Long> {

    boolean existsByUserIdAndMessageId(Long userId, Long messageId);

    @Query("SELECT d.messageId FROM UserDeletedMessage d WHERE d.userId = :userId")
    Set<Long> findDeletedMessageIdsByUserId(@Param("userId") Long userId);
}
