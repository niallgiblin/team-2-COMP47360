package com.manhattan.busyness_predictor.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.manhattan.busyness_predictor.model.Shared;

@Repository
public interface SharedRepository extends JpaRepository<Shared, Long> {

    List<Shared> findByReceiverIdOrderBySharedAtDesc(Long receiverId);

    List<Shared> findBySenderIdOrderBySharedAtDesc(Long senderId);
}