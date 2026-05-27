package com.devconnect.repository;

import com.devconnect.model.Message;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface MessageRepository extends JpaRepository<Message, Long> {
    
    List<Message> findByRoomIdOrderByCreatedAtDesc(String roomId, Pageable pageable);

    @Query("SELECT m FROM Message m WHERE m.roomId = :roomId AND m.createdAt > :since ORDER BY m.createdAt DESC")
    List<Message> findByRoomIdAfterTimestamp(@Param("roomId") String roomId,
                                             @Param("since") LocalDateTime since,
                                             Pageable pageable);

    void deleteByRoomId(String roomId);
    
    List<Message> findByRoomIdAndIdLessThanOrderByCreatedAtDesc(String roomId, Long id, Pageable pageable);
    
    @org.springframework.data.jpa.repository.Query("SELECT m FROM Message m WHERE m.roomType = 'PRIVATE' AND (m.roomId LIKE CONCAT(:userIdStr, '-%') OR m.roomId LIKE CONCAT('%-', :userIdStr))")
    List<Message> findPrivateMessagesByUserId(@org.springframework.data.repository.query.Param("userIdStr") String userIdStr);

    @org.springframework.data.jpa.repository.Query("SELECT m FROM Message m WHERE m.sender.id = :userId OR " +
            "(m.roomType = 'GLOBAL') OR " +
            "(m.roomType = 'PRIVATE' AND (m.roomId LIKE CONCAT(:userIdStr, '-%') OR m.roomId LIKE CONCAT('%-', :userIdStr))) OR " +
            "(m.roomType = 'GROUP' AND m.roomId IN :groupRoomIds) " +
            "ORDER BY m.createdAt DESC")
    List<Message> findAllUserMessages(
            @org.springframework.data.repository.query.Param("userId") Long userId,
            @org.springframework.data.repository.query.Param("userIdStr") String userIdStr,
            @org.springframework.data.repository.query.Param("groupRoomIds") List<String> groupRoomIds,
            Pageable pageable);

    @Query("SELECT COUNT(m) FROM Message m WHERE m.roomId = :roomId AND m.createdAt > :since AND m.sender.id != :userId")
    long countUnreadInRoom(@Param("roomId") String roomId,
                           @Param("since") LocalDateTime since,
                           @Param("userId") Long userId);

    @Query("SELECT m.roomId, COUNT(m) FROM Message m WHERE m.roomId IN :roomIds AND m.createdAt > :since AND m.sender.id != :userId GROUP BY m.roomId")
    List<Object[]> countUnreadPerRoom(@Param("roomIds") List<String> roomIds,
                                       @Param("since") LocalDateTime since,
                                       @Param("userId") Long userId);
}
