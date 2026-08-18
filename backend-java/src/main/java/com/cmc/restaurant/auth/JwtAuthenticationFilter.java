package com.cmc.restaurant.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

	private final JwtService jwtService;

	public JwtAuthenticationFilter(JwtService jwtService) {
		this.jwtService = jwtService;
	}

	@Override
	protected void doFilterInternal(
			@NonNull HttpServletRequest request,
			@NonNull HttpServletResponse response,
			@NonNull FilterChain filterChain) throws ServletException, IOException {

		String header = request.getHeader("Authorization");
		if (header != null && header.startsWith("Bearer ")) {
			jwtService.parseToken(header.substring("Bearer ".length()))
					.ifPresent(user -> {
						var principal = new AuthenticatedPrincipal(
								user.userId(), user.fullName(), user.email(), user.role());
						var authorities = List.of(new SimpleGrantedAuthority("ROLE_" + user.role()));
						var authentication =
								new UsernamePasswordAuthenticationToken(principal, null, authorities);
						SecurityContextHolder.getContext().setAuthentication(authentication);
					});
		}

		filterChain.doFilter(request, response);
	}
}
