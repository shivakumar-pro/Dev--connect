package com.devconnect.repository;

import com.devconnect.model.UserReadStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserReadStatusRepository extends JpaRepository<UserReadStatus, Long> {

    Optional<UserReadStatus> findByUserIdAndRoomId(Long userId, String roomId);

    List<UserReadStatus> findByUserId(Long userId);
}
