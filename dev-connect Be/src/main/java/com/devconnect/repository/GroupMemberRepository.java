package com.devconnect.repository;

import com.devconnect.model.GroupMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GroupMemberRepository extends JpaRepository<GroupMember, Long> {
    
    List<GroupMember> findByUserId(Long userId);
    
    List<GroupMember> findByGroupId(Long groupId);
    
    Optional<GroupMember> findByGroupIdAndUserId(Long groupId, Long userId);
    
    boolean existsByGroupIdAndUserId(Long groupId, Long userId);

    void deleteByGroupId(Long groupId);
}
