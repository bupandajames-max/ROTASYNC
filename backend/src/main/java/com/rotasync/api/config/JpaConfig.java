package com.rotasync.api.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * Pins the transaction advisor's order to 0 so TenantTransactionAspect
 * (@Order(100)) is guaranteed to run INSIDE the open transaction. Without an
 * explicit order both advisors default to lowest precedence and their nesting
 * is undefined — if the aspect ran before the transaction opened, the tenant
 * filter and set_config would bind to the wrong session/connection.
 */
@Configuration
@EnableTransactionManagement(order = 0)
public class JpaConfig {
}
