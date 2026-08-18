package com.cmc.restaurant.loyalty;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoyaltyMemberRepository extends JpaRepository<LoyaltyMemberEntity, String> {

	Optional<LoyaltyMemberEntity> findByPhoneNumber(String phoneNumber);
}
