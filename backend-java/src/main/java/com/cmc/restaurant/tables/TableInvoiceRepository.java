package com.cmc.restaurant.tables;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TableInvoiceRepository extends JpaRepository<TableInvoiceEntity, String> {

	Optional<TableInvoiceEntity> findByTableSessionId(String tableSessionId);
}
